/**
 * Focused end-to-end coverage for the unified workspace tree sidebar's
 * `project.workspace-layout.apply` command, dispatched through the full
 * engine (decider -> event -> SQL projection pipeline), asserting against
 * the persisted `projection_projects` row. Split into its own file rather
 * than appended to the already-large `ProjectionPipeline.test.ts`, matching
 * this directory's existing per-feature split (`decider.delete.test.ts`,
 * `decider.projectScripts.test.ts`).
 */
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  ProjectId,
  ProjectWorkspaceItemId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { ServerConfig } from "../../config.ts";
import { OrchestrationCommandInvariantError } from "../Errors.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";

const engineLayer = it.layer(
  OrchestrationEngineLive.pipe(
    Layer.provide(OrchestrationProjectionSnapshotQueryLive),
    Layer.provide(OrchestrationProjectionPipelineLive),
    Layer.provide(OrchestrationEventStoreLive),
    Layer.provide(OrchestrationCommandReceiptRepositoryLive),
    Layer.provide(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provide(RepositoryIdentityResolver.layer),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(
      ServerConfig.layerTest(process.cwd(), {
        prefix: "t3-projection-pipeline-workspace-layout-",
      }),
    ),
    Layer.provideMerge(NodeServices.layer),
  ),
);

const createdAt = "2026-01-01T00:00:00.000Z";

function getProjectLayoutRow(projectId: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      readonly workspaceLayoutVersion: number;
      readonly workspaceLayoutJson: string;
    }>`
      SELECT
        workspace_layout_version AS "workspaceLayoutVersion",
        workspace_layout_json AS "workspaceLayoutJson"
      FROM projection_projects
      WHERE project_id = ${projectId}
    `;
    const row = rows[0];
    if (!row) {
      return yield* Effect.die(`Expected projection_projects row for '${projectId}' to exist.`);
    }
    // @effect-diagnostics-next-line preferSchemaOverJson:off - Raw SQL fixture row decoded for assertions only.
    const layout = JSON.parse(row.workspaceLayoutJson);
    return { version: row.workspaceLayoutVersion, layout };
  });
}

function createProject(engine: OrchestrationEngineService["Service"], projectId: string) {
  return engine.dispatch({
    type: "project.create",
    commandId: CommandId.make(`cmd-create-${projectId}`),
    projectId: ProjectId.make(projectId),
    title: "Workspace layout project",
    workspaceRoot: `/tmp/${projectId}`,
    defaultModelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5-codex",
    },
    createdAt,
  });
}

function createThread(
  engine: OrchestrationEngineService["Service"],
  threadId: string,
  projectId: string,
) {
  return engine.dispatch({
    type: "thread.create",
    commandId: CommandId.make(`cmd-create-${threadId}`),
    threadId: ThreadId.make(threadId),
    projectId: ProjectId.make(projectId),
    title: "Workspace layout thread",
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5-codex",
    },
    runtimeMode: "full-access",
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: null,
    worktreePath: null,
    createdAt,
  });
}

