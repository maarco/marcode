# Upstream Sync Manifest and Automation

Status: implementation-ready proposal  
Scope: repository maintenance automation for `maarco/marcode` from `pingdotgg/t3code`  
Baseline verified: `6f34ad3e87eba2ffba66cac5593dae8b680e5b84` on 2026-07-22  
Delivery model: three agents, three non-overlapping lanes, one primary-agent integration pass

## 1. Directive

Create a checked-in YAML policy and a safe automation path that continuously detects and integrates
changes from the official T3 Code repository without overwriting Marcode-specific work.

The system must:

- know the canonical upstream repository and branch;
- detect new upstream commits;
- plan a merge without touching a dirty developer checkout;
- create or update a dedicated integration branch only when the merge is clean;
- open a draft pull request with exact commit and hotspot evidence;
- stop visibly on conflicts;
- never force push, auto-resolve conflicts, or write directly to `main`;
- let the existing pull-request CI prove the merged result.

## 2. Verified repository state

As of the baseline:

- `origin` fetch/push: `https://github.com/maarco/marcode.git`
- `upstream` fetch/push: `https://github.com/pingdotgg/t3code.git`
- current branch: `main`
- local `HEAD`: `6f34ad3e87eba2ffba66cac5593dae8b680e5b84`
- `origin/main`: the same commit
- current official `upstream/main`: the same commit
- ahead/behind at the committed graph: `0/0`
- the working tree contains a large set of pre-existing modified and untracked Marcode changes.

The first operational prerequisite is therefore not an upstream merge. It is turning the intended
Marcode changes into reviewed local commits. The sync tool must refuse to integrate from a dirty
base and explain that uncommitted work is outside Git’s merge graph.

The repository already has:

- `.github/workflows/ci.yml` with pull-request jobs:
  - `Check`;
  - `Test`;
  - `Mobile Native Static Analysis`;
  - `Release Smoke`.
- `scripts/sync-reference-repos.ts` for vendored dependency subtrees. That is a separate concern and
  must not be repurposed as the whole-repository upstream synchronizer.
- Effect schema/YAML support through `@t3tools/shared/schemaYaml`.
- Effect CLI/process patterns in `scripts/`.
- `actions/checkout@v6` and Vite+ setup conventions in existing workflows.

## 3. Safety invariant

> Upstream detection is automatic. Integration is reviewable. Conflict resolution is always human.

Derived rules:

- use merge, not rebase, for recurring upstream ingestion;
- preserve upstream commit identity and a stable merge base;
- run mutation only in a disposable CI checkout or explicit temporary worktree;
- treat Marcode hotspot paths as mandatory-review paths, not “always ours” paths;
- never use `git checkout --ours`, `git checkout --theirs`, force push, reset, or destructive cleanup
  as an automated resolution strategy;
- never auto-merge the resulting pull request;
- never open a pull request when upstream adds no commits;
- never silently succeed when a merge conflicts.

## 4. Architecture

The implementation has four checked-in layers:

1. `.github/upstream-sync.yml`
   - declarative source, policy, schedule, hotspot, and PR configuration.
2. `scripts/lib/upstream-sync-config.ts`
   - Effect schema and semantic validation.
3. `scripts/upstream-sync.ts`
   - read-only status/planning plus explicit integration execution.
4. `.github/workflows/upstream-sync.yml`
   - scheduled/manual orchestration, branch push, draft PR creation, conflict reporting.

The script owns Git decisions. The workflow owns GitHub Actions and PR/issue API calls. Business
rules must not be duplicated in shell snippets.

## 5. YAML manifest

Create `.github/upstream-sync.yml` with this v1 shape:

