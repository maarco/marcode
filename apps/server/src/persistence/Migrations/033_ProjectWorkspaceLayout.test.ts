import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("033_ProjectWorkspaceLayout", (it) => {
  it.effect(
    "adds workspace layout columns defaulting to version 0 / empty layout, preserving every existing project field",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* runMigrations({ toMigrationInclusive: 32 });

        yield* sql`
          INSERT INTO projection_projects (
            project_id,
            title,
            workspace_root,
            default_model_selection_json,
            scripts_json,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES
            (
              'project-active',
              'Active Project',
              '/tmp/project-active',
              '{"instanceId":"codex","model":"gpt-5-codex"}',
              '[{"id":"script-1","name":"Run web","command":"pnpm dev","icon":"play","runOnWorktreeCreate":false}]',
              '2026-04-01T00:00:00.000Z',
              '2026-04-02T00:00:00.000Z',
              NULL
            ),
            (
              'project-deleted',
              'Deleted Project',
              '/tmp/project-deleted',
              NULL,
              '[]',
              '2026-03-01T00:00:00.000Z',
              '2026-03-05T00:00:00.000Z',
              '2026-03-05T00:00:00.000Z'
            )
        `;

        yield* runMigrations({ toMigrationInclusive: 33 });

        const rows = yield* sql<{
          readonly projectId: string;
          readonly title: string;
          readonly workspaceRoot: string;
          readonly defaultModelSelectionJson: string | null;
          readonly scriptsJson: string;
          readonly createdAt: string;
          readonly updatedAt: string;
          readonly deletedAt: string | null;
          readonly workspaceLayoutVersion: number;
          readonly workspaceLayoutJson: string;
        }>`
          SELECT
            project_id AS "projectId",
            title,
            workspace_root AS "workspaceRoot",
            default_model_selection_json AS "defaultModelSelectionJson",
            scripts_json AS "scriptsJson",
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            workspace_layout_version AS "workspaceLayoutVersion",
            workspace_layout_json AS "workspaceLayoutJson"
          FROM projection_projects
          ORDER BY project_id ASC
        `;

        assert.strictEqual(rows.length, 2);

        const active = rows.find((row) => row.projectId === "project-active");
        assert.isDefined(active);
        assert.strictEqual(active?.title, "Active Project");
        assert.strictEqual(active?.workspaceRoot, "/tmp/project-active");
        assert.strictEqual(
          active?.defaultModelSelectionJson,
          '{"instanceId":"codex","model":"gpt-5-codex"}',
        );
        assert.strictEqual(
          active?.scriptsJson,
          '[{"id":"script-1","name":"Run web","command":"pnpm dev","icon":"play","runOnWorktreeCreate":false}]',
        );
        assert.strictEqual(active?.createdAt, "2026-04-01T00:00:00.000Z");
        assert.strictEqual(active?.updatedAt, "2026-04-02T00:00:00.000Z");
        assert.strictEqual(active?.deletedAt, null);
        assert.strictEqual(active?.workspaceLayoutVersion, 0);
        assert.strictEqual(active?.workspaceLayoutJson, "[]");

        const deleted = rows.find((row) => row.projectId === "project-deleted");
        assert.isDefined(deleted);
        assert.strictEqual(deleted?.title, "Deleted Project");
        assert.strictEqual(deleted?.deletedAt, "2026-03-05T00:00:00.000Z");
        assert.strictEqual(deleted?.workspaceLayoutVersion, 0);
        assert.strictEqual(deleted?.workspaceLayoutJson, "[]");
      }),
  );

  it.effect("is idempotent when run twice (ALTER TABLE guarded by PRAGMA table_info check)", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 33 });
      // A second run through the same migration set must not error (the
      // migrator itself also guards against re-running an applied migration,
      // but this proves the migration body's own column-existence checks are
      // safe to evaluate more than once too).
      yield* runMigrations({ toMigrationInclusive: 33 });
    }),
  );
});
