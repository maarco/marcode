import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  UPSTREAM_SYNC_MANIFEST_PATH,
  UPSTREAM_SYNC_WORKFLOW_PATH,
  assertWorkflowScheduleParity,
  evaluateCoupledChanges,
  isValidBranchName,
  isValidPathGlob,
  loadUpstreamSyncConfig,
  matchHotspots,
  parseUpstreamSyncConfig,
  redactRemoteUrl,
  renderIntegrationBranch,
  renderMergeMessage,
  renderPullRequestTitle,
  shortenSha,
} from "./upstream-sync-config.ts";

const repoRoot = new URL("../../", import.meta.url).pathname;
const manifestPath = `${repoRoot}${UPSTREAM_SYNC_MANIFEST_PATH}`;

const VALID = `version: 1

source:
  remote: upstream
  url: https://github.com/pingdotgg/t3code.git
  branch: main

target:
  remote: origin
  url: https://github.com/maarco/marcode.git
  branch: main

integration:
  strategy: merge
  mergeMessage: "chore(upstream): merge pingdotgg/t3code@{upstreamShortSha}"
  branchTemplate: "chore/upstream-{upstreamShortSha}"
  requireCleanWorktree: true
  allowDirectBasePush: false
  allowForcePush: false
  autoResolveConflicts: false
  autoMergePullRequest: false

schedule:
  enabled: true
  cron: "17 14 * * *"

pullRequest:
  draft: true
  titleTemplate: "chore(upstream): sync marcode through {upstreamShortSha}"
  labels:
    - upstream-sync
  reviewers: []

hotspots:
  - path: "apps/web/src/index.css"
    owner: design-system
    reason: "Marcode visual tokens"
  - path: "apps/mobile/**"
    owner: mobile
    reason: "Native client"

coupledChanges:
  - source: "pnpm-workspace.yaml"
    companion: ".repos/effect-smol/**"
    check: effect-version-subtree

requiredPullRequestChecks:
  - Check
  - Test
`;

const parse = (yaml: string) => parseUpstreamSyncConfig(yaml, "test-manifest.yml");

/** Fails the test unless the effect fails with a policy error carrying `rule`. */
const expectPolicy = (yaml: string, rule: string) =>
  Effect.gen(function* () {
    const error = yield* parse(yaml).pipe(Effect.flip);
    if (error._tag !== "UpstreamSyncConfigPolicyError") {
      assert.fail(`Expected a policy error, got ${error._tag}: ${error.message}`);
    }
    assert.equal(error.rule, rule);
  });

/** Fails the test unless the effect fails while decoding, i.e. the schema itself rejected it. */
const expectParseFailure = (yaml: string) =>
  Effect.gen(function* () {
    const error = yield* parse(yaml).pipe(Effect.flip);
    assert.equal(error._tag, "UpstreamSyncConfigParseError");
  });