```yaml
version: 1

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
  titleTemplate: "chore(upstream): sync t3code through {upstreamShortSha}"
  labels:
    - upstream-sync
  reviewers: []

hotspots:
  - path: "apps/web/src/components/Sidebar.tsx"
    owner: web-navigation
    reason: "Marcode project and thread navigation"
  - path: "apps/web/src/components/ChatView.tsx"
    owner: web-runtime
    reason: "Marcode workspace, terminal, and browser integration"
  - path: "apps/web/src/rightPanelStore.ts"
    owner: web-runtime
    reason: "Marcode multi-surface state"
  - path: "apps/web/src/index.css"
    owner: design-system
    reason: "Marcode visual tokens and chrome"
  - path: "apps/server/src/provider/**"
    owner: provider-runtime
    reason: "Provider-specific Marcode behavior"
  - path: "apps/server/src/editor/**"
    owner: editor-runtime
    reason: "Marcode editor integration"
  - path: "apps/web/src/editor/**"
    owner: editor-runtime
    reason: "Marcode editor integration"
  - path: "apps/desktop/resources/**"
    owner: release-branding
    reason: "Marcode desktop branding"
  - path: "apps/mobile/**"
    owner: mobile
    reason: "Native client and Marcode branding"
  - path: "apps/marketing/**"
    owner: marketing
    reason: "Marcode public site and assets"
  - path: "assets/**"
    owner: release-branding
    reason: "Release channel and product assets"

coupledChanges:
  - source: "pnpm-workspace.yaml"
    companion: ".repos/effect-smol/**"
    check: effect-version-subtree
  - source: "infra/relay/package.json"
    companion: ".repos/alchemy-effect/**"
    check: alchemy-version-subtree

requiredPullRequestChecks:
  - Check
  - Test
  - Mobile Native Static Analysis
  - Release Smoke
```

### Manifest semantics

- `version`
  - required literal `1`;
  - unknown future version fails closed.
- `source`
  - canonical official repository;
  - `url` must use HTTPS;
  - source and target URL cannot be equal.
- `target`
  - Marcode repository/base branch.
- `integration.strategy`
  - v1 accepts only `merge`;
  - `rebase`, `squash`, and `subtree` are schema errors.
- `branchTemplate`
  - must contain `{upstreamShortSha}`;
  - rendered branch must pass `git check-ref-format --branch`.
- all four destructive policy fields
  - required literals matching the safe values above;
  - the parser rejects attempts to enable them rather than ignoring them.
- `schedule.cron`
  - metadata consumed by tests/docs;
  - GitHub Actions still requires a literal cron in the workflow, so a parity test must compare the
    workflow cron with the manifest cron.
- `reviewers`
  - empty is valid;
  - missing GitHub users must not break merge preparation; workflow reports reviewer assignment
    separately.
- `hotspots`
  - review metadata only;
  - never drives automated ours/theirs selection.
- `coupledChanges`
  - flags dependency/version changes that require corresponding vendored subtree review.
- `requiredPullRequestChecks`
  - documentation and PR-body evidence;
  - branch protection remains the enforcement source.

No token, SSH key, GitHub username, email address, signing secret, or local filesystem path belongs
in the manifest.

## 6. CLI contract

Add root scripts:

```json
{
  "upstream:status": "node scripts/upstream-sync.ts status",
  "upstream:plan": "node scripts/upstream-sync.ts plan",
  "upstream:integrate": "node scripts/upstream-sync.ts integrate"
}
```

### `status`

Read-only.

Behavior:

- load and validate manifest;
- verify repository root;
- inspect configured remotes without modifying them;
- query source and target branch heads with `git ls-remote`;
- report:
  - local `HEAD`;
  - target branch SHA;
  - upstream branch SHA;
  - merge base when objects are locally available;
  - whether upstream has new commits;
  - whether local working tree is clean;
  - whether the configured remote URLs match;
  - whether an integration branch/PR is likely needed.
- exit `0` when configuration and remote access are valid, including no-op state;
- exit nonzero for invalid configuration, remote mismatch, auth/network error, or non-repository
  invocation.

`status` never fetches, creates a branch, changes refs, or writes a report inside the checkout.

### `plan`

Read-only with a disposable temporary Git repository/worktree.

Behavior:

- load/validate manifest;
- fetch target and source branch into the disposable area;
- calculate exact commits in `target..source`;
- calculate changed paths and hotspot matches;
- use a non-mutating merge analysis first;
- when a real merge probe is needed, perform it only in the disposable worktree;
- return one result:
  - `up-to-date`;
  - `clean-merge`;
  - `conflicted`;
  - `unrelated-history`;
  - `error`.
