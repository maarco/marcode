import { assert, it } from "@effect/vitest";

import { migrationEntries } from "./Migrations.ts";

it("keeps Marcode migration 33 and appends upstream thread lifecycle migrations", () => {
  // Marcode owns id 33. Upstream migrations that would have claimed it are
  // shifted up on each sync, so an already-applied install never renumbers.
  // This pin is intentional: a sync that adds a migration fails here loudly.
  // Upstream shipped these as 032-044; Marcode's ProjectWorkspaceLayout holds
  // 033, so every shared migration sits one id higher here.
  //
  // Anchored at 33 rather than a trailing slice: a fixed window slides off the
  // Marcode-owned id once upstream adds enough migrations, which would quietly
  // stop pinning the thing this test exists to pin.
  const marcodeOwnedIndex = migrationEntries.findIndex(([id]) => id === 33);
  assert.notEqual(marcodeOwnedIndex, -1, "Marcode's migration 33 must stay registered");

  assert.deepStrictEqual(
    migrationEntries.slice(marcodeOwnedIndex).map(([id, name]) => [id, name]),
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
      // Upstream's 042 and 043, renumbered on the b883fc06 sync.
      [43, "ProjectionThreadLinkedPullRequest"],
      [44, "ProjectionThreadsUnsettledAt"],
      // Upstream's 044, renumbered on the 70cd258d sync.
      [45, "ClearAutomaticProjectModelDefaults"],
    ],
  );

  const ids = migrationEntries.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepStrictEqual(
    ids,
    [...ids].sort((left, right) => left - right),
  );
});
