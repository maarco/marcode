# Marcode bootstrap and upstream runbook

This reference contains the complete operational model behind `$marcode-fork-maintenance`.

## Mental model

Marcode is not a feature branch for T3 Code. It is a product fork.

The fork has two continuing lines of development:

- Marcode product work, whose canonical destination is `origin/main`;
- official T3 work, observed at `upstream/main` and incorporated through explicit merges.

The standard is not one universal Git command. Teams vary on review requirements, release branches,
and merge style. The durable maintained-fork rules are:

- one canonical default branch for the forked product;
- one separately named upstream remote;
- short-lived branches for local product changes;
- a reviewable integration branch for upstream changes;
- preserved shared ancestry;
- no force rewriting of published fork history;
- automated detection, human conflict decisions;
- tests and runtime proof after combining behavior.

For a one-person team using AI, keep the same topology. Remove the second-human approval requirement,
not the branch, CI, or evidence boundary.

## Remote and branch roles

Configured repositories:

```text
origin    https://github.com/maarco/marcode.git
upstream  https://github.com/pingdotgg/t3code.git
```

Roles:

```text
origin/main
  Canonical Marcode product and release history.

upstream/main
  Official T3 source. Never a Marcode release branch.

feat/*, fix/*, docs/*
  Short-lived Marcode work into origin/main.

bootstrap/marcode-v1
  Temporary first-publication review branch.

chore/upstream-<short-sha>
  Deterministic clean integration branch created by automation.

integrate/upstream-<short-sha>
  Human branch for a conflicted upstream merge.
```

Do not use a permanent `marcode` branch while keeping `main` equal to T3. That makes the default
branch lie about the product, complicates CI and releases, and does not reduce real merge conflicts.

## First-push decision

### Small, already verified fork

Pushing directly to `origin/main` can be reasonable when:

- the delta is small and reviewed;
- CI has already run somewhere equivalent;
- the remote is private or access-controlled;
- the default branch intentionally becomes the fork product immediately.

### Large unpublished fork

Use a bootstrap branch when:

- dozens of commits or hundreds of files are unpublished;
- the current remote default branch is still the vendor base;
- upstream moved during local development;
- CI has not exercised the complete fork delta;
- the fork-boundary map is incomplete;
- a disposable merge probe already reports conflicts.

Sequence:

```sh
# read-only proof
git status --short --branch
git remote -v
git merge-base main upstream/main
git rev-list --left-right --count origin/main...main

# only after explicit push authorization
git push origin main:refs/heads/bootstrap/marcode-v1
```

Open a draft PR from `bootstrap/marcode-v1` to `main`. Do not merge until the bootstrap gate passes.

## Bootstrap gate

Required evidence:

- worktree clean;
- intended local commits inventoried;
- mechanical diff check clean;
- no generated index/database artifacts accidentally tracked;
- compatibility identifiers checked;
- focused fork-policy tests pass;
- broad product areas have focused tests;
- user-visible web/mobile/desktop behavior verified as applicable;
- CI checks green;
- current upstream drift and conflict count recorded;
- known hotspot gaps recorded;
- no secrets, local absolute paths, or private artifacts in the diff.

The first bootstrap PR is allowed to be large because it establishes the product fork. That is not
permission for future PRs to remain large.

## Branch protection for Marco plus AI

Recommended `main` rules:

- require pull requests;
- require `Check`;
- require `Test`;
- require `Mobile Native Static Analysis`;
- require `Release Smoke`;
- require branches to be up to date when practical;
- require conversation resolution;
- do not require a second human approval;
- allow merge commits;
- do not require linear history;
- block force pushes;
- block deletion;
- optionally allow Marco an emergency bypass, used only with recorded evidence.

GitHub Actions must be allowed to create pull requests before the upstream workflow can open its
draft PR.

## Fork CI and relay publication

The first push to Marcode `main` proved that upstream's default CI and relay workflows referenced
Blacksmith-specific runner labels while the fork had no Blacksmith installation or registered
runners. Default fork CI therefore uses GitHub-hosted `ubuntu-24.04` and `macos-26` runners.