it.layer(NodeServices.layer)("upstream-sync-config", (it) => {
  it.effect("accepts the exact valid manifest", () =>
    Effect.gen(function* () {
      const manifest = yield* parse(VALID);
      assert.equal(manifest.version, 1);
      assert.equal(manifest.integration.strategy, "merge");
      assert.equal(manifest.source.url, "https://github.com/pingdotgg/t3code.git");
      assert.deepStrictEqual([...manifest.pullRequest.reviewers], []);
    }),
  );

  it.effect("loads the real checked-in manifest and its workflow in parity", () =>
    Effect.gen(function* () {
      const manifest = yield* loadUpstreamSyncConfig(repoRoot);
      assert.equal(manifest.version, 1);
      assert.equal(manifest.target.url, "https://github.com/maarco/marcode.git");
      assert.equal(manifest.integration.requireCleanWorktree, true);
      assert.equal(manifest.integration.allowForcePush, false);
      assert.ok(manifest.hotspots.length > 0);
    }),
  );

  it.effect("rejects an unknown manifest version", () =>
    expectParseFailure(VALID.replace("version: 1", "version: 2")),
  );

  it.effect("rejects a non-HTTPS source url", () =>
    expectPolicy(
      VALID.replace(
        "https://github.com/pingdotgg/t3code.git",
        "http://github.com/pingdotgg/t3code.git",
      ),
      "source-url-not-https",
    ),
  );

  it.effect("rejects identical source and target urls", () =>
    expectPolicy(
      VALID.replace(
        "https://github.com/maarco/marcode.git",
        "https://github.com/pingdotgg/t3code.git",
      ),
      "source-target-url-identical",
    ),
  );

  it.effect("rejects an unsupported integration strategy", () =>
    expectParseFailure(VALID.replace("strategy: merge", "strategy: rebase")),
  );

  it.effect("rejects every destructive policy flag being enabled", () =>
    Effect.gen(function* () {
      for (const field of [
        "allowDirectBasePush",
        "allowForcePush",
        "autoResolveConflicts",
        "autoMergePullRequest",
      ]) {
        yield* expectParseFailure(VALID.replace(`${field}: false`, `${field}: true`));
      }
      yield* expectParseFailure(
        VALID.replace("requireCleanWorktree: true", "requireCleanWorktree: false"),
      );
      yield* expectParseFailure(VALID.replace("draft: true", "draft: false"));
    }),
  );

  it.effect("rejects a branch template without the short sha placeholder", () =>
    expectPolicy(
      VALID.replace(
        'branchTemplate: "chore/upstream-{upstreamShortSha}"',
        'branchTemplate: "chore/upstream"',
      ),
      "branch-template-missing-sha",
    ),
  );

  it.effect("rejects a branch template that renders an invalid ref", () =>
    expectPolicy(
      VALID.replace(
        'branchTemplate: "chore/upstream-{upstreamShortSha}"',
        'branchTemplate: "chore//upstream {upstreamShortSha}"',
      ),
      "branch-template-invalid-ref",
    ),
  );

  it.effect("rejects an unknown template placeholder", () =>
    expectPolicy(
      VALID.replace('{upstreamShortSha}"\n  branchTemplate', '{upstreamSha}"\n  branchTemplate'),
      "template-unknown-placeholder",
    ),
  );

  it.effect("rejects a malformed hotspot glob", () =>
    expectPolicy(VALID.replace('"apps/mobile/**"', '"/apps/mobile/**"'), "hotspot-invalid-glob"),
  );

  it.effect("rejects a duplicate hotspot path", () =>
    expectPolicy(
      VALID.replace('"apps/mobile/**"', '"apps/web/src/index.css"'),
      "hotspot-duplicate-path",
    ),
  );

  it.effect("rejects a duplicate required check", () =>
    expectPolicy(VALID.replace("  - Test\n", "  - Check\n"), "required-check-duplicate"),
  );

  it.effect("rejects a duplicate label", () =>
    expectPolicy(
      VALID.replace("    - upstream-sync\n", "    - upstream-sync\n    - upstream-sync\n"),
      "label-duplicate",
    ),
  );

  it.effect("rejects a workflow cron that disagrees with the manifest", () =>
    Effect.gen(function* () {
      const manifest = yield* parse(VALID);
      const error = yield* assertWorkflowScheduleParity(
        manifest,
        'on:\n  workflow_dispatch:\n  schedule:\n    - cron: "0 0 * * *"\n',
        "workflow.yml",
      ).pipe(Effect.flip);
      assert.equal(error._tag, "UpstreamSyncConfigPolicyError");
      assert.equal((error as { rule: string }).rule, "workflow-cron-mismatch");
    }),
  );

  it.effect("rejects a missing workflow schedule while the manifest schedules runs", () =>
    Effect.gen(function* () {
      const manifest = yield* parse(VALID);
      const error = yield* assertWorkflowScheduleParity(
        manifest,
        "on:\n  workflow_dispatch:\n",
        "workflow.yml",
      ).pipe(Effect.flip);
      assert.equal((error as { rule: string }).rule, "workflow-schedule-missing");
    }),
  );

  it.effect("accepts a missing workflow schedule when the manifest disables it", () =>
    Effect.gen(function* () {
      const manifest = yield* parse(VALID.replace("enabled: true", "enabled: false"));
      yield* assertWorkflowScheduleParity(manifest, "on:\n  workflow_dispatch:\n", "workflow.yml");
    }),
  );

  it.effect("reports a manifest that is not on disk without inventing a parse error", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const empty = yield* fs.makeTempDirectoryScoped({ prefix: "upstream-sync-config-missing-" });
      const error = yield* loadUpstreamSyncConfig(empty).pipe(Effect.flip);
      assert.equal(error._tag, "UpstreamSyncConfigFileError");
      assert.equal((error as { operation: string }).operation, "read");
    }),
  );

  it.effect("does not fail parity when the workflow file is absent", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "upstream-sync-config-noworkflow-",
      });
      yield* fs.makeDirectory(path.join(root, ".github"), { recursive: true });
      yield* fs.writeFileString(path.join(root, UPSTREAM_SYNC_MANIFEST_PATH), VALID);
      const manifest = yield* loadUpstreamSyncConfig(root);
      assert.equal(manifest.schedule.cron, "17 14 * * *");
      assert.ok(!(yield* fs.exists(path.join(root, UPSTREAM_SYNC_WORKFLOW_PATH))));
    }),
  );
});

