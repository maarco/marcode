import { assert, it } from "@effect/vitest";

import { migrationEntries } from "./Migrations.ts";

it("keeps Marcode migration 33 and appends upstream thread lifecycle migrations", () => {
  // Marcode owns id 33. Upstream migrations that would have claimed it are
  // shifted up on each sync, so an already-applied install never renumbers.
  // This pin is intentional: a sync that adds a migration fails here loudly.
  // Upstream shipped these as 036-041; Marcode's ProjectWorkspaceLayout holds
  // 033, so every shared migration sits one id higher here.
  // Anchored on 33 rather than a fixed-size tail: with `slice(-N)` every added
  // migration slides 33 out of the window, so the failure reads as "33 is gone"
  // instead of "42 is new". Anchoring keeps the diff pointed at the real change.
  const marcodeOwnedIndex = migrationEntries.findIndex(([id]) => id === 33);
  assert.notEqual(marcodeOwnedIndex, -1, "Marcode's migration 33 must still exist");
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
      [42, "AuthSessionClientConnection"],
    ],
  );

  const ids = migrationEntries.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepStrictEqual(
    ids,
    [...ids].sort((left, right) => left - right),
  );
});
