---
name: marcode-fork-maintenance
description: Publish, protect, audit, and update Marcode as a maintained fork of pingdotgg/t3code. Use when deciding what belongs on main, preparing the first push, configuring a solo-AI Git workflow, checking fork drift, planning or resolving an upstream merge, or deciding whether a customization creates avoidable long-term conflict.
---

# Marcode Fork Maintenance

Marcode is a maintained product fork of `pingdotgg/t3code`. Marcode's `main` is the canonical
product branch. Official T3 Code is an upstream input, not the branch Marcode eventually merges
back into.

Use this skill for repository topology and integration operations. Use `$marcode-customizations`
alongside it whenever a merge or feature touches Marcode product behavior. Use
`$marcode-skill-upkeep` after upstream changes a path or behavior documented by a repository skill.

Read [`references/bootstrap-and-upstream-runbook.md`](references/bootstrap-and-upstream-runbook.md)
before the first publication, any upstream integration, or any attempt to repair fork history.

## Invariant

Maintain both truths:

- Marcode `main` must remain a coherent, releasable product with intentional fork behavior.
- Upstream correctness, security, protocol, dependency, and operational changes must continue to
  enter through reviewable merges.

Do not optimize for a conflict-free merge by silently discarding either side.

## Canonical topology

- `origin/main`: canonical Marcode product and default branch.
- `upstream/main`: official `pingdotgg/t3code` source.
- `feat/*`, `fix/*`, `docs/*`: short-lived Marcode work.
- `bootstrap/*`: temporary first-publication branch only.
- `chore/upstream-<short-sha>`: clean automated upstream integration.
- `integrate/upstream-<short-sha>`: human conflict-resolution branch.

Do not keep all Marcode work permanently on a long-lived customization branch. That turns `main`
into a stale vendor mirror and makes releases, CI, and upstream ancestry ambiguous.

Do not rebase Marcode's published history onto upstream. Preserve the shared ancestor and use
two-parent merge commits for upstream integration.

## First publication

If local Marcode contains a large unpublished delta:

1. Verify `origin`, `upstream`, the merge base, local divergence, and a clean worktree.
2. Audit the complete local delta and current upstream overlap.
3. Fix mechanical defects and document known integration debt.
4. Push the local product state to `bootstrap/marcode-v1`, not directly to remote `main`.
5. Open a draft PR from the bootstrap branch into `origin/main`.
6. Run CI and review the complete product delta.
7. Merge the bootstrap PR so `origin/main` becomes canonical Marcode.
8. Enable GitHub Actions PR creation, protect `main`, and run the upstream workflow.

The bootstrap branch is a temporary safety and review boundary. The final destination is still
Marcode `main`.

Never push as an implicit consequence of "prepare," "audit," "merge locally," or "get started."
Push only when Marco explicitly authorizes it.

## Solo developer plus AI rules

AI does not remove the need for branches and PRs. It increases the need for an inspectable boundary.

- Require the repository's CI checks on `main`.
- Do not require another human approval when there is no second human reviewer.
- Allow merge commits because upstream integration depends on them.
- Do not require linear history.
- Disallow force pushes and branch deletion on `main`.
- Use one focused branch or worktree per change stream.
- Keep commits scoped, but do not rewrite a large unpublished history merely for cosmetic purity
  when doing so creates more loss risk than review value.
- Treat a draft PR as the review packet: exact diff, CI, hotspots, runtime proof, and unresolved
  decisions.

## Upstream integration

The checked-in policy is authoritative:

- `.github/upstream-sync.yml`
- `docs/operations/upstream-sync.md`
- `scripts/upstream-sync.ts`
- `scripts/lib/upstream-sync-git.ts`
- `.github/workflows/upstream-sync.yml`

Use:

```sh
npx vp run upstream:status
npx vp run upstream:plan
```

These are read-only. Use `npx vp run upstream:integrate` only when the configured target base is
already published and the plan is a clean merge.

Important unpublished-bootstrap limitation: the current planner reads the configured remote target.
If local `main` is ahead of `origin/main`, the plan cannot audit those unpublished commits.
`--target-sha` does not make an unpublished local commit available to the temporary remote plan, and
the current integrator still creates its worktree from the planned remote target. Do not pretend it
integrates an unpublished local fork.

