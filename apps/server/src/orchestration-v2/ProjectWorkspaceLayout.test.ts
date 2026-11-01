/**
 * Focused, in-memory (no SQL) coverage for every
 * `project.workspace-layout.apply` invariant in
 * docs/specs/unified-workspace-tree-sidebar.md §6.4, verifying each
 * rejection maps to the expected `ProjectWorkspaceLayoutErrorTag`. Runs
 * `planProjectCommand` directly, the v2 home of the decision.
 */
import {
  CommandId,
  EventId,
  ProjectId,
  ProjectWorkspaceItemId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";

import {
  ProjectCommandInvariantError,
  planProjectCommand,
  type ProjectWorkspaceLayoutApplyCommand,
} from "./ProjectCommands.ts";
import type { ProjectRow } from "./ProjectStore.ts";

const now = "2026-01-01T00:00:00.000Z";

const isInvariantError = Schema.is(ProjectCommandInvariantError);

function rejectionTag(error: unknown): string {
  expect(error).toBeInstanceOf(ProjectCommandInvariantError);
  const detail = (error as ProjectCommandInvariantError).detail;
  return (JSON.parse(detail) as { tag: string }).tag;
}

const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5-codex",
};

// project-a: an active project with a populated layout (folder-1 -> file-1
// -> thread:thread-a, plus url-1 at root and command:script-1 at root) used
// as the target of most invariant checks below.
const projectRows: ReadonlyArray<ProjectRow> = [
    {
      projectId: ProjectId.make("project-a"),
      title: "Project A",
      workspaceRoot: "/tmp/project-a",
      defaultModelSelection: modelSelection,
      defaultThreadEnvMode: null,
      autoPull: false,
      faviconPath: null,
      projectIcon: null,
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
      projectId: ProjectId.make("project-b"),
      title: "Project B",
      workspaceRoot: "/tmp/project-b",
      defaultModelSelection: modelSelection,
      defaultThreadEnvMode: null,
      autoPull: false,
      faviconPath: null,
      projectIcon: null,
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
      projectId: ProjectId.make("project-deleted"),
      title: "Deleted Project",
      workspaceRoot: "/tmp/project-deleted",
      defaultModelSelection: null,
      defaultThreadEnvMode: null,
      autoPull: false,
      faviconPath: null,
      projectIcon: null,
      scripts: [],
      workspaceLayoutVersion: 0,
      workspaceLayout: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    },
];

const threadProjects = new Map([
  ["thread-a", { projectId: ProjectId.make("project-a"), deleted: false }],
  ["thread-b", { projectId: ProjectId.make("project-b"), deleted: false }],
  ["thread-deleted", { projectId: ProjectId.make("project-a"), deleted: true }],
]);

function applyCommand(
  operation: ProjectWorkspaceLayoutApplyCommand["operation"],
  options?: { readonly projectId?: string; readonly expectedVersion?: number },
) {
  const projectId = ProjectId.make(options?.projectId ?? "project-a");
  const command: ProjectWorkspaceLayoutApplyCommand = {
    type: "project.workspace-layout.apply",
    commandId: CommandId.make("cmd-workspace-layout"),
    projectId,
    expectedVersion: options?.expectedVersion ?? 5,
    operation,
  };
  const threadId =
    operation.type === "place-resource" && operation.resource.kind === "thread"
      ? operation.resource.threadId
      : undefined;
  const planned = planProjectCommand({
    command,
    state: {
      project: projectRows.find((row) => row.projectId === projectId),
      workspaceOwner: undefined,
      layoutLookups: {
        thread: threadId === undefined ? undefined : threadProjects.get(threadId),
        otherProjectLayouts: projectRows
          .filter((row) => row.projectId !== projectId)
          .map((row) => ({ projectId: row.projectId, layout: row.workspaceLayout })),
      },
    },
    eventId: EventId.make("event:planned"),
    now: DateTime.makeUnsafe(now),
  });
  return Result.isSuccess(planned) ? Effect.succeed(planned.success) : Effect.fail(planned.failure);
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
      if (!isInvariantError(error)) {
        throw new Error("expected an ProjectCommandInvariantError");
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
