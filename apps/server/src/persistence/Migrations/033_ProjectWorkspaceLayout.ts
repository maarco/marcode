import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Adds the unified workspace tree sidebar's persisted layout columns to
 * `projection_projects`. Both columns are `NOT NULL DEFAULT`-backed so every
 * existing row (and every row inserted by older, not-yet-upgraded code
 * paths) reads back as version 0 with an empty layout — the same
 * "old projects decode with an empty layout" contract enforced at the
 * contracts-schema layer via `Schema.withDecodingDefault`.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const projectColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;

  if (!projectColumns.some((column) => column.name === "workspace_layout_version")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN workspace_layout_version INTEGER NOT NULL DEFAULT 0
    `;
  }

  if (!projectColumns.some((column) => column.name === "workspace_layout_json")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN workspace_layout_json TEXT NOT NULL DEFAULT '[]'
    `;
  }
});