When the real local fork conflicts before first publication:

1. Commit the intended local product state.
2. Create `integrate/upstream-<short-sha>` from local Marcode `main`.
3. Merge the exact verified `upstream/main` SHA with `--no-ff`.
4. Resolve every conflict manually, path by path.
5. Preserve upstream intent and Marcode intent.
6. Add or update focused tests for each merged behavior.
7. Run the applicable client runtime and responsive verification.
8. Keep the integration branch local until Marco explicitly authorizes a push.

Never resolve with a whole-file `ours` or `theirs` choice.

## Fork-boundary audit

Before publishing or syncing, measure:

- shared merge base;
- local Marcode commit count;
- upstream commit count;
- Marcode changed paths;
- upstream changed paths;
- overlapping paths;
- actual merge-conflict paths from a disposable merge-tree probe;
- conflict paths covered and not covered by `.github/upstream-sync.yml`;
- broad commits that mixed multiple subsystem owners;
- upstream-owned compatibility identifiers changed by the fork;
- generated artifacts or large binaries accidentally tracked;
- `git diff --check`;
- focused upstream-policy tests;
- live user surfaces not yet verified.

Conflict is not automatically a defect. An undocumented or avoidable conflict boundary is.

## Hotspot rule

Hotspots are mandatory-review metadata, not automatic keep-Marcode rules.

Add or widen a hotspot when:

- Marcode intentionally changes an upstream-owned file repeatedly;
- a disposable merge probe conflicts outside the current map;
- a shared primitive imports fork-specific behavior;
- a migration registry, protocol owner, shell entry point, compatibility boundary, or root asset
  requires intentional combination on every upstream sync.

Remove or narrow a hotspot only after the fork-specific ownership moved elsewhere and the old path
was verified clean.

## Compatibility boundary

Keep these upstream-shaped unless a deliberate migration says otherwise:

- `@t3tools/*` package names;
- root package identity;
- internal storage keys;
- mobile schemes and bundle identifiers;
- compatibility CLI and protocol identifiers;
- internal `"T3 Code"` labels that are not user-facing Marcode product copy.

Use `Marcode` for visible product identity. Do not mass-replace `T3`.

## Conflict-resolution theorem

For every conflict:

1. State upstream's intended behavior.
2. State Marcode's intended behavior.
3. Identify the smallest combined rule.
4. Implement that rule at the shared owner.
5. Attack sibling and boundary cases.
6. Add a focused regression test that would fail if either side were lost.
7. Verify the real surface when user-visible behavior changed.

If the combined rule is unclear, leave the conflict unresolved and document the competing
hypotheses. Do not guess through a merge.

## Verification

Focused upstream-policy tests:

```sh
npx vp test run \
  scripts/upstream-sync.test.ts \
  scripts/upstream-sync-workflow.test.ts \
  scripts/lib/upstream-sync-config.test.ts \
  scripts/lib/upstream-sync-git.test.ts
```

Then route verification by touched ownership:

- web UI: `$test-t3-app`, including 390px and 820px;
- mobile: `$test-t3-mobile`;
- unified workspace: `$unified-workspace-sidebar`;
- product behavior: `$marcode-customizations`;
- skill claims changed by upstream: `$marcode-skill-upkeep`;
- branding/assets: branding tests plus asset-generation checks;
- provider/runtime: focused provider tests;
- contracts/server persistence: focused schema, migration, decider, projector, and RPC tests.

Do not use a repo-wide local suite as the routine completion gate. CI owns the full suite.

## Completion gate

Before calling a publication or integration ready, report:

- exact source and target SHAs;
- branch topology and push state;
- changed, overlapping, and conflicting path counts;
- every conflict path and its upstream/Marcode decision;
- hotspot coverage and updates;
- compatibility identifiers deliberately preserved;
- focused test results;
- live surfaces verified;
- CI state;
- remaining conflicts or unverified behavior;
- confirmation that no force push, reset, stash, clean, wholesale ours/theirs, or direct upstream
  merge into `main` occurred.

Built is not published. Pushed is not merged. Merged is not verified. Keep those states separate.
