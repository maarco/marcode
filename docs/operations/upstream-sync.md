# Upstream sync

Marcode is a fork of the official T3 Code repository. This automation continuously detects new
upstream commits and prepares a reviewable merge. It never decides what the merged result should
look like.

> Upstream detection is automatic. Integration is reviewable. Conflict resolution is always human.

## What it does and does not do

Does:

- read a checked-in policy from `.github/upstream-sync.yml`;
- query the official repository for new commits on a schedule and on demand;
- plan the merge in a disposable temporary repository, never in your checkout;
- create one deterministic integration branch per upstream commit and one normal two-parent merge
  commit, only when the merge is clean;
- verify the merge parents and tree against a non-mutating merge probe before pushing;
- open or update one **draft** pull request with the exact commits, changed paths, hotspot owners,
  and coupled-subtree findings;
- stop visibly and file one tracking issue when the merge conflicts.

Does not:

- push to `main`;
- force push, reset, stash, or delete anything;
- resolve conflicts, choose "ours" or "theirs", or reorder history;
- auto-merge or auto-approve the pull request;
- open a pull request when upstream added no commits;
- touch your uncommitted work.

## Repositories

| role              | remote     | url                                       | branch |
| ----------------- | ---------- | ----------------------------------------- | ------ |
| source (official) | `upstream` | `https://github.com/pingdotgg/t3code.git` | `main` |
| target (Marcode)  | `origin`   | `https://github.com/maarco/marcode.git`   | `main` |

The named remotes are a convenience. The manifest URLs are authoritative: the tooling works in a
clone that has no `upstream` remote configured, and it fails loudly when a configured remote points
somewhere other than the manifest URL.

## Commands

```sh
vp run upstream:status     # read-only: where are we, is anything new
vp run upstream:plan       # read-only: exact commits, paths, hotspots, conflicts
vp run upstream:integrate  # explicit: create the integration branch and merge commit
```

`status` and `plan` never change your checkout — no fetch into your object store, no refs, no index,
no working tree. `plan` does its work in a temporary clone it deletes afterwards. Add
`--json-output <absolute path>` to `plan` for the machine-readable report (same shape the workflow
uploads as an artifact).

`integrate` is the only mutating command:

- it refuses to run against a dirty working tree;
- it refuses when your `HEAD` is not the configured target base (override with `--target-sha` only
  when you know the base moved and you mean it);
- it does the merge inside a disposable `git worktree` and removes that worktree afterwards, leaving
  the integration branch behind for review;
- it does not push unless you pass `--push`. The workflow passes `--push`; you normally should not.

**Uncommitted changes are invisible to merge history.** Git merges commits, not working trees. If
your Marcode work is not committed, the sync cannot see it, cannot conflict with it, and will not
protect it. Commit your intended changes before integrating anything.

## Manifest reference — `.github/upstream-sync.yml`

| field                                | meaning                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `version`                            | required literal `1`. An unknown version fails closed.                                                   |
| `source`                             | official repository remote name, HTTPS url, branch.                                                      |
| `target`                             | Marcode repository remote name, HTTPS url, base branch.                                                  |
| `integration.strategy`               | only `merge` in v1. `rebase`/`squash`/`subtree` are schema errors.                                       |
| `integration.mergeMessage`           | merge commit subject. Supports `{upstreamShortSha}`.                                                     |
| `integration.branchTemplate`         | must contain `{upstreamShortSha}` and render a valid git ref.                                            |
| `integration.requireCleanWorktree`   | must stay `true`.                                                                                        |
| `integration.allowDirectBasePush`    | must stay `false`.                                                                                       |
| `integration.allowForcePush`         | must stay `false`.                                                                                       |
| `integration.autoResolveConflicts`   | must stay `false`.                                                                                       |
| `integration.autoMergePullRequest`   | must stay `false`.                                                                                       |
| `schedule.enabled` / `schedule.cron` | schedule metadata; a parity test pins the workflow's literal cron to this value.                         |
| `pullRequest.draft`                  | must stay `true`.                                                                                        |
| `pullRequest.titleTemplate`          | PR title. Supports `{upstreamShortSha}`.                                                                 |
| `pullRequest.labels`                 | labels applied to the sync PR.                                                                           |
| `pullRequest.reviewers`              | GitHub logins to request. Empty is valid and does not fail a run.                                        |
| `hotspots[]`                         | `path` glob, `owner`, `reason`. **Review metadata only** — never an automatic ours/theirs rule.          |
| `coupledChanges[]`                   | `source` glob, `companion` glob, `check` id. Flags dependency bumps that need a vendored subtree review. |
| `requiredPullRequestChecks`          | the existing CI jobs expected on the PR. Branch protection remains the enforcement.                      |

The four destructive policy fields are parsed as literals: flipping one is a configuration error, not
a new behaviour. No token, key, username, email address, or local path belongs in this file.

The workflow repeats a few of these values as literals (`cron`, PR title, labels, reviewers, required
checks) because GitHub Actions cannot read them from YAML at parse time.
`scripts/upstream-sync-workflow.test.ts` fails CI if any of them drifts from the manifest — when you
change the manifest, change the workflow in the same commit.

## Clean-sync pull request review checklist

The PR is a draft on purpose. Before taking it out of draft:

1. Read the upstream commit list in the PR body. Understand what upstream intended.
2. Work through every hotspot match, grouped by owner. Hotspots are _not_ "keep Marcode unchanged" —
   an upstream security or correctness fix must not be discarded because it touched a custom file.
   For each path, produce the combined result: upstream's intent plus Marcode's intent.