engineLayer("project.workspace-layout.apply via engine dispatch", (it) => {
  it.effect("project.created initializes workspace layout at version 0 with an empty layout", () =>
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      yield* createProject(engine, "project-init");

      const row = yield* getProjectLayoutRow("project-init");
      assert.strictEqual(row.version, 0);
      assert.deepStrictEqual(row.layout, []);
    }),
  );

  it.effect("attach-path persists a normalized entry and bumps the layout version", () =>
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      yield* createProject(engine, "project-attach");

      yield* engine.dispatch({
        type: "project.workspace-layout.apply",
        commandId: CommandId.make("cmd-attach-1"),
        projectId: ProjectId.make("project-attach"),
        expectedVersion: 0,
        operation: {
          type: "attach-path",
          entry: {
            kind: "file",
            id: ProjectWorkspaceItemId.make("file-1"),
            parentId: null,
            rank: "a",
            relativePath: "./src/../src/auth.ts",
          },
        },
      });

      const row = yield* getProjectLayoutRow("project-attach");
      assert.strictEqual(row.version, 1);
      assert.strictEqual(row.layout.length, 1);
      // "./src/../src/auth.ts" normalizes to "src/auth.ts".
      assert.strictEqual(row.layout[0].relativePath, "src/auth.ts");
    }),
  );

  it.effect("rejects a duplicate attached path with tag duplicate-path", () =>
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      yield* createProject(engine, "project-dup");
      yield* engine.dispatch({
        type: "project.workspace-layout.apply",
        commandId: CommandId.make("cmd-dup-1"),
        projectId: ProjectId.make("project-dup"),
        expectedVersion: 0,
        operation: {
          type: "attach-path",
          entry: {
            kind: "file",
            id: ProjectWorkspaceItemId.make("file-1"),
            parentId: null,
            rank: "a",
            relativePath: "a.ts",
          },
        },
      });

      const error = yield* Effect.flip(
        engine.dispatch({
          type: "project.workspace-layout.apply",
          commandId: CommandId.make("cmd-dup-2"),
          projectId: ProjectId.make("project-dup"),
          expectedVersion: 1,
          operation: {
            type: "attach-path",
            entry: {
              kind: "file",
              id: ProjectWorkspaceItemId.make("file-2"),
              parentId: null,
              rank: "b",
              relativePath: "a.ts",
            },
          },
        }),
      );
      assert.instanceOf(error, OrchestrationCommandInvariantError);
      // @effect-diagnostics-next-line preferSchemaOverJson:off - Decoding the invariant error's raw detail for assertions.
      const rejection = JSON.parse((error as OrchestrationCommandInvariantError).detail);
      assert.strictEqual(rejection.tag, "duplicate-path");
    }),
  );

  it.effect("rejects a stale expectedVersion with tag version-conflict and currentVersion", () =>
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      yield* createProject(engine, "project-conflict");
      yield* engine.dispatch({
        type: "project.workspace-layout.apply",
        commandId: CommandId.make("cmd-conflict-1"),
        projectId: ProjectId.make("project-conflict"),
        expectedVersion: 0,
        operation: {
          type: "add-url",
          entry: {
            kind: "url",
            id: ProjectWorkspaceItemId.make("url-1"),
            parentId: null,
            rank: "a",
            label: "Local",
            url: "http://localhost:3000",
          },
        },
      });

      const error = yield* Effect.flip(
        engine.dispatch({
          type: "project.workspace-layout.apply",
          commandId: CommandId.make("cmd-conflict-2"),
          projectId: ProjectId.make("project-conflict"),
          expectedVersion: 0, // stale — current version is now 1
          operation: { type: "remove", itemId: ProjectWorkspaceItemId.make("url-1") },
        }),
      );
      assert.instanceOf(error, OrchestrationCommandInvariantError);
      // @effect-diagnostics-next-line preferSchemaOverJson:off - Decoding the invariant error's raw detail for assertions.
      const rejection = JSON.parse((error as OrchestrationCommandInvariantError).detail);
      assert.strictEqual(rejection.tag, "version-conflict");
      assert.strictEqual(rejection.currentVersion, 1);
    }),
  );

  it.effect(
    "place-resource materializes a thread entry with a server-computed rank, and beforeId orders correctly",
    () =>
      Effect.gen(function* () {
        const engine = yield* OrchestrationEngineService;
        yield* createProject(engine, "project-place");
        yield* createThread(engine, "thread-a", "project-place");
        yield* createThread(engine, "thread-b", "project-place");

        yield* engine.dispatch({
          type: "project.workspace-layout.apply",
          commandId: CommandId.make("cmd-place-a"),
          projectId: ProjectId.make("project-place"),
          expectedVersion: 0,
          operation: {
            type: "place-resource",
            resource: { kind: "thread", threadId: ThreadId.make("thread-a") },
            parentId: null,
            beforeId: null,
          },
        });
        // thread-b is placed *before* thread-a.
        yield* engine.dispatch({
          type: "project.workspace-layout.apply",
          commandId: CommandId.make("cmd-place-b"),
          projectId: ProjectId.make("project-place"),
          expectedVersion: 1,
          operation: {
            type: "place-resource",
            resource: { kind: "thread", threadId: ThreadId.make("thread-b") },
            parentId: null,
            beforeId: ProjectWorkspaceItemId.make("thread:thread-a"),
          },
        });

        const row = yield* getProjectLayoutRow("project-place");
        assert.strictEqual(row.version, 2);
        assert.strictEqual(row.layout.length, 2);
        const threadB = row.layout.find((entry: { id: string }) => entry.id === "thread:thread-b");
        const threadA = row.layout.find((entry: { id: string }) => entry.id === "thread:thread-a");
        assert.isDefined(threadA);
        assert.isDefined(threadB);
        assert.isTrue((threadB.rank as string) < (threadA.rank as string));
      }),
  );

  it.effect("move reorders an existing entry and rejects a descendant-cycle move", () =>
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      yield* createProject(engine, "project-move");
      yield* engine.dispatch({
        type: "project.workspace-layout.apply",
        commandId: CommandId.make("cmd-move-attach-folder"),
        projectId: ProjectId.make("project-move"),
        expectedVersion: 0,
        operation: {
          type: "attach-path",
          entry: {
            kind: "folder",
            id: ProjectWorkspaceItemId.make("folder-1"),
            parentId: null,
            rank: "a",
            relativePath: "src",
          },
        },
      });
      yield* engine.dispatch({
        type: "project.workspace-layout.apply",
        commandId: CommandId.make("cmd-move-attach-file"),
        projectId: ProjectId.make("project-move"),
        expectedVersion: 1,
        operation: {
          type: "attach-path",
          entry: {
            kind: "file",
            id: ProjectWorkspaceItemId.make("file-1"),
            parentId: null,
            rank: "b",
            relativePath: "README.md",
          },
        },
      });

      yield* engine.dispatch({
        type: "project.workspace-layout.apply",
        commandId: CommandId.make("cmd-move-1"),
        projectId: ProjectId.make("project-move"),
        expectedVersion: 2,
        operation: {
          type: "move",
          itemId: ProjectWorkspaceItemId.make("file-1"),
          parentId: ProjectWorkspaceItemId.make("folder-1"),
          beforeId: null,
        },
      });
      const afterMove = yield* getProjectLayoutRow("project-move");
      const movedFile = afterMove.layout.find((entry: { id: string }) => entry.id === "file-1");
      assert.strictEqual(movedFile.parentId, "folder-1");

      const cycleError = yield* Effect.flip(
        engine.dispatch({
          type: "project.workspace-layout.apply",
          commandId: CommandId.make("cmd-move-cycle"),
          projectId: ProjectId.make("project-move"),
          expectedVersion: 3,
          // folder-1 cannot become a child of its own child file-1.
          operation: {
            type: "move",
            itemId: ProjectWorkspaceItemId.make("folder-1"),
            parentId: ProjectWorkspaceItemId.make("file-1"),
            beforeId: null,
          },
        }),
      );
      assert.instanceOf(cycleError, OrchestrationCommandInvariantError);
      // @effect-diagnostics-next-line preferSchemaOverJson:off - Decoding the invariant error's raw detail for assertions.
      const rejection = JSON.parse((cycleError as OrchestrationCommandInvariantError).detail);
      assert.strictEqual(rejection.tag, "cycle");
    }),
  );

  it.effect(
    "remove reparents children to the removed node's parent and preserves their order",
    () =>
      Effect.gen(function* () {
        const engine = yield* OrchestrationEngineService;
        yield* createProject(engine, "project-remove");
        yield* engine.dispatch({
          type: "project.workspace-layout.apply",
          commandId: CommandId.make("cmd-remove-attach-folder"),
          projectId: ProjectId.make("project-remove"),
          expectedVersion: 0,
          operation: {
            type: "attach-path",
            entry: {
              kind: "folder",
              id: ProjectWorkspaceItemId.make("folder-1"),
              parentId: null,
              rank: "a",
              relativePath: "src",
            },
          },
        });
        yield* engine.dispatch({
          type: "project.workspace-layout.apply",
          commandId: CommandId.make("cmd-remove-attach-file-1"),
          projectId: ProjectId.make("project-remove"),
          expectedVersion: 1,
          operation: {
            type: "attach-path",
            entry: {
              kind: "file",
              id: ProjectWorkspaceItemId.make("file-1"),
              parentId: ProjectWorkspaceItemId.make("folder-1"),
              rank: "a",
              relativePath: "src/a.ts",
            },
          },
        });
        yield* engine.dispatch({
          type: "project.workspace-layout.apply",
          commandId: CommandId.make("cmd-remove-attach-file-2"),
          projectId: ProjectId.make("project-remove"),
          expectedVersion: 2,
          operation: {
            type: "attach-path",
            entry: {
              kind: "file",
              id: ProjectWorkspaceItemId.make("file-2"),
              parentId: ProjectWorkspaceItemId.make("folder-1"),
              rank: "b",
              relativePath: "src/b.ts",
            },
          },
        });

        yield* engine.dispatch({
          type: "project.workspace-layout.apply",
          commandId: CommandId.make("cmd-remove-folder"),
          projectId: ProjectId.make("project-remove"),
          expectedVersion: 3,
          operation: { type: "remove", itemId: ProjectWorkspaceItemId.make("folder-1") },
        });

        const row = yield* getProjectLayoutRow("project-remove");
        assert.strictEqual(row.layout.length, 2); // folder-1 gone, file-1/file-2 reparented to root
        const file1 = row.layout.find((entry: { id: string }) => entry.id === "file-1");
        const file2 = row.layout.find((entry: { id: string }) => entry.id === "file-2");
        assert.strictEqual(file1.parentId, null);
        assert.strictEqual(file2.parentId, null);
        assert.isTrue((file1.rank as string) < (file2.rank as string)); // original relative order preserved
      }),
  );

  it.effect("deleting a placed thread prunes its workspace layout entry", () =>
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      yield* createProject(engine, "project-thread-delete");
      yield* createThread(engine, "thread-doomed", "project-thread-delete");
      yield* engine.dispatch({
        type: "project.workspace-layout.apply",
        commandId: CommandId.make("cmd-place-doomed"),
        projectId: ProjectId.make("project-thread-delete"),
        expectedVersion: 0,
        operation: {
          type: "place-resource",
          resource: { kind: "thread", threadId: ThreadId.make("thread-doomed") },
          parentId: null,
          beforeId: null,
        },
      });
      const beforeDelete = yield* getProjectLayoutRow("project-thread-delete");
      assert.strictEqual(beforeDelete.layout.length, 1);

      yield* engine.dispatch({
        type: "thread.delete",
        commandId: CommandId.make("cmd-delete-doomed"),
        threadId: ThreadId.make("thread-doomed"),
      });

      const afterDelete = yield* getProjectLayoutRow("project-thread-delete");
      assert.deepStrictEqual(afterDelete.layout, []);
      // Pruning is server-side lifecycle cleanup, not a layout-apply command —
      // it must not bump the optimistic-concurrency version.
      assert.strictEqual(afterDelete.version, 1);
    }),
  );

  it.effect("removing a script from project.meta.update prunes its placed command entry", () =>
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      yield* createProject(engine, "project-script-delete");
      yield* engine.dispatch({
        type: "project.meta.update",
        commandId: CommandId.make("cmd-add-script"),
        projectId: ProjectId.make("project-script-delete"),
        scripts: [
          {
            id: "script-1",
            name: "Run web",
            command: "pnpm dev",
            icon: "play",
            runOnWorktreeCreate: false,
          },
        ],
      });
      yield* engine.dispatch({
        type: "project.workspace-layout.apply",
        commandId: CommandId.make("cmd-place-script"),
        projectId: ProjectId.make("project-script-delete"),
        expectedVersion: 0,
        operation: {
          type: "place-resource",
          resource: { kind: "command", scriptId: "script-1" },
          parentId: null,
          beforeId: null,
        },
      });
      const beforeRemoval = yield* getProjectLayoutRow("project-script-delete");
      assert.strictEqual(beforeRemoval.layout.length, 1);

      yield* engine.dispatch({
        type: "project.meta.update",
        commandId: CommandId.make("cmd-remove-script"),
        projectId: ProjectId.make("project-script-delete"),
        scripts: [],
      });

      const afterRemoval = yield* getProjectLayoutRow("project-script-delete");
      assert.deepStrictEqual(afterRemoval.layout, []);
    }),
  );
});
