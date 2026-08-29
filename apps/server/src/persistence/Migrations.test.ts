import { assert, it } from "@effect/vitest";

import { migrationEntries } from "./Migrations.ts";

it("keeps Marcode migration 33 and appends upstream thread lifecycle migrations", () => {
  // Marcode owns id 33. Upstream migrations that would have claimed it are
  // shifted up on each sync, so an already-applied install never renumbers.
  // This pin is intentional: a sync that adds a migration fails here loudly.
  //
  // Anchored on id 33 rather than a fixed tail window: every upstream sync
  // appends, and a `slice(-n)` would quietly slide the fork-critical row out.
  assert.deepStrictEqual(
    migrationEntries.filter(([id]) => id >= 33).map(([id, name]) => [id, name]),
    [
      [33, "ProjectWorkspaceLayout"],
      // Upstream shipped the rest of this list as 033-043. Marcode's
      // ProjectWorkspaceLayout holds 033, so each one sits an id higher here
      // and every new upstream migration is renamed on the way in.
      [34, "ProjectionThreadsSettled"],
      [35, "ProjectionThreadsSnoozed"],
      [36, "ProjectionThreadTitleRegeneration"],
      [37, "ProjectionThreadsPinned"],
      [38, "ProjectionTurnsKeysetIndex"],
      [39, "ProjectionThreadsPinOrderKey"],
      [40, "ProjectionProjectsDefaultThreadEnvMode"],
      [41, "ProjectionProjectFaviconPath"],
      [42, "AuthSessionClientConnection"],
      [43, "ProjectionThreadLinkedPullRequest"],
      [44, "ProjectionThreadsUnsettledAt"],
    ],
  );

  const ids = migrationEntries.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepStrictEqual(
    ids,
    [...ids].sort((left, right) => left - right),
  );
});