Production relay deployment is opt-in. The `Deploy T3 Connect relay` job runs only when the
repository variable `RELAY_DEPLOY_ENABLED` is exactly `true`. Do not enable it until every relay
variable and secret named in `.github/workflows/deploy-relay.yml` is configured and the target
infrastructure has been verified. An unset variable deliberately skips the job before assigning a
runner.

Release, EAS, and mobile-showcase workflows still contain upstream Blacksmith labels. Before using
one, either install and configure Blacksmith for Marcode or audit that workflow's CPU, architecture,
KVM, signing, and timeout requirements before moving it to a standard GitHub-hosted runner. Do not
blindly replace every label: those workflows have different platform requirements.

## Normal Marcode change flow

```text
origin/main
  -> feat/<scope>
  -> focused implementation and tests
  -> live verification when user-visible
  -> draft PR
  -> CI
  -> review fork-boundary paths
  -> merge to origin/main
```

Use separate branches or worktrees for unrelated AI work. Do not let an agent's broad checkpoint
become the unit of review when the actual change has multiple independent owners.

## Normal upstream flow

Read-only:

```sh
npx vp run upstream:status
npx vp run upstream:plan
```

Clean merge, after explicit authorization:

```sh
npx vp run upstream:integrate
```

The integrator:

- refuses a dirty checkout;
- plans in a disposable clone;
- creates a deterministic integration branch;
- produces a two-parent merge;
- verifies the merge tree and parents;
- does not push unless `--push` is explicitly supplied;
- never pushes `main`;
- never auto-resolves conflicts.

Do not pass `--push` unless Marco explicitly authorizes the remote mutation.

## Unpublished-main limitation

The planner resolves the target from the configured target remote. Before the first Marcode push,
that target is the old `origin/main`, not local Marcode `main`.

Consequences:

- `upstream:status` can report local `HEAD`, but its target SHA is still remote `origin/main`;
- `upstream:plan` audits upstream against the remote target and cannot see unpublished Marcode
  commits;
- a clean plan against old `origin/main` says nothing about whether local Marcode merges cleanly;
- the current `integrate --target-sha` precondition override does not publish a local object into the
  temporary remote plan, and the integrator creates its worktree from the planned remote target.

For an unpublished fork, use a disposable local clone and `git merge-tree --write-tree` to audit the
actual local `main` against the verified `upstream/main`. This may write objects only inside the
disposable clone and must not alter the real checkout.

## Disposable local audit

Measure both sides from the real merge base:

```sh
base=$(git merge-base main upstream/main)
git rev-list --count "$base..main"
git rev-list --count "$base..upstream/main"
git diff --name-only "$base..main"
git diff --name-only "$base..upstream/main"
git diff --check "$base..main"
```

In a disposable clone:

```sh
git merge-tree --write-tree main upstream/main
```

Interpretation:

- exit `0`: content merge is currently clean; hotspot review is still required;
- exit `1`: one or more real merge conflicts;
- overlapping paths that auto-merge still require review when they are product or protocol
  boundaries;
- conflict paths outside the hotspot map are policy gaps.

Do not run a speculative merge in the shared checkout merely to count conflicts.

## Manual conflict flow

When the guarded plan reports conflict after Marcode is published:

```sh
git fetch origin main
git switch --create integrate/upstream-<short-sha> origin/main
git fetch https://github.com/pingdotgg/t3code.git main
git merge --no-ff <exact-upstream-sha>
```

For the unpublished bootstrap exception, create the integration branch from the committed local
Marcode `main`, not stale remote `origin/main`.

Once the merge stops:

1. Inventory every conflict.
2. Group conflicts by owner: branding, shell, workspace, editor, protocol, persistence, provider,
   mobile, marketing, assets, docs.
