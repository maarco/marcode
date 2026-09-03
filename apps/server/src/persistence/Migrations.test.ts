import { assert, it } from "@effect/vitest";

import { migrationEntries } from "./Migrations.ts";

it("keeps Marcode migration 33 and appends upstream thread lifecycle migrations", () => {
  // Marcode owns id 33. Upstream migrations that would have claimed it are
  // shifted up on each sync, so an already-applied install never renumbers.
  // This pin is intentional: a sync that adds a migration fails here loudly.
  // Upstream shipped these as 036-041; Marcode's ProjectWorkspaceLayout holds
  // 033, so every shared migration sits one id higher here.
  assert.deepStrictEqual(
    migrationEntries.slice(-10).map(([id, name]) => [id, name]),
    [
      [39, "ProjectionThreadsPinOrderKey"],
      [40, "ProjectionProjectsDefaultThreadEnvMode"],
      [41, "ProjectionProjectFaviconPath"],
      // Marcode owns 42; the following are upstream migrations renumbered +1 on
      // the way in (upstream 042-047 -> Marcode 043-048) so applied ids never move.
      [42, "AuthSessionClientConnection"],
      [43, "ProjectionThreadLinkedPullRequest"],
      [44, "ProjectionThreadsUnsettledAt"],
      [45, "ClearAutomaticProjectModelDefaults"],
      [46, "ProjectionProjectsAutoPull"],
      [47, "RepairAutomaticSettlementTimestamps"],
      [48, "ProjectionProjectIcon"],
    ],
  );

  const ids = migrationEntries.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepStrictEqual(
    ids,
    [...ids].sort((left, right) => left - right),
  );
});