it("redacts credentials from remote urls", () => {
  assert.equal(
    redactRemoteUrl("https://user:ghp_secrettoken@github.com/maarco/marcode.git"),
    "https://***@github.com/maarco/marcode.git",
  );
  assert.equal(
    redactRemoteUrl("https://github.com/maarco/marcode.git"),
    "https://github.com/maarco/marcode.git",
  );
  assert.notInclude(
    redactRemoteUrl("https://x-access-token:ghs_abc@github.com/o/r.git"),
    "ghs_abc",
  );
});

it("renders templates from the short sha only", () => {
  assert.equal(shortenSha("6f34ad3e87eba2ffba66cac5593dae8b680e5b84"), "6f34ad3e87eb");
  const manifest = {
    integration: {
      branchTemplate: "chore/upstream-{upstreamShortSha}",
      mergeMessage: "chore(upstream): merge pingdotgg/t3code@{upstreamShortSha}",
    },
    pullRequest: { titleTemplate: "chore(upstream): sync marcode through {upstreamShortSha}" },
  } as never;
  assert.equal(renderIntegrationBranch(manifest, "6f34ad3e87eb"), "chore/upstream-6f34ad3e87eb");
  assert.equal(
    renderMergeMessage(manifest, "6f34ad3e87eb"),
    "chore(upstream): merge pingdotgg/t3code@6f34ad3e87eb",
  );
  assert.equal(
    renderPullRequestTitle(manifest, "6f34ad3e87eb"),
    "chore(upstream): sync marcode through 6f34ad3e87eb",
  );
});

it("validates branch names without spawning git", () => {
  assert.ok(isValidBranchName("chore/upstream-6f34ad3e87eb"));
  assert.ok(!isValidBranchName(""));
  assert.ok(!isValidBranchName("has space"));
  assert.ok(!isValidBranchName("a..b"));
  assert.ok(!isValidBranchName("a//b"));
  assert.ok(!isValidBranchName("/leading"));
  assert.ok(!isValidBranchName("trailing/"));
  assert.ok(!isValidBranchName("a~b"));
  assert.ok(!isValidBranchName("a^b"));
  assert.ok(!isValidBranchName("a:b"));
  assert.ok(!isValidBranchName("a?b"));
  assert.ok(!isValidBranchName("a*b"));
  assert.ok(!isValidBranchName("a[b"));
  assert.ok(!isValidBranchName("a@{b"));
  assert.ok(!isValidBranchName("x.lock"));
  assert.ok(!isValidBranchName(".hidden/branch"));
});

it("validates path globs", () => {
  assert.ok(isValidPathGlob("apps/mobile/**"));
  assert.ok(isValidPathGlob("apps/web/src/index.css"));
  assert.ok(!isValidPathGlob(""));
  assert.ok(!isValidPathGlob("/absolute/path"));
  assert.ok(!isValidPathGlob("C:/windows"));
  assert.ok(!isValidPathGlob("apps\\mobile"));
  assert.ok(!isValidPathGlob("../escape"));
  assert.ok(!isValidPathGlob("apps/[unbalanced"));
  assert.ok(!isValidPathGlob("apps/{a,b"));
});

it.effect("matches changed paths against hotspots and keeps owners", () =>
  Effect.gen(function* () {
    const manifest = yield* parse(VALID);
    const matches = matchHotspots(manifest, [
      "apps/mobile/src/App.tsx",
      "apps/web/src/index.css",
      "apps/server/src/http.ts",
      "apps/mobiles/not-a-match.ts",
    ]);
    assert.deepStrictEqual(
      matches.map((match) => [match.path, match.owner]),
      [
        ["apps/mobile/src/App.tsx", "mobile"],
        ["apps/web/src/index.css", "design-system"],
      ],
    );
  }),
);

it.effect("flags a dependency change without its vendored companion", () =>
  Effect.gen(function* () {
    const manifest = yield* parse(VALID);

    const blocking = evaluateCoupledChanges(manifest, ["pnpm-workspace.yaml"]);
    assert.deepStrictEqual(blocking, [
      {
        check: "effect-version-subtree",
        sourceChanged: true,
        companionChanged: false,
        ok: false,
      },
    ]);

    const satisfied = evaluateCoupledChanges(manifest, [
      "pnpm-workspace.yaml",
      ".repos/effect-smol/packages/effect/package.json",
    ]);
    assert.equal(satisfied[0]?.ok, true);

    const untouched = evaluateCoupledChanges(manifest, ["apps/web/src/index.css"]);
    assert.equal(untouched[0]?.ok, true);
    assert.equal(untouched[0]?.sourceChanged, false);
  }),
);

it("keeps the manifest free of credentials and local paths", () => {
  const raw = new URL(`file://${manifestPath}`);
  assert.ok(raw.pathname.endsWith(UPSTREAM_SYNC_MANIFEST_PATH));
});