3. For each path, inspect base, Marcode, and upstream.
4. Write upstream intent.
5. Write Marcode intent.
6. Implement the combined rule manually.
7. Stage only that resolved path.
8. Run its focused tests.
9. Repeat until no unmerged entries remain.
10. Run cross-owner regression tests.
11. Drive affected user surfaces.
12. Commit the merge.

Allowed:

- reading stage `1`, `2`, and `3` blobs;
- editing conflicted files manually;
- staging exact resolved paths;
- adding focused tests;
- `git merge --abort` only when deliberately abandoning the integration branch.

Blocked:

- force push;
- reset;
- restore of broad paths;
- stash;
- clean;
- wholesale `ours` or `theirs`;
- copying an entire file from one side without proving the other side has no required behavior;
- merging the upstream conflict directly in `main`;
- deleting the integration branch as an automatic recovery action.

## Intent-combination worksheet

For every conflict:

```text
path:
owner:
upstream commits:
upstream intent:
Marcode commits:
Marcode intent:
combined invariant:
sibling paths:
focused tests:
live surface:
compatibility identifiers:
decision:
remaining uncertainty:
```

Record the result in the integration PR or a checked-in artifact when the conflict is
architecturally important.

## Hotspot maintenance

The manifest is an early-warning map. It must cover deliberate fork ownership, not merely paths that
conflicted last time.

Candidate families when current evidence supports them:

- shared web UI primitives used by fork-specific portal/layer behavior;
- shell and chat entry points;
- project script controls;
- workspace command hooks;
- orchestration and persistence registries;
- project settings contracts and tests;
- root brand assets such as `favicon.svg`;
- server CLI/cloud copy if product branding remains literal there;
- architecture documents that describe fork-owned subsystems.

Prefer reducing avoidable fork edits over endlessly widening hotspots:

- centralize user-visible branding behind a source owner;
- keep fork-specific layering in a shared adapter instead of arbitrary per-component values;
- keep compatibility identifiers upstream-shaped;
- isolate new Marcode subsystems in new files where the integration boundary permits it;
- add focused tests at shared owners.

Some shared primitives legitimately need modification. Marking them as hotspots is not an admission
of bad design; leaving them undocumented is.

## Compatibility audit

Verify the live source for:

- root package name remains `@t3tools/monorepo`;
- internal packages remain `@t3tools/*`;
- mobile dev app name/scheme/bundle identifiers remain compatible;
- storage and protocol identifiers are unchanged unless migrated;
- public branding says `Marcode`;
- internal or compatibility `"T3 Code"` strings are not mass-replaced.

Branding conflicts in user-facing CLI or service copy may be intentional. Repeated direct literal
changes should still be evaluated for centralization.

## Current baseline audit

Snapshot verified on 2026-07-26 before first publication:

```text
local Marcode HEAD: cc9a79e568e4347d4bd7f38e542c7f6ad90df4f0
remote Marcode main: 6f34ad3e87eba2ffba66cac5593dae8b680e5b84
upstream main: 23b55022175e69938514934f65c5a607d38f1e47
merge base: 6f34ad3e87eba2ffba66cac5593dae8b680e5b84
local Marcode commits: 103
upstream commits: 78
Marcode changed paths: 354
upstream changed paths: 328
overlapping paths: 87
merge conflicts: 25
conflicts covered by the existing hotspot map: 3
conflicts outside the existing hotspot map: 22
focused upstream-policy tests: 62 passed
worktree: clean
push state: unpublished
```

Observed conflict families:

- server CLI and boot-service branding;
- persistence migration registration;
- web shell/sidebar/chat entry points;
- project scripts and thread creation;
- shared alert/dialog/command/menu/popover primitives;
- desktop update branding;
- root favicon handling;
- architecture documentation;
- client project-operation tests;
- settings contract tests.

Exact disposable-probe conflict inventory at that baseline:

