/**
 * Focused, in-memory (no SQL) coverage for every
 * `project.workspace-layout.apply` invariant in
 * docs/specs/unified-workspace-tree-sidebar.md §6.4, verifying each
 * rejection maps to the expected `ProjectWorkspaceLayoutErrorTag`. The
 * end-to-end (decider -> event -> SQL projection) happy-path coverage lives
 * in `Layers/ProjectionPipeline.workspaceLayout.test.ts`; this file is the
 * cheap, exhaustive edge-case sweep against `decideOrchestrationCommand`
 * directly.
 */
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  type OrchestrationCommand,
  type OrchestrationReadModel,
  ProjectId,
  ProjectWorkspaceItemId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { decideOrchestrationCommand } from "./decider.ts";
import { OrchestrationCommandInvariantError } from "./Errors.ts";

const now = "2026-01-01T00:00:00.000Z";

const isOrchestrationCommandInvariantError = Schema.is(OrchestrationCommandInvariantError);

function rejectionTag(error: unknown): string {
  expect(error).toBeInstanceOf(OrchestrationCommandInvariantError);
  const detail = (error as OrchestrationCommandInvariantError).detail;
  return (JSON.parse(detail) as { tag: string }).tag;
}

const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5-codex",
};

function baseThread(input: {
  readonly id: string;
  readonly projectId: string;
  readonly deletedAt?: string | null;
}) {
  return {
    id: ThreadId.make(input.id),
    projectId: ProjectId.make(input.projectId),
    title: "Thread",
    modelSelection,
    runtimeMode: "full-access" as const,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: null,
    worktreePath: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    latestTurn: null,
    messages: [],
    session: null,
    activities: [],
    proposedPlans: [],
    checkpoints: [],
    deletedAt: input.deletedAt ?? null,
  };
}

// project-a: an active project with a populated layout (folder-1 -> file-1
// -> thread:thread-a, plus url-1 at root and command:script-1 at root) used
// as the target of most invariant checks below.
const readModel: OrchestrationReadModel = {
  snapshotSequence: 10,
  updatedAt: now,
  projects: [
    {
      id: ProjectId.make("project-a"),
      title: "Project A",
      workspaceRoot: "/tmp/project-a",
      defaultModelSelection: modelSelection,
      scripts: [
        {
          id: "script-1",
          name: "Run web",
          command: "pnpm dev",
          icon: "play",
          runOnWorktreeCreate: false,
        },
      ],
      workspaceLayoutVersion: 5,
      workspaceLayout: [
        {
          kind: "folder",
          id: ProjectWorkspaceItemId.make("folder-1"),
          parentId: null,
          rank: "a",
          relativePath: "src",
        },
        {
          kind: "file",
          id: ProjectWorkspaceItemId.make("file-1"),
          parentId: ProjectWorkspaceItemId.make("folder-1"),
          rank: "a",
          relativePath: "src/auth.ts",
        },
        {
          kind: "thread",
          id: ProjectWorkspaceItemId.make("thread:thread-a"),
          parentId: ProjectWorkspaceItemId.make("file-1"),
          rank: "a",
          threadId: ThreadId.make("thread-a"),
        },
        {
          kind: "url",
          id: ProjectWorkspaceItemId.make("url-1"),
          parentId: null,
          rank: "b",
          label: "Local",
          url: "http://localhost:3000",
        },
        {
          kind: "command",
          id: ProjectWorkspaceItemId.make("command:script-1"),
          parentId: null,
          rank: "c",
          scriptId: "script-1",
        },
      ],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: ProjectId.make("project-b"),
      title: "Project B",
      workspaceRoot: "/tmp/project-b",
      defaultModelSelection: modelSelection,
      scripts: [],
      workspaceLayoutVersion: 0,
      workspaceLayout: [
        {
          kind: "folder",
          id: ProjectWorkspaceItemId.make("folder-b1"),
          parentId: null,
          rank: "a",
          relativePath: "lib",
        },
      ],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: ProjectId.make("project-deleted"),
      title: "Deleted Project",
      workspaceRoot: "/tmp/project-deleted",
      defaultModelSelection: null,
      scripts: [],
      workspaceLayoutVersion: 0,
      workspaceLayout: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    },
  ],
  threads: [
    baseThread({ id: "thread-a", projectId: "project-a" }),
    baseThread({ id: "thread-b", projectId: "project-b" }),
    baseThread({ id: "thread-deleted", projectId: "project-a", deletedAt: now }),
  ],
};

function applyCommand(
  operation: Extract<OrchestrationCommand, { type: "project.workspace-layout.apply" }>["operation"],
  options?: { readonly projectId?: string; readonly expectedVersion?: number },
) {
  const command: OrchestrationCommand = {
    type: "project.workspace-layout.apply",
    commandId: CommandId.make("cmd-workspace-layout"),
    projectId: ProjectId.make(options?.projectId ?? "project-a"),
    expectedVersion: options?.expectedVersion ?? 5,
    operation,
  };
  return decideOrchestrationCommand({ command, readModel });
}

