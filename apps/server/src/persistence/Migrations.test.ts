import { assert, it } from "@effect/vitest";

import { migrationEntries } from "./Migrations.ts";
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
    migrationEntries.filter(([id]) => id >= 33 && id <= 49).map(([id, name]) => [id, name]),
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