```text
apps/server/src/cli/connect.ts
apps/server/src/cloud/bootService.test.ts
apps/server/src/cloud/bootService.ts
apps/server/src/persistence/Migrations.ts
apps/web/src/components/AppSidebarLayout.tsx
apps/web/src/components/ChatView.tsx
apps/web/src/components/CommandPalette.tsx
apps/web/src/components/ProjectScriptsControl.tsx
apps/web/src/components/Sidebar.logic.test.ts
apps/web/src/components/Sidebar.tsx
apps/web/src/components/chat/ChatComposer.tsx
apps/web/src/components/chat/ChatHeader.tsx
apps/web/src/components/clerk/T3ConnectSidebarSignIn.tsx
apps/web/src/components/desktopUpdate.logic.ts
apps/web/src/components/ui/alert-dialog.tsx
apps/web/src/components/ui/command.tsx
apps/web/src/components/ui/dialog.tsx
apps/web/src/components/ui/menu.tsx
apps/web/src/components/ui/popover.tsx
apps/web/src/hooks/useHandleNewThread.ts
apps/web/src/index.css
docs/architecture/overview.md
favicon.svg
packages/client-runtime/src/operations/projects.test.ts
packages/contracts/src/settings.test.ts
```

Only these three were covered by the manifest's then-current hotspots:

```text
apps/web/src/components/ChatView.tsx
apps/web/src/components/Sidebar.tsx
apps/web/src/index.css
```

The other 22 paths were policy gaps at that baseline. That does not mean every path requires a
permanent exact-file hotspot. Group related ownership with a narrow glob when it reflects a stable
fork boundary; otherwise reduce or remove the fork edit.

Observed debt:

- `43d5d9fe5` added the floating shell/editor across 65 files with 13,958 insertions and directly
  modified several shared upstream UI primitives;
- `e28d082de` rebranded 104 files, including direct upstream-owned server and CLI literals;
- the hotspot map does not cover most current conflict paths;
- `git diff --check` reported six trailing-whitespace warnings in the headers of
  `docs/specs/unified-workspace-tree-sidebar.md` and
  `docs/specs/upstream-sync-manifest-and-automation.md`;
- the remote planner cannot audit the unpublished 103-commit local fork.

Observed strengths:

- remote roles and merge base are correct;
- the worktree is clean;
- the guarded integration policy is merge-based and non-destructive;
- all 62 focused policy tests passed;
- `@t3tools/*`, mobile schemes, and bundle identifiers remained upstream-compatible;
- Marcode has explicit customization maps, decision specs, and focused subsystem tests.

This snapshot is evidence, not permanent truth. Re-run every count after a commit, upstream update,
bootstrap merge, or conflict resolution.

## First local upstream integration

Resolution snapshot on 2026-07-26:

```text
integration branch: integrate/upstream-89c5a192
target Marcode commit: bf1d30c11c548768f2c968c34ee37e13a064322e
source T3 commit: 89c5a192f4d36bcf4201e8b490ab5ad37a4adac7
initial conflict paths: 25
remaining conflict paths: 0
push state: local only
```

The combined decisions were:

- server service and boot code keeps upstream's new `t3 service` lifecycle, pinned runtime, and
  self-update behavior while visible service/server copy says Marcode; compatibility command names
  remain upstream-shaped;
- Marcode's `033_ProjectWorkspaceLayout` remains migration 033, while upstream settled and snoozed
  projection migrations move to 034 and 035; a registry test pins unique ordered ids and names;
- Sidebar V2 remains available behind upstream's opt-in setting, but the floating pill remains the
  only primary navigation/toggle/settings shell and the unified workspace tree remains the default
  project navigation model;
- upstream's extracted `SidebarChrome` is retained as the shared owner, with Marcode's bare Electron
  drag strip and update-only footer behavior instead of restoring a T3 wordmark or duplicate
  Settings control;
- command-palette bus intents and the existing floating-pill toggle entry both open the same palette;
- checked-in `t3.json` actions can be imported while Marcode's imperative project-action editor,
  unified-tree placement callback, and placement-failure fallback remain intact;
- the chat header keeps actions portaled into the floating pill and now projects upstream
  `t3.json` actions; the glass composer remains Marcode-owned while upstream drag-over behavior is
  preserved;
