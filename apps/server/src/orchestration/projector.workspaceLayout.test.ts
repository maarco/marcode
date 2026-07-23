/**
 * Focused, in-memory coverage for the workspace-layout branches of
 * `projectEvent` (the pure read-model reducer used both by the decider's
 * within-batch read model and, structurally, mirrored by the SQL-backed
 * projection pipeline). Covers initialization on `project.created`, applying
 * every `project.workspace-layout-applied` operation, and the two lifecycle
 * -pruning paths (`thread.deleted`, `project.meta-updated` dropping a
 * script).
 */
import {
  CommandId,
  EventId,
  type OrchestrationEvent,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { createEmptyReadModel, projectEvent } from "./projector.ts";

const now = "2026-01-01T00:00:00.000Z";
let sequence = 0;
function nextSequence(): number {
  sequence += 1;
  return sequence;
}

function projectCreatedEvent(projectId: string): OrchestrationEvent {
  return {
    sequence: nextSequence(),
    eventId: EventId.make(`evt-create-${projectId}`),
    aggregateKind: "project",
    aggregateId: ProjectId.make(projectId),
    type: "project.created",
    occurredAt: now,
    commandId: CommandId.make(`cmd-create-${projectId}`),
    causationEventId: null,
    correlationId: CommandId.make(`cmd-create-${projectId}`),
    metadata: {},
    payload: {
      projectId: ProjectId.make(projectId),
      title: "Project",
      workspaceRoot: `/tmp/${projectId}`,
      defaultModelSelection: null,
      scripts: [],
      createdAt: now,
      updatedAt: now,
    },
  };
}

function threadCreatedEvent(threadId: string, projectId: string): OrchestrationEvent {
  return {
    sequence: nextSequence(),
    eventId: EventId.make(`evt-create-${threadId}`),
    aggregateKind: "thread",
    aggregateId: ThreadId.make(threadId),
    type: "thread.created",
    occurredAt: now,
    commandId: CommandId.make(`cmd-create-${threadId}`),
    causationEventId: null,
    correlationId: CommandId.make(`cmd-create-${threadId}`),
    metadata: {},
    payload: {
      threadId: ThreadId.make(threadId),
      projectId: ProjectId.make(projectId),
      title: "Thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" },
      runtimeMode: "full-access",
      branch: null,
      worktreePath: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function workspaceLayoutAppliedEvent(
  projectId: string,
  operation: Extract<
    OrchestrationEvent,
    { type: "project.workspace-layout-applied" }
  >["payload"]["operation"],
  layoutVersion: number,
): OrchestrationEvent {
  return {
    sequence: nextSequence(),
    eventId: EventId.make(`evt-layout-${layoutVersion}-${projectId}`),
    aggregateKind: "project",
    aggregateId: ProjectId.make(projectId),
    type: "project.workspace-layout-applied",
    occurredAt: now,
    commandId: CommandId.make(`cmd-layout-${layoutVersion}-${projectId}`),
    causationEventId: null,
    correlationId: CommandId.make(`cmd-layout-${layoutVersion}-${projectId}`),
    metadata: {},
    payload: { projectId: ProjectId.make(projectId), operation, layoutVersion, updatedAt: now },
  };
}

it("project.created initializes workspaceLayoutVersion 0 and an empty layout", () =>
  Effect.gen(function* () {
    const model = yield* projectEvent(createEmptyReadModel(now), projectCreatedEvent("project-1"));
    expect(model.projects[0]?.workspaceLayoutVersion).toBe(0);
    expect(model.projects[0]?.workspaceLayout).toEqual([]);
  }).pipe(Effect.runPromise));

it("applies attach-path, add-url, and place-resource by appending entries and bumping the version", () =>
  Effect.gen(function* () {
    let model = createEmptyReadModel(now);
    model = yield* projectEvent(model, projectCreatedEvent("project-1"));
    model = yield* projectEvent(model, threadCreatedEvent("thread-1", "project-1"));

    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        {
          type: "attach-path",
          entry: { kind: "folder", id: "folder-1", parentId: null, rank: "a", relativePath: "src" },
        },
        1,
      ),
    );
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        {
          type: "add-url",
          entry: { kind: "url", id: "url-1", parentId: null, rank: "b", label: "Local", url: "http://localhost:3000" },
        },
        2,
      ),
    );
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        {
          type: "place-resource",
          resource: { kind: "thread", threadId: ThreadId.make("thread-1") },
          parentId: "folder-1",
          beforeId: null,
        },
        3,
      ),
    );

    const project = model.projects[0]!;
    expect(project.workspaceLayoutVersion).toBe(3);
    expect(project.workspaceLayout.map((entry) => entry.id).toSorted()).toEqual(
      ["folder-1", "thread:thread-1", "url-1"].toSorted(),
    );
    const placedThread = project.workspaceLayout.find((entry) => entry.id === "thread:thread-1");
    expect(placedThread?.parentId).toBe("folder-1");
  }).pipe(Effect.runPromise));