it.layer(NodeServices.layer)("decider project.workspace-layout.apply", (it) => {
  it.effect("rejects when the project does not exist or is inactive (missing-target)", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(
        applyCommand(
          { type: "remove", itemId: ProjectWorkspaceItemId.make("url-1") },
          { projectId: "project-missing" },
        ),
      );
      expect(rejectionTag(missing)).toBe("missing-target");

      const inactive = yield* Effect.flip(
        applyCommand(
          { type: "remove", itemId: ProjectWorkspaceItemId.make("url-1") },
          { projectId: "project-deleted", expectedVersion: 0 },
        ),
      );
      expect(rejectionTag(inactive)).toBe("missing-target");
    }),
  );

  it.effect("rejects a stale expectedVersion (version-conflict) and reports currentVersion", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand(
          { type: "remove", itemId: ProjectWorkspaceItemId.make("url-1") },
          { expectedVersion: 999 },
        ),
      );
      expect(rejectionTag(error)).toBe("version-conflict");
      if (!isOrchestrationCommandInvariantError(error)) {
        throw new Error("expected an OrchestrationCommandInvariantError");
      }
      // @effect-diagnostics-next-line preferSchemaOverJson:off - Decoding the invariant error's raw detail for assertions.
      const detail = JSON.parse(error.detail);
      expect(detail.currentVersion).toBe(5);
    }),
  );

  it.effect("attach-path: normalizes the path and emits the normalized entry", () =>
    Effect.gen(function* () {
      const result = yield* applyCommand({
        type: "attach-path",
        entry: {
          kind: "file",
          id: ProjectWorkspaceItemId.make("file-new"),
          parentId: null,
          rank: "z",
          relativePath: "./docs/../docs/readme.md",
        },
      });
      const event = Array.isArray(result) ? result[0]! : result;
      expect(event.type).toBe("project.workspace-layout-applied");
      if (
        event.type === "project.workspace-layout-applied" &&
        event.payload.operation.type === "attach-path"
      ) {
        expect(event.payload.operation.entry.relativePath).toBe("docs/readme.md");
      }
      expect((event as { payload: { layoutVersion: number } }).payload.layoutVersion).toBe(6);
    }),
  );

  it.effect("attach-path: rejects an escaping path (invalid-path)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand({
          type: "attach-path",
          entry: {
            kind: "file",
            id: ProjectWorkspaceItemId.make("file-new"),
            parentId: null,
            rank: "z",
            relativePath: "../outside.ts",
          },
        }),
      );
      expect(rejectionTag(error)).toBe("invalid-path");
    }),
  );

  it.effect("attach-path: rejects a duplicate scoped path (duplicate-path)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand({
          type: "attach-path",
          entry: {
            kind: "file",
            id: ProjectWorkspaceItemId.make("file-new"),
            parentId: null,
            rank: "z",
            relativePath: "src/auth.ts",
          },
        }),
      );
      expect(rejectionTag(error)).toBe("duplicate-path");
    }),
  );

  it.effect("rejects a parent that does not exist anywhere (missing-target)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand({
          type: "add-url",
          entry: {
            kind: "url",
            id: ProjectWorkspaceItemId.make("url-new"),
            parentId: ProjectWorkspaceItemId.make("does-not-exist"),
            rank: "z",
            label: "x",
            url: "http://example.com",
          },
        }),
      );
      expect(rejectionTag(error)).toBe("missing-target");
    }),
  );

  it.effect("rejects a parent that belongs to a different project (cross-project)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand({
          type: "add-url",
          entry: {
            kind: "url",
            id: ProjectWorkspaceItemId.make("url-new"),
            parentId: ProjectWorkspaceItemId.make("folder-b1"),
            rank: "z",
            label: "x",
            url: "http://example.com",
          },
        }),
      );
      expect(rejectionTag(error)).toBe("cross-project");
    }),
  );

  it.effect("rejects a command/url as a parent (invalid-parent)", () =>
    Effect.gen(function* () {
      const viaCommand = yield* Effect.flip(
        applyCommand({
          type: "add-url",
          entry: {
            kind: "url",
            id: ProjectWorkspaceItemId.make("url-new"),
            parentId: ProjectWorkspaceItemId.make("command:script-1"),
            rank: "z",
            label: "x",
            url: "http://example.com",
          },
        }),
      );
      expect(rejectionTag(viaCommand)).toBe("invalid-parent");

      const viaUrl = yield* Effect.flip(
        applyCommand({
          type: "add-url",
          entry: {
            kind: "url",
            id: ProjectWorkspaceItemId.make("url-new"),
            parentId: ProjectWorkspaceItemId.make("url-1"),
            rank: "z",
            label: "x",
            url: "http://example.com",
          },
        }),
      );
      expect(rejectionTag(viaUrl)).toBe("invalid-parent");
    }),
  );

  it.effect("rejects a live terminal/browser id used as a parent (not-persistent)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand({
          type: "add-url",
          entry: {
            kind: "url",
            id: ProjectWorkspaceItemId.make("url-new"),
            parentId: ProjectWorkspaceItemId.make("terminal:env-1:thread-a:term-1"),
            rank: "z",
            label: "x",
            url: "http://example.com",
          },
        }),
      );
      expect(rejectionTag(error)).toBe("not-persistent");
    }),
  );

  it.effect("place-resource: rejects an unknown thread (missing-target) and a deleted thread", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(
        applyCommand({
          type: "place-resource",
          resource: { kind: "thread", threadId: ThreadId.make("thread-nope") },
          parentId: null,
          beforeId: null,
        }),
      );
      expect(rejectionTag(missing)).toBe("missing-target");

      const deleted = yield* Effect.flip(
        applyCommand({
          type: "place-resource",
          resource: { kind: "thread", threadId: ThreadId.make("thread-deleted") },
          parentId: null,
          beforeId: null,
        }),
      );
      expect(rejectionTag(deleted)).toBe("missing-target");
    }),
  );

  it.effect(
    "place-resource: rejects a thread belonging to a different project (cross-project)",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          applyCommand({
            type: "place-resource",
            resource: { kind: "thread", threadId: ThreadId.make("thread-b") },
            parentId: null,
            beforeId: null,
          }),
        );
        expect(rejectionTag(error)).toBe("cross-project");
      }),
  );

  it.effect("place-resource: rejects an unknown script (missing-target)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand({
          type: "place-resource",
          resource: { kind: "command", scriptId: "script-nope" },
          parentId: null,
          beforeId: null,
        }),
      );
      expect(rejectionTag(error)).toBe("missing-target");
    }),
  );

  it.effect("move: rejects self-parent and descendant-cycle (cycle)", () =>
    Effect.gen(function* () {
      const selfParent = yield* Effect.flip(
        applyCommand({
          type: "move",
          itemId: ProjectWorkspaceItemId.make("folder-1"),
          parentId: ProjectWorkspaceItemId.make("folder-1"),
          beforeId: null,
        }),
      );
      expect(rejectionTag(selfParent)).toBe("cycle");

      // file-1 is a child of folder-1; moving folder-1 under file-1 is a cycle.
      const descendantCycle = yield* Effect.flip(
        applyCommand({
          type: "move",
          itemId: ProjectWorkspaceItemId.make("folder-1"),
          parentId: ProjectWorkspaceItemId.make("file-1"),
          beforeId: null,
        }),
      );
      expect(rejectionTag(descendantCycle)).toBe("cycle");
    }),
  );

  it.effect("move: rejects an unknown itemId (missing-target)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand({
          type: "move",
          itemId: ProjectWorkspaceItemId.make("does-not-exist"),
          parentId: null,
          beforeId: null,
        }),
      );
      expect(rejectionTag(error)).toBe("missing-target");
    }),
  );

  it.effect("move: rejects a live resource id as the moved item (not-persistent)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand({
          type: "move",
          itemId: ProjectWorkspaceItemId.make("browser:env-1:thread-a:tab-1"),
          parentId: null,
          beforeId: null,
        }),
      );
      expect(rejectionTag(error)).toBe("not-persistent");
    }),
  );

  it.effect(
    "beforeId: rejects an unknown beforeId (missing-target) and a mismatched-parent beforeId (invalid-parent)",
    () =>
      Effect.gen(function* () {
        const missing = yield* Effect.flip(
          applyCommand({
            type: "move",
            itemId: ProjectWorkspaceItemId.make("url-1"),
            parentId: null,
            beforeId: ProjectWorkspaceItemId.make("does-not-exist"),
          }),
        );
        expect(rejectionTag(missing)).toBe("missing-target");

        // file-1's parent is folder-1, not null — beforeId must share the
        // resulting parent (here: root/null).
        const mismatched = yield* Effect.flip(
          applyCommand({
            type: "move",
            itemId: ProjectWorkspaceItemId.make("url-1"),
            parentId: null,
            beforeId: ProjectWorkspaceItemId.make("file-1"),
          }),
        );
        expect(rejectionTag(mismatched)).toBe("invalid-parent");
      }),
  );

  it.effect(
    "rename: rejects thread/command entries (missing-target) and accepts file/folder/url",
    () =>
      Effect.gen(function* () {
        const threadRename = yield* Effect.flip(
          applyCommand({
            type: "rename",
            itemId: ProjectWorkspaceItemId.make("thread:thread-a"),
            label: "New label",
          }),
        );
        expect(rejectionTag(threadRename)).toBe("missing-target");

        const commandRename = yield* Effect.flip(
          applyCommand({
            type: "rename",
            itemId: ProjectWorkspaceItemId.make("command:script-1"),
            label: "New label",
          }),
        );
        expect(rejectionTag(commandRename)).toBe("missing-target");

        const result = yield* applyCommand({
          type: "rename",
          itemId: ProjectWorkspaceItemId.make("folder-1"),
          label: "Renamed",
        });
        const event = Array.isArray(result) ? result[0]! : result;
        expect(event.type).toBe("project.workspace-layout-applied");
      }),
  );

  it.effect("remove: rejects an unknown itemId (missing-target)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyCommand({ type: "remove", itemId: ProjectWorkspaceItemId.make("does-not-exist") }),
      );
      expect(rejectionTag(error)).toBe("missing-target");
    }),
  );
});