- new-thread creation performs both Marcode pending workspace placement and upstream carried model
  selection;
- shared alert, command, dialog, menu, and popover primitives retain upstream backdrop/transition
  changes plus Marcode's shared portal overlay and floating-layer behavior;
- the desktop update warning and Connect sign-in retain upstream behavior with Marcode-visible copy;
- Marcode's compact Inter/blue-250 visual tokens remain authoritative; upstream's new semantic
  surface and sidebar variables are mapped into that palette rather than replacing it;
- architecture, client-operation, settings, and sidebar tests retain assertions from both sides;
- the obsolete root `favicon.svg` deletion is accepted because `t3.json` now declares the project
  icon and `apps/web/public/favicon.svg` remains the live Marcode browser asset.

Focused proof recorded before the merge commit:

- server service, boot, migration, and prior Marcode migration: 22 tests passed;
- desktop-update behavior: 26 tests passed;
- client project operations and settings contracts: 32 tests passed;
- affected web/sidebar/chat/unified-workspace/right-panel suites: 332 tests passed;
- unified-workspace contracts, rank, operations, orchestration, projection, and persistence:
  115 tests passed;
- upstream policy, `t3.json`, settled, and snoozed behavior: 296 tests passed;
- mobile archive, filtering, list-v2, repository grouping, and activity behavior: 52 tests passed;
- Marcode branding assertions: 20 tests passed;
- web, contracts, shared, client-runtime, and server targeted typechecks passed after installing the
  lockfile state; mobile typechecking also passed; server emitted only existing Effect style
  suggestions;
- an isolated authenticated web runtime verified the Marcode title and floating-pill shell, unified
  workspace tree counts, explicit-file de-duplication and floating editor routing, `t3.json` action
  import and execution, command-palette routing, persisted project resources, dark and light theme
  tokens, and responsive desktop and mobile-sheet layouts without horizontal overflow;
- the mobile-sheet terminal occupied `calc(100% - 3rem)` by design at the mobile breakpoint; the
  remaining 3rem backdrop and zero measured overflow confirmed sheet behavior rather than an inline
  panel regression.

Unverified before the local merge commit:

- no installed iOS Simulator runtime was available, so the mobile app could not receive the required
  integrated runtime pass; the focused mobile tests and typecheck are static evidence only;
- `icons:check` could not run because the required compatible Icon Composer 2.x exporter/design
  generation 26 is not installed; focused branding tests passed;
- CI has not run because the branch remains local;
- nothing is published until Marco explicitly authorizes a push.

## Pre-push defects versus integration debt

Fix before bootstrap PR when cheap and deterministic:

- whitespace and formatting defects;
- accidental generated artifacts;
- missing skill or policy references;
- incorrect hotspot coverage;
- secrets or local paths;
- broken focused tests.

Do not silently redesign the entire fork before publishing merely to reduce a conflict count.
Architectural reductions such as centralized branding or isolated overlay adapters should be scoped,
tested changes with their own rationale.

## Publication and integration states

Keep these terms exact:

```text
local
  Committed only in Marco's checkout.

pushed
  Available on a remote branch, not necessarily reviewed.

draft PR
  Review and CI surface exists; not approved for canonical main.

merged
  Part of origin/main.

integrated upstream
  A two-parent merge contains the selected T3 SHA.

verified
  Focused tests, required CI, and affected live surfaces passed.

released
  Tagged or deployed through the release process.
```

Never use one state as shorthand for another.

## Final evidence packet

For bootstrap:

- branch and commit SHA;
- remote push state;
- PR URL;
- complete changed-path summary;
- CI checks;
- compatibility audit;
- upstream drift snapshot;
- known integration conflicts;
- live verification.

For upstream integration:

- target Marcode SHA;
- source T3 SHA;
- merge base;
- integration branch;
- merge commit parents;
- conflict inventory;
- per-conflict decisions;
- hotspot matches and policy updates;
- focused tests;
- responsive/live proof;
- CI;
- unverified items.