it("applies move, rename, and remove (with child reparenting)", () =>
  Effect.gen(function* () {
    let model = createEmptyReadModel(now);
    model = yield* projectEvent(model, projectCreatedEvent("project-1"));
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        {
          type: "attach-path",
          entry: { kind: "folder", id: "folder-1", parentId: null, rank: "a", relativePath: "src" },
        },
        1,
      ),
    );
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        {
          type: "attach-path",
          entry: {
            kind: "file",
            id: "file-1",
            parentId: "folder-1",
            rank: "a",
            relativePath: "src/a.ts",
          },
        },
        2,
      ),
    );

    // move file-1 to root
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        { type: "move", itemId: "file-1", parentId: null, beforeId: null },
        3,
      ),
    );
    expect(model.projects[0]?.workspaceLayout.find((e) => e.id === "file-1")?.parentId).toBe(null);

    // rename folder-1
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        { type: "rename", itemId: "folder-1", label: "Sources" },
        4,
      ),
    );
    const renamed = model.projects[0]?.workspaceLayout.find((e) => e.id === "folder-1");
    expect(renamed && "label" in renamed ? renamed.label : undefined).toBe("Sources");

    // re-attach file-1 under folder-1, then remove folder-1: file-1 should
    // reparent to root (folder-1's own parent) rather than vanish.
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        { type: "move", itemId: "file-1", parentId: "folder-1", beforeId: null },
        5,
      ),
    );
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent("project-1", { type: "remove", itemId: "folder-1" }, 6),
    );
    const project = model.projects[0]!;
    expect(project.workspaceLayout.map((entry) => entry.id)).toEqual(["file-1"]);
    expect(project.workspaceLayout[0]?.parentId).toBe(null);
    expect(project.workspaceLayoutVersion).toBe(6);
  }).pipe(Effect.runPromise));

it("thread.deleted prunes the thread's layout entry without bumping the layout version", () =>
  Effect.gen(function* () {
    let model = createEmptyReadModel(now);
    model = yield* projectEvent(model, projectCreatedEvent("project-1"));
    model = yield* projectEvent(model, threadCreatedEvent("thread-1", "project-1"));
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        {
          type: "place-resource",
          resource: { kind: "thread", threadId: ThreadId.make("thread-1") },
          parentId: null,
          beforeId: null,
        },
        1,
      ),
    );
    expect(model.projects[0]?.workspaceLayout.length).toBe(1);

    model = yield* projectEvent(model, {
      sequence: nextSequence(),
      eventId: EventId.make("evt-delete-thread-1"),
      aggregateKind: "thread",
      aggregateId: ThreadId.make("thread-1"),
      type: "thread.deleted",
      occurredAt: now,
      commandId: CommandId.make("cmd-delete-thread-1"),
      causationEventId: null,
      correlationId: CommandId.make("cmd-delete-thread-1"),
      metadata: {},
      payload: { threadId: ThreadId.make("thread-1"), deletedAt: now },
    });

    expect(model.projects[0]?.workspaceLayout).toEqual([]);
    expect(model.projects[0]?.workspaceLayoutVersion).toBe(1); // unchanged by pruning
    expect(model.threads[0]?.deletedAt).toBe(now);
  }).pipe(Effect.runPromise));

it("project.meta-updated dropping a script prunes its placed command entry", () =>
  Effect.gen(function* () {
    let model = createEmptyReadModel(now);
    model = yield* projectEvent(model, projectCreatedEvent("project-1"));
    model = yield* projectEvent(model, {
      sequence: nextSequence(),
      eventId: EventId.make("evt-meta-add-script"),
      aggregateKind: "project",
      aggregateId: ProjectId.make("project-1"),
      type: "project.meta-updated",
      occurredAt: now,
      commandId: CommandId.make("cmd-meta-add-script"),
      causationEventId: null,
      correlationId: CommandId.make("cmd-meta-add-script"),
      metadata: {},
      payload: {
        projectId: ProjectId.make("project-1"),
        scripts: [
          { id: "script-1", name: "Run", command: "pnpm dev", icon: "play", runOnWorktreeCreate: false },
        ],
        updatedAt: now,
      },
    });
    model = yield* projectEvent(
      model,
      workspaceLayoutAppliedEvent(
        "project-1",
        {
          type: "place-resource",
          resource: { kind: "command", scriptId: "script-1" },
          parentId: null,
          beforeId: null,
        },
        1,
      ),
    );
    expect(model.projects[0]?.workspaceLayout.length).toBe(1);

    model = yield* projectEvent(model, {
      sequence: nextSequence(),
      eventId: EventId.make("evt-meta-remove-script"),
      aggregateKind: "project",
      aggregateId: ProjectId.make("project-1"),
      type: "project.meta-updated",
      occurredAt: now,
      commandId: CommandId.make("cmd-meta-remove-script"),
      causationEventId: null,
      correlationId: CommandId.make("cmd-meta-remove-script"),
      metadata: {},
      payload: { projectId: ProjectId.make("project-1"), scripts: [], updatedAt: now },
    });

    expect(model.projects[0]?.workspaceLayout).toEqual([]);
    expect(model.projects[0]?.scripts).toEqual([]);
  }).pipe(Effect.runPromise));