3. Check the coupled-change findings. A blocking finding means a dependency moved without its
   vendored subtree.
4. All four required checks green: `Check`, `Test`, `Mobile Native Static Analysis`, `Release Smoke`.
5. Runtime verification when UI hotspots changed (`apps/web/**`, `apps/mobile/**`,
   `apps/desktop/resources/**`, `apps/marketing/**`): drive the real surface, including 390px and
   820px viewports.
6. Provider-focused tests when `apps/server/src/provider/**` changed.
7. Branding asset generation/check when `assets/**` or `apps/desktop/resources/**` changed
   (`vp run icons:check`).

Evidence required before removing draft status: the required checks green on the merge commit, the
per-hotspot decision recorded in a PR comment, and the runtime/provider/asset verification named
above actually run — not assumed.

## Combining upstream and Marcode intent, path by path

For each conflicting or hotspot path, decide explicitly:

- **upstream-only change** (bugfix, dependency, API rename) → take it, then re-apply the Marcode
  behaviour on top if the rename moved it.
- **Marcode-only surface** (branding, navigation, editor integration) → keep Marcode, but port any
  upstream fix embedded in the same hunk.
- **both changed the same behaviour** → write the merged behaviour by hand and add a focused test
  that pins it, so the next sync conflicts loudly instead of silently reverting you.

Never resolve by taking a whole file from one side because it is faster.

## Blocked sync: reproducing and resolving a conflict

The workflow files one issue titled `upstream sync blocked: pingdotgg/t3code@<short-sha>`, labels it
`upstream-sync-blocked`, uploads the plan JSON as the `upstream-plan` artifact, and fails. It pushes
no branch.

Reproduce read-only:

```sh
vp run upstream:plan
```

Resolve by hand, from a clean checkout, without any destructive command:

```sh
# 1. start a human integration branch from the current target base
git fetch origin main
git switch --create integrate/upstream-<short-sha> origin/main

# 2. bring in the exact upstream commit the plan reported
git fetch https://github.com/pingdotgg/t3code.git main
git merge --no-ff <upstream-sha>

# 3. resolve each conflicted file by hand, combining both intentions
#    (edit the files; then stage exactly those paths)
git add <each resolved path>
git commit

# 4. focused tests for what you touched
vp test run <the tests covering the resolved paths>

# 5. open a normal review pull request into main
```

Do not use `git reset`, `git restore .`, `git checkout --ours/--theirs`, `git stash`, `git clean`,
force push, or branch deletion to get out of a conflict. If you need to abandon an in-progress merge,
`git merge --abort` in that branch only.

Once your resolution is merged into `main`, the next scheduled run sees a new merge base and returns
to `clean-merge` on its own. Close the tracking issue when the resolution lands.

## Coupled vendored subtrees

Whole-repository sync and `.repos/` subtree sync are separate systems, but an upstream merge can move
both. The manifest declares two couplings:

| check                     | source                     | companion                  |
| ------------------------- | -------------------------- | -------------------------- |
| `effect-version-subtree`  | `pnpm-workspace.yaml`      | `.repos/effect-smol/**`    |
| `alchemy-version-subtree` | `infra/relay/package.json` | `.repos/alchemy-effect/**` |

When a finding is blocking (source changed, companion did not):

```sh
vp run sync:repos            # resolves the tag from the installed version
vp run sync:repos --repo effect-smol   # or just the one repo
```

Review the resulting subtree change as part of the sync PR. The sync bot never runs
`sync:repos --latest` and never mutates a subtree on its own.

## Branch collisions and reruns

The integration branch name is deterministic: `chore/upstream-<upstreamShortSha>`. Reruns for the
same upstream SHA are idempotent — the branch is reused when it already points at the expected merge
commit, and the existing draft PR is updated instead of duplicated.

If the remote branch exists at an unexpected SHA the run stops and pushes nothing. Recover without
force:

1. inspect it — `git fetch origin chore/upstream-<short-sha>` then `git log --oneline -5 FETCH_HEAD`;
2. if it is someone's in-progress work, finish or merge that work; the sync will follow;
3. if it is stale and everyone agrees it is disposable, delete it deliberately from the GitHub UI (a
   human decision, recorded), then rerun the workflow;
4. never `git push --force` over it, and never have the bot delete it.

## Permissions and secrets

The workflow needs no new secrets. It uses the default `GITHUB_TOKEN` with:

```yaml
permissions:
  contents: write # push the integration branch (never main)
  pull-requests: write # open/update the draft PR
  issues: write # file the blocked-sync tracking issue
```

Repository settings must allow GitHub Actions to create pull requests. If label creation is not
authorized, the run still creates the issue or PR and reports the label failure as a warning.
`main` should stay branch-protected: protection, not the bot, is what enforces the required checks.

## Changing the schedule or the source

Disable the schedule while keeping manual dispatch: set `schedule.enabled: false` in the manifest and
delete the `schedule:` block from `.github/workflows/upstream-sync.yml`. Leave `workflow_dispatch:`
in place. The parity test accepts a missing schedule only when `schedule.enabled` is `false`.

Change the upstream branch or repository: edit `source.url` / `source.branch` in the manifest, run
`vp run upstream:status` locally to prove the new remote resolves, and run
`vp run upstream:plan` to see the delta before the first scheduled run. A different source means a
different merge base — expect the first plan after the change to be large or `unrelated-history`.

## Related

- [CI quality gates](./ci.md) — the pull-request checks this automation relies on.
- `docs/specs/upstream-sync-manifest-and-automation.md` — the design this implements.