- print human-readable summary to stdout;
- optionally write JSON to a caller-provided `--json-output <absolute path>`;
- clean only the exact temporary directory it created.

Required JSON fields:

```ts
type UpstreamSyncPlanReport = {
  status: "up-to-date" | "clean-merge" | "conflicted" | "unrelated-history" | "error";
  generatedAt: string;
  source: { url: string; branch: string; sha: string };
  target: { url: string; branch: string; sha: string };
  mergeBase: string | null;
  upstreamCommits: Array<{ sha: string; title: string; author: string; authoredAt: string }>;
  changedPaths: string[];
  hotspotMatches: Array<{ path: string; owner: string; reason: string }>;
  conflicts: Array<{ path: string; stages: string[] }>;
  coupledChangeFindings: Array<{
    check: string;
    sourceChanged: boolean;
    companionChanged: boolean;
    ok: boolean;
  }>;
};
```

Do not include patch content or repository secrets in JSON.

### `integrate`

Mutating and explicit.

Behavior:

- require a clean current worktree unless `--worktree <path>` points to a disposable clean worktree;
- require current branch/HEAD to match the configured target base SHA unless `--target-sha` matches;
- fetch source and target;
- call the same planner;
- exit `0` without branch creation when up to date;
- stop before mutation for conflicts/unrelated history;
- create only the exact rendered integration branch in a disposable CI checkout;
- merge source with `--no-ff` and the configured message;
- verify the resulting tree and parentage;
- print the created branch and merge SHA;
- push only when explicit `--push` is provided;
- push only to configured target remote;
- use normal push, never force;
- refuse if the remote branch exists at an unexpected SHA.

The local developer command defaults to no push. The workflow passes `--push`.

## 7. Git implementation rules

Use the Effect process APIs already established in `scripts/sync-reference-repos.ts`. Do not build
commands by concatenating shell strings.

Required command properties:

- arguments are arrays;
- stdout/stderr are captured with bounded reporting;
- errors identify operation, exit code, and safe command metadata;
- remote URLs containing credentials are redacted;
- temporary directories use the platform temp directory and a unique prefix;
- cleanup targets only the directory created by this invocation;
- signal/interrupt cleanup is covered;
- no broad deletion command;
- no mutation of global Git config;
- no credential persistence;
- no submodule/subtree mutation during plan.

Identity for CI merge commit:

- set repository-local `user.name` to `marcode-upstream-bot`;
- set repository-local `user.email` to the GitHub Actions noreply bot address;
- do not add attribution footers.

Merge verification:

- merge commit has exactly two parents;
- first parent equals target SHA;
- second parent equals upstream SHA;
- merge tree equals the probed clean merge tree;
- current branch equals rendered integration branch;
- no untracked/conflicted files remain;
- commit message matches the manifest template.

## 8. Workflow

Create `.github/workflows/upstream-sync.yml`.

Triggers:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: "17 14 * * *"
```

Permissions:

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: write
```

Concurrency:

```yaml
concurrency:
  group: upstream-sync-main
  cancel-in-progress: false
```

One prepare job on Ubuntu:

1. checkout target `main` with full history and persisted credentials;
2. set up Vite+ with the repository’s standard action;
3. run manifest/workflow parity validation;
4. run `node scripts/upstream-sync.ts plan --json-output "$RUNNER_TEMP/upstream-plan.json"`;
5. upload the plan JSON as an artifact on every non-no-op result;
6. branch by status:
   - `up-to-date`: write exact SHA summary and stop successfully;
   - `clean-merge`: integrate and push;
   - `conflicted` or `unrelated-history`: do not push a branch; create/update one tracking issue
     and fail the job;
   - `error`: fail without creating misleading sync state.
7. after a clean push, create or update one draft PR from the integration branch to `main`;
8. apply `upstream-sync` label;
9. request configured reviewers when non-empty;
10. write a job summary with source SHA, target SHA, commit count, changed-path count, hotspot list,
    coupled-change findings, integration branch, merge SHA, and PR URL.

### Pull-request behavior

