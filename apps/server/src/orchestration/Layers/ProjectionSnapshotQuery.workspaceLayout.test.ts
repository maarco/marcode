/**
 * Focused coverage for `workspaceLayoutVersion`/`workspaceLayout` surfacing
 * through every `ProjectionSnapshotQuery` read path, including the
 * backward-compatibility acceptance criterion (a row written before the
 * layout columns existed still decodes, defaulting to version 0 / an empty
 * layout). Split into its own file rather than appended to the already very
 * large `ProjectionSnapshotQuery.test.ts`.
 */
import { ProjectId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

const projectionSnapshotLayer = it.layer(
  OrchestrationProjectionSnapshotQueryLive.pipe(
    Layer.provideMerge(RepositoryIdentityResolver.layer),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(NodeServices.layer),
  ),
);

const explicitLayout = [
  { kind: "folder", id: "folder-1", parentId: null, rank: "a", relativePath: "src" },
  {
    kind: "thread",
    id: "thread:thread-1",
    parentId: "folder-1",
    rank: "a",
    threadId: "thread-1",
  },
];

projectionSnapshotLayer("ProjectionSnapshotQuery workspace layout", (it) => {
  it.effect(
    "surfaces an explicit non-default workspace layout through every project read path",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const snapshotQuery = yield* ProjectionSnapshotQuery;

        yield* sql`DELETE FROM projection_projects`;
        yield* sql`DELETE FROM projection_state`;

        yield* sql`
          INSERT INTO projection_projects (
            project_id, title, workspace_root, default_model_selection_json,
            scripts_json, workspace_layout_version, workspace_layout_json,
            created_at, updated_at, deleted_at
          ) VALUES (
            'project-layout', 'Project with layout', '/tmp/project-layout', NULL,
            '[]', 4, ${JSON.stringify(explicitLayout)},
            '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:01.000Z', NULL
          )
        `;

        const snapshot = yield* snapshotQuery.getSnapshot();
        assert.strictEqual(snapshot.projects[0]?.workspaceLayoutVersion, 4);
        assert.deepStrictEqual(snapshot.projects[0]?.workspaceLayout, explicitLayout);

        const commandReadModel = yield* snapshotQuery.getCommandReadModel();
        assert.strictEqual(commandReadModel.projects[0]?.workspaceLayoutVersion, 4);
        assert.deepStrictEqual(commandReadModel.projects[0]?.workspaceLayout, explicitLayout);

        const shellSnapshot = yield* snapshotQuery.getShellSnapshot();
        assert.strictEqual(shellSnapshot.projects[0]?.workspaceLayoutVersion, 4);
        assert.deepStrictEqual(shellSnapshot.projects[0]?.workspaceLayout, explicitLayout);

        const shellById = yield* snapshotQuery.getProjectShellById(
          ProjectId.make("project-layout"),
        );
        assert.strictEqual(Option.getOrNull(shellById)?.workspaceLayoutVersion, 4);
        assert.deepStrictEqual(Option.getOrNull(shellById)?.workspaceLayout, explicitLayout);

        const byWorkspaceRoot =
          yield* snapshotQuery.getActiveProjectByWorkspaceRoot("/tmp/project-layout");
        assert.strictEqual(Option.getOrNull(byWorkspaceRoot)?.workspaceLayoutVersion, 4);
        assert.deepStrictEqual(Option.getOrNull(byWorkspaceRoot)?.workspaceLayout, explicitLayout);
      }),
  );

  it.effect(
    "decodes a pre-workspace-layout row (columns omitted, SQL DEFAULT applies) as version 0 with an empty layout everywhere",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const snapshotQuery = yield* ProjectionSnapshotQuery;

        yield* sql`DELETE FROM projection_projects`;
        yield* sql`DELETE FROM projection_state`;

        // Deliberately omits workspace_layout_version/workspace_layout_json —
        // exercises the migration's column DEFAULTs, the same path an older
        // writer (or a row persisted before migration 033) would produce.
        yield* sql`
          INSERT INTO projection_projects (
            project_id, title, workspace_root, default_model_selection_json,
            scripts_json, created_at, updated_at, deleted_at
          ) VALUES (
            'project-legacy', 'Legacy project', '/tmp/project-legacy', NULL,
            '[]', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:01.000Z', NULL
          )
        `;

        const snapshot = yield* snapshotQuery.getSnapshot();
        assert.strictEqual(snapshot.projects[0]?.workspaceLayoutVersion, 0);
        assert.deepStrictEqual(snapshot.projects[0]?.workspaceLayout, []);

        const shellSnapshot = yield* snapshotQuery.getShellSnapshot();
        assert.strictEqual(shellSnapshot.projects[0]?.workspaceLayoutVersion, 0);
        assert.deepStrictEqual(shellSnapshot.projects[0]?.workspaceLayout, []);

        const shellById = yield* snapshotQuery.getProjectShellById(
          ProjectId.make("project-legacy"),
        );
        assert.strictEqual(Option.getOrNull(shellById)?.workspaceLayoutVersion, 0);
        assert.deepStrictEqual(Option.getOrNull(shellById)?.workspaceLayout, []);
      }),
  );
});
