// Shared fixture builder for the upstream-sync tests. Everything it creates lives in a scoped
// temporary directory; no repository state is ever committed under scripts/fixtures.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { UPSTREAM_SYNC_MANIFEST_PATH } from "../../lib/upstream-sync-config.ts";

export type UpstreamSyncDivergence = "none" | "clean" | "conflict" | "hotspot" | "coupled";

export interface Fixture {
  readonly root: string;
  readonly targetRepo: string;
  readonly sourceRepo: string;
  readonly caller: string;
}

/** Runs git directly (not through the module) to build fixtures. Temp directories only. */
export const fixtureGit = Effect.fn("fixtureGit")(function* (
  cwd: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(ChildProcess.make("git", [...args], { cwd }));
  const [stderr, exitCode] = yield* Effect.all([
    child.stderr.pipe(
      Stream.decodeText(),
      Stream.runFold(
        () => "",
        (a, c) => a + c,
      ),
    ),
    child.exitCode.pipe(Effect.map(Number)),
  ]);
  if (exitCode !== 0) {
    return yield* Effect.die(new Error(`fixture git ${args.join(" ")} failed: ${stderr}`));
  }
}, Effect.scoped);

export const IDENTITY = [
  "-c",
  "user.name=fixture",
  "-c",
  "user.email=fixture@example.test",
] as const;

function manifestFor(sourceRepo: string, targetRepo: string): string {
  return `version: 1
source:
  remote: upstream
  url: file://${sourceRepo}
  branch: main
target:
  remote: origin
  url: file://${targetRepo}
  branch: main
integration:
  strategy: merge
  mergeMessage: "chore(upstream): merge fixture@{upstreamShortSha}"
  branchTemplate: "chore/upstream-{upstreamShortSha}"
  requireCleanWorktree: true
  allowDirectBasePush: false
  allowForcePush: false
  autoResolveConflicts: false
  autoMergePullRequest: false
schedule:
  enabled: false
  cron: "17 14 * * *"
pullRequest:
  draft: true
  titleTemplate: "chore(upstream): sync fixture through {upstreamShortSha}"
  labels:
    - upstream-sync
  reviewers: []
hotspots:
  - path: "hot/**"
    owner: hot-owner
    reason: "fixture hotspot"
coupledChanges:
  - source: "deps.json"
    companion: "vendor/**"
    check: fixture-subtree
requiredPullRequestChecks:
  - Check
`;
}

export const write = Effect.fn("write")(function* (file: string, content: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(file, content);
});

/**
 * Builds two real repositories that share a base commit, plus a caller checkout of the target.
 * `divergence` decides what the upstream side does after the shared base.
 */
export const makeFixture = Effect.fn("makeFixture")(function* (divergence: UpstreamSyncDivergence) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "upstream-sync-fixture-" });
  const targetRepo = path.join(root, "target.git");
  const sourceRepo = path.join(root, "source.git");
  const seed = path.join(root, "seed");
  const caller = path.join(root, "caller");

  yield* fs.makeDirectory(seed, { recursive: true });
  yield* fixtureGit(seed, ["init", "--quiet", "--initial-branch=main"]);
  yield* write(path.join(seed, "shared.txt"), "base\n");
  yield* write(path.join(seed, "deps.json"), '{"dep":"1"}\n');
  yield* fixtureGit(seed, ["add", "-A"]);
  yield* fixtureGit(seed, [...IDENTITY, "commit", "-qm", "base"]);

  yield* fs.makeDirectory(targetRepo, { recursive: true });
  yield* fixtureGit(targetRepo, ["init", "--quiet", "--bare", "--initial-branch=main"]);
  yield* fs.makeDirectory(sourceRepo, { recursive: true });
  yield* fixtureGit(sourceRepo, ["init", "--quiet", "--bare", "--initial-branch=main"]);
  yield* fixtureGit(seed, ["push", "--quiet", targetRepo, "main:main"]);
  yield* fixtureGit(seed, ["push", "--quiet", sourceRepo, "main:main"]);

  if (divergence !== "none") {
    const upstreamWork = path.join(root, "upstream-work");
    yield* fixtureGit(root, ["clone", "--quiet", sourceRepo, upstreamWork]);
    if (divergence === "clean") {
      yield* write(path.join(upstreamWork, "added.txt"), "upstream only\n");
    } else if (divergence === "conflict") {
      yield* write(path.join(upstreamWork, "shared.txt"), "upstream version\n");
    } else if (divergence === "hotspot") {
      yield* write(path.join(upstreamWork, "hot", "surface.ts"), "export const x = 1;\n");
    } else {
      yield* write(path.join(upstreamWork, "deps.json"), '{"dep":"2"}\n');
    }
    yield* fixtureGit(upstreamWork, ["add", "-A"]);
    yield* fixtureGit(upstreamWork, [...IDENTITY, "commit", "-qm", `upstream ${divergence}`]);
    yield* fixtureGit(upstreamWork, ["push", "--quiet", "origin", "main"]);
  }

  if (divergence === "conflict") {
    const targetWork = path.join(root, "target-work");
    yield* fixtureGit(root, ["clone", "--quiet", targetRepo, targetWork]);
    yield* write(path.join(targetWork, "shared.txt"), "marcode version\n");
    yield* fixtureGit(targetWork, ["add", "-A"]);
    yield* fixtureGit(targetWork, [...IDENTITY, "commit", "-qm", "marcode change"]);
    yield* fixtureGit(targetWork, ["push", "--quiet", "origin", "main"]);
  }

  yield* fixtureGit(root, ["clone", "--quiet", targetRepo, caller]);
  yield* fixtureGit(caller, ["remote", "set-url", "origin", `file://${targetRepo}`]);
  yield* fixtureGit(caller, ["config", "user.name", "fixture"]);
  yield* fixtureGit(caller, ["config", "user.email", "fixture@example.test"]);
  yield* write(path.join(caller, UPSTREAM_SYNC_MANIFEST_PATH), manifestFor(sourceRepo, targetRepo));
  yield* fixtureGit(caller, ["add", "-A"]);
  yield* fixtureGit(caller, [...IDENTITY, "commit", "-qm", "add sync manifest"]);
  yield* fixtureGit(caller, ["push", "--quiet", "origin", "main"]);

  return { root, targetRepo, sourceRepo, caller } satisfies Fixture;
});