- Use a deterministic branch per upstream SHA.
- Search for an existing open PR with that exact head before creating one.
- Re-running the workflow is idempotent.
- If the branch already exists and points to the expected merge SHA, reuse it.
- If the branch exists at another SHA, stop. Do not force-update it.
- PR is always draft.
- PR body includes:
  - source/target/merge SHAs;
  - upstream commit list with links;
  - changed-path count;
  - hotspot matches and owners;
  - coupled-change findings;
  - required existing CI jobs;
  - explicit statement that no conflicts were auto-resolved;
  - manual verification checklist.
- Do not auto-enable merge.
- Do not close a prior sync PR automatically.

### Conflict issue behavior

Maintain one open issue titled:

```text
upstream sync blocked: pingdotgg/t3code@<short-sha>
```

Body includes:

- target/source/merge-base SHAs;
- conflict paths;
- hotspot matches;
- safe local reproduction command using `upstream:plan`;
- statement that the bot did not resolve or push conflicts.

Do not post patch contents. Add label `upstream-sync-blocked`. If label creation is not authorized,
the workflow still creates/updates the issue and reports the label failure separately.

## 9. Hotspot policy

Hotspots are the paths where upstream changes are most likely to collide with Marcode behavior.

For each clean sync PR:

- list all matching changed paths;
- group them by manifest owner;
- require manual review before leaving draft;
- run the normal full PR CI;
- require user-visible runtime verification when web/mobile/desktop UI hotspots changed;
- require provider-focused tests when provider paths changed;
- require branding asset generation/checks when asset paths changed.

Hotspots do not mean “keep Marcode unchanged.” The reviewer must compare both intentions and produce a
combined result. An upstream security/correctness fix must not be discarded merely because it
touches a custom file.

## 10. Coupled vendored repositories

Whole-repository sync and `.repos` subtree sync are distinct, but upstream merges can change both.

Checks:

- if the `effect` catalog value in `pnpm-workspace.yaml` changes:
  - expect the upstream range to include `.repos/effect-smol/**` changes appropriate to the new tag;
  - run the existing reference-repo dry-run and report the resolved tag.
- if the `alchemy` dependency in `infra/relay/package.json` changes:
  - expect `.repos/alchemy-effect/**` review;
  - run the existing reference-repo dry-run and report the resolved tag.
- if source changes without companion changes:
  - do not auto-modify the subtree;
  - mark the PR with a blocking coupled-change finding.

The integration bot must not run `sync:repos --latest`.

## 11. Failure taxonomy

Create typed errors for:

- manifest read/parse/schema/semantic validation;
- not a Git repository;
- dirty worktree;
- source/target remote mismatch;
- remote query/fetch/auth/network error;
- invalid branch template;
- target base advanced during run;
- no common ancestor;
- merge conflict;
- unexpected integration branch;
- remote branch collision;
- merge parent/tree verification failure;
- push failure;
- report write failure.

Each error includes:

- stable tag;
- operation;
- safe path/remote/branch identifiers;
- exit code when present;
- redacted cause.

Expected upstream conflicts are not logged as generic exceptions. They produce a structured
`conflicted` plan and the workflow’s blocked issue.

## 12. File change inventory

### New files

- `.github/upstream-sync.yml`
- `.github/workflows/upstream-sync.yml`
- `scripts/lib/upstream-sync-config.ts`
- `scripts/lib/upstream-sync-config.test.ts`
- `scripts/lib/upstream-sync-git.ts`
- `scripts/lib/upstream-sync-git.test.ts`
- `scripts/upstream-sync.ts`
- `scripts/upstream-sync.test.ts`
- `scripts/fixtures/upstream-sync/README.md`
- `docs/operations/upstream-sync.md`

Test fixtures must be created dynamically in temporary directories. Do not commit nested `.git`
directories or generated repository objects under `scripts/fixtures`.

### Existing files

- `package.json`
  - add the three root scripts.
- `scripts/package.json`
  - add a dependency only if the existing workspace packages cannot provide required parsing/glob
    behavior.
- `scripts/tsconfig.json`
  - change only if new modules require an already-approved include.
- `docs/operations/ci.md`
  - document the detection/integration workflow and distinguish it from PR CI.
- `docs/README.md`
  - link the new operations guide.
- `AGENTS.md`
  - add the operational rule: upstream sync uses the manifest/plan command, never direct force or
    broad rollback commands.

