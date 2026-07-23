import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { makeFixture, write } from "./fixtures/upstream-sync/fixture.ts";
import { UpstreamSyncPlanReport } from "./lib/upstream-sync-git.ts";
import { runIntegrate, runPlan, runStatus } from "./upstream-sync.ts";

const decodePlanReport = Schema.decodeUnknownEffect(UpstreamSyncPlanReport);

it.layer(NodeServices.layer)("upstream-sync cli", (it) => {
  it.effect("plan writes a schema-valid report to the requested path", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const output = path.join(fixture.root, "reports", "plan.json");

      const report = yield* runPlan(fixture.caller, output).pipe(Effect.scoped);

      assert.equal(report.status, "clean-merge");
      assert.ok(yield* fs.exists(output));
      // @effect-diagnostics-next-line preferSchemaOverJson:off
      const written = yield* decodePlanReport(JSON.parse(yield* fs.readFileString(output)));
      assert.equal(written.status, "clean-merge");
      assert.equal(written.source.sha, report.source.sha);
      assert.equal(written.upstreamCommits.length, 1);
    }),
  );

  it.effect("plan never writes a report when no output path is given", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      yield* runPlan(fixture.caller, undefined).pipe(Effect.scoped);

      assert.ok(!(yield* fs.exists(path.join(fixture.caller, "plan.json"))));
    }),
  );

  it.effect("plan reports a conflict as a normal result rather than failing", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("conflict");
      const path = yield* Path.Path;
      const output = path.join(fixture.root, "conflicted.json");

      const report = yield* runPlan(fixture.caller, output).pipe(Effect.scoped);

      assert.equal(report.status, "conflicted");
      assert.equal(report.conflicts.length, 1);
    }),
  );

  it.effect("status succeeds against a dirty checkout and reports it", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");
      const path = yield* Path.Path;
      yield* write(path.join(fixture.caller, "local.txt"), "developer work\n");

      const report = yield* runStatus(fixture.caller);

      assert.equal(report.worktreeClean, false);
      assert.equal(report.integrationNeeded, true);
    }),
  );

  it.effect("integrate writes its report and records the branch it created", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("clean");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const output = path.join(fixture.root, "integrate.json");

      const result = yield* runIntegrate({
        rootDir: fixture.caller,
        jsonOutput: output,
        push: false,
        targetSha: undefined,
        worktree: undefined,
      }).pipe(Effect.scoped);

      assert.equal(result.status, "integrated");
      assert.equal(result.pushed, false);
      assert.ok(result.mergeSha !== null);
      assert.ok(yield* fs.exists(output));
      // The embedded plan is the one integrate acted on — the workflow builds the PR body from it.
      assert.equal(result.plan.source.sha, result.plan.upstreamCommits[0]?.sha);
    }),
  );

  it.effect("integrate on an up-to-date repository creates no branch and no commit", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture("none");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const result = yield* runIntegrate({
        rootDir: fixture.caller,
        jsonOutput: undefined,
        push: false,
        targetSha: undefined,
        worktree: undefined,
      }).pipe(Effect.scoped);

      assert.equal(result.status, "up-to-date");
      assert.equal(result.integrationBranch, null);
      assert.equal(result.mergeSha, null);
      const branches = yield* fs.readDirectory(path.join(fixture.caller, ".git", "refs", "heads"));
      assert.deepStrictEqual([...branches], ["main"]);
    }),
  );
});
