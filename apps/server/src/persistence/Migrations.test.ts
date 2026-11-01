import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as SqlClient from "effect/sql/SqlClient";

import { migrationEntries, migrationManifest, runMigrations } from "./Migrations.ts";
import {
  MARCODE_MIGRATION_ID_START,
  marcodeMigrationEntries,
  validateMarcodeMigrationEntries,
} from "./marcodeMigrations.ts";

it("keeps Marcode migration 33 and appends upstream thread lifecycle migrations", () => {
  // Marcode owns id 33. Upstream migrations that would have claimed it are
  // shifted up on each sync, so an already-applied install never renumbers.
  // This pin is intentional: a sync that adds a migration fails here loudly.
  // Upstream shipped these as 032-047; Marcode's ProjectWorkspaceLayout holds
  // 033, so every shared migration sits one id higher here. Filter the frozen
  // deployed range explicitly so future 9000+ Marcode entries do not change
  // what this compatibility assertion covers.
  assert.deepStrictEqual(
    migrationEntries.filter(([id]) => id >= 33 && id <= 55).map(([id, name]) => [id, name]),
    [
      [33, "ProjectWorkspaceLayout"],
      [34, "ProjectionThreadsSettled"],
      [35, "ProjectionThreadsSnoozed"],
      [36, "ProjectionThreadTitleRegeneration"],
      [37, "ProjectionThreadsPinned"],
      [38, "ProjectionTurnsKeysetIndex"],
      [39, "ProjectionThreadsPinOrderKey"],
      [40, "ProjectionProjectsDefaultThreadEnvMode"],
      [41, "ProjectionProjectFaviconPath"],
      // Marcode owns 42; the following are upstream migrations renumbered +1 on
      // the way in (upstream 042-047 -> Marcode 043-048) so applied ids never move.
      [42, "AuthSessionClientConnection"],
      // Added by the 761d4bac sync as upstream's 042-047.
      [43, "ProjectionThreadLinkedPullRequest"],
      [44, "ProjectionThreadsUnsettledAt"],
      [45, "ClearAutomaticProjectModelDefaults"],
      [46, "ProjectionProjectsAutoPull"],
      [47, "RepairAutomaticSettlementTimestamps"],
      [48, "ProjectionProjectIcon"],
      // Added by the 223ff449 sync as upstream's 048.
      [49, "ProjectionThreadBranchPullRequest"],
      // Added by the 52b2bf77 sync as upstream's 049.
      [50, "ProjectionThreadsActiveOrderKey"],
      // Added by the d15210cd sync as upstream's 050-054.
      [51, "ProjectionThreadPullRequests"],
      [52, "ProjectionThreadMessageContext"],
      [53, "ProjectionThreadTitleState"],
      [54, "PullRequestFilesViewed"],
      [55, "ProjectionThreadsAutoSettleDisabledAt"],
    ],
  );

  const ids = migrationEntries.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepStrictEqual(
    ids,
    [...ids].sort((left, right) => left - right),
  );
});

it("reserves a separate high-numbered namespace for future Marcode migrations", () => {
  assert.ok(MARCODE_MIGRATION_ID_START >= 9000);
  validateMarcodeMigrationEntries(marcodeMigrationEntries);
  assert.deepStrictEqual(
    migrationEntries.slice(0, 49).map(([id]) => id),
    Array.from({ length: 49 }, (_, index) => index + 1),
  );
});

const FIRST_UPSTREAM_ADDITION_ID = 56;
const upstreamAdditions = migrationManifest.filter(([id]) => id >= FIRST_UPSTREAM_ADDITION_ID);
// A Marcode-only migration from the 9000+ registry that an install may already have recorded.
const MARCODE_RECORDED_ID = 9000;

const history = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly migration_id: number; readonly name: string }>`
    SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
  `;
  return rows.map((row) => [row.migration_id, row.name] as const);
});

const v2TableCount = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'orchestration_v2_%'
  `;
  return rows.length;
});

describe("runMigrations", () => {
  it.effect("applies every migration to a fresh database", () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* runMigrations(), migrationManifest);
      assert.deepStrictEqual(yield* history, migrationManifest);
      assert.isAbove(yield* v2TableCount, 0);
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("upgrades a Marcode database at exactly 55", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 55 });
      assert.deepStrictEqual(yield* runMigrations(), upstreamAdditions);
      assert.deepStrictEqual(yield* history, migrationManifest);
      assert.isAbove(yield* v2TableCount, 0);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("runs each new upstream migration once when a 9000+ id is already recorded", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 55 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (${MARCODE_RECORDED_ID}, 'MarcodeFutureMigration')
      `;

      // The migrator alone would skip 56-77 here because they sit below the recorded 9000.
      assert.deepStrictEqual(yield* runMigrations(), upstreamAdditions);
      assert.isAbove(yield* v2TableCount, 0);
      assert.deepStrictEqual(yield* history, [
        ...migrationManifest,
        [MARCODE_RECORDED_ID, "MarcodeFutureMigration"],
      ]);
      // A second start has nothing left to run.
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("refuses to start when another build recorded a different migration at a new id", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 55 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (${FIRST_UPSTREAM_ADDITION_ID}, 'FutureMainMigration')
      `;
      const before = yield* history;

      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 55 }), []);
      const exit = yield* Effect.exit(runMigrations());

      assert.isTrue(Exit.isFailure(exit));
      assert.include(String(exit), "56_OrchestrationV2 (recorded: FutureMainMigration)");
      assert.deepStrictEqual(yield* history, before);
      assert.strictEqual(yield* v2TableCount, 0);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect.each([30, 55])("still starts with a site-local migration at id %s", (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 55 });
      yield* sql`
        UPDATE effect_sql_migrations SET name = 'SiteLocalMigration' WHERE migration_id = ${id}
      `;

      assert.deepStrictEqual(yield* runMigrations(), upstreamAdditions);
      assert.isAbove(yield* v2TableCount, 0);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("only checks and applies migrations within the requested limit", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 55 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (57, 'SiteLocalMigration'), (${MARCODE_RECORDED_ID}, 'NewerMigration')
      `;

      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 55 }), []);
      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 56 }), [
        [56, "OrchestrationV2"],
      ]);
      const before = yield* history;
      const exit = yield* Effect.exit(runMigrations({ toMigrationInclusive: 57 }));
      assert.isTrue(Exit.isFailure(exit));
      assert.include(
        String(exit),
        "57_RemoveRedundantProjectionIndexes (recorded: SiteLocalMigration)",
      );
      assert.notInclude(String(exit), "58_ScheduledTaskWebhooks");
      assert.deepStrictEqual(yield* history, before);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});