Do not modify `.git/config` in the implementation change. The script validates remotes and can fetch
by manifest URL when the named source remote is absent.

## 13. Three-agent execution plan

Agents use separate branches/worktrees. No agent pushes or opens a PR during implementation. The
primary agent owns integration and live workflow proof.

### Agent 1 — manifest schema and policy engine

Owns:

- `.github/upstream-sync.yml`;
- `scripts/lib/upstream-sync-config.ts`;
- its test file;
- manifest/workflow parity helper.

Deliverables:

- exact Effect schema;
- URL/branch/template/policy semantic checks;
- redaction helper;
- schedule parity check;
- hotspot glob matcher;
- coupled-change policy evaluator;
- focused tests.

Must not edit:

- workflow;
- Git execution module;
- root package scripts/docs.

### Agent 2 — Git planner and integration engine

Owns:

- `scripts/lib/upstream-sync-git.ts`;
- its test file;
- `scripts/upstream-sync.ts`;
- its test file;
- temporary-repository fixture helpers.

Deliverables:

- `status`, `plan`, and `integrate`;
- disposable-worktree behavior;
- commit/path/hotspot/conflict report;
- clean merge creation and parent/tree verification;
- dirty checkout and branch-collision refusal;
- bounded/redacted process errors;
- focused tests using local bare repositories only.

Must not edit:

- manifest;
- workflow;
- docs.

### Agent 3 — GitHub workflow, reporting, and operator docs

Owns:

- `.github/workflows/upstream-sync.yml`;
- `package.json` script entries;
- `docs/operations/upstream-sync.md`;
- `docs/operations/ci.md`;
- `docs/README.md`;
- narrow `AGENTS.md` process addition.

Deliverables:

- scheduled/manual workflow;
- permissions/concurrency/idempotency;
- clean-merge branch/PR path;
- conflict issue path;
- artifact and job summaries;
- operator runbook and recovery instructions.

Must not edit:

- config/Git implementation modules;
- application packages.

### Integration order

1. Primary agent freezes the manifest and report types.
2. Agent 1 lands.
3. Agent 2 rebases and consumes the real config API.
4. Agent 3 rebases and consumes the real CLI/status contract.
5. Primary agent runs focused tests.
6. Primary agent runs local status/plan against current upstream.
7. Primary agent exercises workflow logic in a safe test branch/manual run.
8. Only after proof, primary agent submits the implementation for review. No auto-merge.

## 14. Focused test matrix

Use `vp test run <test-files>` for local focused tests.

### Config tests

- exact valid manifest;
- unknown version;
- HTTP/non-HTTPS source;
- identical source/target URLs;
- unsupported strategy;
- any destructive boolean enabled;
- missing SHA placeholder;
- invalid rendered branch;
- malformed hotspot glob;
- duplicate hotspot path/owner;
- duplicate required check;
- workflow cron mismatch;
- redaction of credential-bearing URL.

### Git planner tests

Create temporary local bare repos for:

- up to date;
- one clean upstream commit;
- multiple clean commits;
- overlapping clean edits;
- textual merge conflict;
- rename/delete conflict;
- add/add conflict;
- unrelated histories;
- target advances after plan;
- dirty current checkout;
- absent named source remote with valid manifest URL;
- source remote URL mismatch;
- pre-existing expected integration branch;
- pre-existing unexpected integration branch;
- interrupted process cleanup;
- paths with spaces/unicode;
- hotspot and coupled-change detection;
- no write outside exact temporary directory.

Assertions:

- plan never changes caller `HEAD`, index, worktree, or refs;
- integrate refuses dirty caller checkout;
- merge commit has exact parents;
- no force argument is ever produced;
- conflict run creates no pushed integration branch;
- no-op creates no branch;
- JSON report validates against its schema.

### Workflow tests

- YAML parses;
- literal cron equals manifest;
- permissions are minimal and sufficient;
- concurrency is present;
- checkout fetch depth is full;
- no direct base push;
- no force push string;
- no auto-merge step;
- clean branch creates/updates one draft PR;
- conflict path creates/updates one issue and fails;
- rerun reuses expected branch/PR;
- unexpected branch SHA fails;
- plan artifact uploads on blocked runs;
- empty reviewers do not fail.

