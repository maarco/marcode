import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as Stream from "effect/Stream";

import { IDENTITY, fixtureGit, makeFixture, write } from "../fixtures/upstream-sync/fixture.ts";
import {
  UpstreamSyncPlanReport,
  assertNoForbiddenArguments,
  integrateUpstreamSync,
  planUpstreamSync,
  upstreamSyncStatus,
} from "./upstream-sync-git.ts";

const decodePlanReport = Schema.decodeUnknownEffect(UpstreamSyncPlanReport);

/** Snapshot of everything `plan` is forbidden from changing. */
const callerSnapshot = Effect.fn("callerSnapshot")(function* (caller: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const refs = yield* fs.readDirectory(path.join(caller, ".git", "refs", "heads"));
  const head = yield* fs.readFileString(path.join(caller, ".git", "HEAD"));
  return { refs: [...refs].toSorted().join(","), head };
});

it.layer(NodeServices.layer)("upstream-sync-git", (it) => {
  it.effect("reports up-to-date and creates nothing when upstream has no new commits", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("none");
      const before = yield* callerSnapshot(fixture.caller);

      const { report, probedTree } = yield* planUpstreamSync({ rootDir: fixture.caller });

      assert.equal(report.status, "up-to-date");
      assert.equal(report.upstreamCommits.length, 0);
      assert.equal(report.changedPaths.length, 0);
      assert.equal(probedTree, null);
      assert.deepStrictEqual(yield* callerSnapshot(fixture.caller), before);
      // @effect-diagnostics-next-line preferSchemaOverJson:off
      yield* decodePlanReport(JSON.parse(JSON.stringify(report)));
    }),
  );

  it.effect("plans a clean merge without touching the caller checkout", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");
      const before = yield* callerSnapshot(fixture.caller);

      const { report, probedTree } = yield* planUpstreamSync({ rootDir: fixture.caller });

      assert.equal(report.status, "clean-merge");
      assert.equal(report.upstreamCommits.length, 1);
      assert.deepStrictEqual([...report.changedPaths], ["added.txt"]);
      assert.equal(report.conflicts.length, 0);
      assert.ok(probedTree !== null);
      assert.equal(report.upstreamCommits[0]?.title, "upstream clean");
      assert.equal(report.upstreamCommits[0]?.author, "fixture");
      assert.deepStrictEqual(yield* callerSnapshot(fixture.caller), before);
      // @effect-diagnostics-next-line preferSchemaOverJson:off
      yield* decodePlanReport(JSON.parse(JSON.stringify(report)));
    }),
  );

  it.effect("reports a conflict as a structured plan and never as a thrown exception", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("conflict");

      const { report, probedTree } = yield* planUpstreamSync({ rootDir: fixture.caller });

      assert.equal(report.status, "conflicted");
      assert.equal(probedTree, null);
      assert.deepStrictEqual(
        report.conflicts.map((conflict) => conflict.path),
        ["shared.txt"],
      );
      // @effect-diagnostics-next-line preferSchemaOverJson:off
      yield* decodePlanReport(JSON.parse(JSON.stringify(report)));
    }),
  );

  it.effect("matches hotspots and flags coupled changes from real upstream commits", () =>
    Effect.gen(function* () {
      const hotspot = yield* makeFixture("hotspot");
      const hotspotPlan = yield* planUpstreamSync({ rootDir: hotspot.caller });
      assert.deepStrictEqual(
        hotspotPlan.report.hotspotMatches.map((match) => [match.path, match.owner]),
        [["hot/surface.ts", "hot-owner"]],
      );

      const coupled = yield* makeFixture("coupled");
      const coupledPlan = yield* planUpstreamSync({ rootDir: coupled.caller });
      assert.deepStrictEqual(
        [...coupledPlan.report.coupledChangeFindings],
        [
          {
            check: "fixture-subtree",
            sourceChanged: true,
            companionChanged: false,
            ok: false,
          },
        ],
      );
    }),
  );

  it.effect("integrate refuses a dirty caller checkout before doing anything", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");
      const path = yield* Path.Path;
      yield* write(path.join(fixture.caller, "shared.txt"), "uncommitted local work\n");

      const error = yield* integrateUpstreamSync({ rootDir: fixture.caller }).pipe(Effect.flip);

      assert.equal(error._tag, "UpstreamSyncStateError");
      assert.equal((error as { rule: string }).rule, "dirty-worktree");
      const branches = yield* (yield* FileSystem.FileSystem).readDirectory(
        path.join(fixture.caller, ".git", "refs", "heads"),
      );
      assert.deepStrictEqual([...branches], ["main"]);
      // The uncommitted work is still exactly where the developer left it.
      assert.equal(
        yield* (yield* FileSystem.FileSystem).readFileString(
          path.join(fixture.caller, "shared.txt"),
        ),
        "uncommitted local work\n",
      );
    }),
  );

  it.effect("integrate stops on a conflict without creating a branch", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("conflict");
      const path = yield* Path.Path;

      const error = yield* integrateUpstreamSync({ rootDir: fixture.caller }).pipe(Effect.flip);

      assert.equal((error as { rule: string }).rule, "merge-conflict");
      const branches = yield* (yield* FileSystem.FileSystem).readDirectory(
        path.join(fixture.caller, ".git", "refs", "heads"),
      );
      assert.deepStrictEqual([...branches], ["main"]);
    }),
  );

  it.effect("integrate creates one verified two-parent merge and leaves the worktree clean", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const result = yield* integrateUpstreamSync({ rootDir: fixture.caller });

      assert.equal(result.status, "integrated");
      assert.equal(result.pushed, false);
      assert.ok(result.integrationBranch?.startsWith("chore/upstream-"));
      assert.equal(result.plan.status, "clean-merge");

      const branches = yield* fs.readDirectory(path.join(fixture.caller, ".git", "refs", "heads"));
      // refs/heads/chore/upstream-<sha> nests, so the directory listing is ["chore", "main"].
      assert.deepStrictEqual([...branches].toSorted(), ["chore", "main"]);
      assert.ok(
        yield* fs.exists(
          path.join(fixture.caller, ".git", "refs", "heads", result.integrationBranch!),
        ),
      );

      // The temporary merge worktree was removed; only the repository itself remains.
      const worktreesDir = path.join(fixture.caller, ".git", "worktrees");
      const leftovers = (yield* fs.exists(worktreesDir))
        ? yield* fs.readDirectory(worktreesDir)
        : [];
      assert.deepStrictEqual([...leftovers], []);

      // The caller's own checkout never moved off main and is still clean.
      const head = yield* fs.readFileString(path.join(fixture.caller, ".git", "HEAD"));
      assert.equal(head.trim(), "ref: refs/heads/main");
    }),
  );

  it.effect("integrate refuses when the local integration branch already exists", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");

      const first = yield* integrateUpstreamSync({ rootDir: fixture.caller });
      const error = yield* integrateUpstreamSync({ rootDir: fixture.caller }).pipe(Effect.flip);

      assert.equal((error as { rule: string }).rule, "unexpected-integration-branch");
      assert.ok((error as { detail: string }).detail.includes(first.integrationBranch ?? ""));
    }),
  );

  it.effect("status reports a dirty checkout without refusing to run", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");
      const path = yield* Path.Path;
      yield* write(path.join(fixture.caller, "scratch.txt"), "local work\n");

      const report = yield* upstreamSyncStatus({ rootDir: fixture.caller });

      assert.equal(report.worktreeClean, false);
      assert.equal(report.upstreamHasNewCommits, true);
      assert.equal(report.integrationNeeded, true);
      assert.equal(report.remotesMatchManifest, true);
    }),
  );

  it.effect("status tolerates a missing named source remote and uses the manifest url", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");

      // The caller clone has `origin` but never had an `upstream` remote configured.
      const report = yield* upstreamSyncStatus({ rootDir: fixture.caller });

      assert.equal(report.remotesMatchManifest, true);
      assert.ok(report.sourceSha.length === 40);
    }),
  );

  it.effect("plan handles paths with spaces and unicode exactly", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("none");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const work = path.join(fixture.root, "unicode-work");
      yield* fixtureGit(fixture.root, ["clone", "--quiet", fixture.sourceRepo, work]);
      yield* write(path.join(work, "a file with spaces.txt"), "x\n");
      yield* write(path.join(work, "café/naïve.txt"), "y\n");
      yield* fixtureGit(work, ["add", "-A"]);
      yield* fixtureGit(work, [...IDENTITY, "commit", "-qm", "unicode"]);
      yield* fixtureGit(work, ["push", "--quiet", "origin", "main"]);

      const { report } = yield* planUpstreamSync({ rootDir: fixture.caller });

      assert.deepStrictEqual(
        [...report.changedPaths].toSorted(),
        ["a file with spaces.txt", "café/naïve.txt"].toSorted(),
      );
      assert.ok(yield* fs.exists(fixture.caller));
    }),
  );
});

it("refuses to build a command containing a destructive argument", () => {
  for (const forbidden of [
    ["push", "--force"],
    ["push", "-f"],
    ["reset", "--hard"],
    ["checkout", "--ours"],
    ["checkout", "--theirs"],
    ["config", "--global", "user.name", "x"],
    ["stash"],
    ["merge", "--allow-unrelated-histories"],
  ]) {
    assert.throws(() => assertNoForbiddenArguments(forbidden), /forbidden argument/);
  }
  assertNoForbiddenArguments(["merge", "--no-ff", "-m", "message", "abc123"]);
  assertNoForbiddenArguments(["push", "origin", "refs/heads/a:refs/heads/a"]);
});
