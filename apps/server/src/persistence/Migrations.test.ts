import { assert, it } from "@effect/vitest";

import { migrationEntries } from "./Migrations.ts";

it("keeps Marcode migration 33 and appends upstream thread lifecycle migrations", () => {
  // Marcode owns id 33. Upstream migrations that would have claimed it are
  // shifted up on each sync, so an already-applied install never renumbers.
  // This pin is intentional: a sync that adds a migration fails here loudly.
  // Upstream shipped these as 032-047; Marcode's ProjectWorkspaceLayout holds
  // 033, so every shared migration sits one id higher here. The slice is sized
  // to keep id 33 inside the assertion: it is the anchor the offset is measured
  // from, so widen this window rather than let it slide past 33.
  assert.deepStrictEqual(
    migrationEntries.slice(-17).map(([id, name]) => [id, name]),
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
      // Upstream's 041; renumbered on the way in so 041 stays Marcode's.
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