## 15. Live verification

### Current repository proof

Run:

```sh
vp run upstream:status
vp run upstream:plan
```

Expected at the verified baseline:

- source/target SHA equal `6f34ad3e87eba2ffba66cac5593dae8b680e5b84`;
- status `up-to-date`;
- no integration branch;
- no commit;
- no PR;
- dirty-worktree state is reported but does not block read-only status/plan.

After upstream advances, use controlled local bare repositories first, then a manual Actions run on a
test branch configuration.

### Manual Actions proof

Prove:

1. no-op run writes a correct summary and no branch;
2. clean synthetic upstream run creates a normal merge commit and draft PR;
3. required existing CI jobs attach to the PR;
4. conflict synthetic run pushes no branch, creates/updates blocked issue, uploads report, and fails;
5. rerun is idempotent;
6. target-advanced race stops before push;
7. protected hotspot list matches actual changed paths.

Do not test conflict handling against `main` by manufacturing a destructive real conflict. Use a
temporary test repository or explicitly isolated branches.

## 16. Operator runbook requirements

`docs/operations/upstream-sync.md` must contain:

- what the automation does and does not do;
- verified source/target repositories;
- manifest field reference;
- status/plan/integrate commands;
- clean-sync PR review checklist;
- conflict reproduction in a disposable worktree;
- how to combine upstream and Marcode intent path by path;
- coupled subtree procedure;
- how to rerun after resolving and committing conflicts;
- branch collision recovery without force;
- token/permission requirements;
- how to disable schedule while retaining manual dispatch;
- how to update source branch/repository safely;
- evidence required before removing draft status;
- reminder that uncommitted local changes are invisible to merge history.

Conflict recovery must recommend a new human integration branch from the current target base, a
normal merge of the exact upstream SHA, manual file resolution, focused tests, and a review PR. It
must not recommend reset, broad restore/checkout, forced update, or deletion of an existing branch.

## 17. Acceptance criteria

### Safety

- Source and target are declared in checked-in YAML.
- Automatic run cannot push to `main`.
- Automatic run cannot force push.
- Automatic run cannot auto-resolve conflicts.
- Automatic run cannot auto-merge a PR.
- Dirty developer work is never stashed, reset, overwritten, or included accidentally.
- A remote branch collision stops the run.
- Conflict run pushes no integration branch.

### Correctness

- Up-to-date state is a true no-op.
- Clean upstream delta produces one two-parent merge commit.
- Merge parents and tree are verified before push.
- PR body lists exact upstream commits and hotspot paths.
- Required existing CI runs on the PR.
- Coupled vendored-repo drift is visible and blocking.
- Repeated run for the same upstream SHA is idempotent.
- Source/target advance races are detected.

### Operability

- `status` and `plan` are usable locally without changing the checkout.
- JSON artifact is sufficient to diagnose blocked runs.
- Conflict issue contains exact paths and SHAs.
- Workflow job summary has a direct PR/issue link.
- Empty reviewer configuration works.
- The schedule can be disabled by manifest/workflow change without deleting manual dispatch.

### Regression

- Existing CI remains unchanged except documentation/linkage.
- Existing release workflows remain unchanged.
- Existing `sync:repos` behavior remains unchanged.
- No application package code changes.
- No new secrets are required beyond repository `GITHUB_TOKEN` permissions.

## 18. Completion gate

The implementing primary agent may claim completion only with:

- surfaces: manifest, CLI modes, workflow paths, PR path, conflict issue path, docs, and existing CI
  listed as verified or unverified;
- live proof: exact source/target/merge SHAs and manual workflow run URLs;
- sibling sweep: no-op, clean merge, conflict, unrelated history, dirty checkout, branch collision,
  target race, hotspot, and coupled-change cases;
- regressions: focused test commands/counts and proof existing CI/release/reference-repo workflows
  still behave;
- truthfulness: no branch/PR/issue claimed unless observed;
- copy: consistent `upstream-sync` and `upstream-sync-blocked` labels and PR/issue titles;
- scope: only intended maintenance files changed and all application/dirty-tree work preserved;
- unverified: branch-protection/reviewer permission or production schedule gaps named plainly.
