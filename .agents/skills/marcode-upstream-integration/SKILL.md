---
name: marcode-upstream-integration
description: Safely plan, resolve, verify, and hand off upstream T3 Code integrations into Marcode while preserving Marcode customizations, merge metadata, and recoverable work. Use for upstream plans, conflict resolution, merge audits, integration branches, or future fork-sync automation.
---

# Marcode Upstream Integration

Use this skill with `$marcode-fork-maintenance` and `$marcode-customizations`. Add
`$marcode-skill-upkeep`, `$unified-workspace-sidebar`, `$test-t3-app`, or `$test-t3-mobile`
when the touched paths require them.

This skill owns the full upstream-sync lifecycle. When Marco explicitly authorizes publication
and merge, continue through commit, push, CI, PR review, merge, and local `main` verification in
the same run. Do not hand back an "in progress" CI state as if the task were complete.

## Lifecycle and terminal states

Track the work through this state machine:

```text
orient -> status/plan -> integrate or recover -> resolve -> focused verify
       -> commit/push (only when authorized) -> CI terminal result
       -> PR review -> ready -> merge -> local main verification
```

Valid terminal states are:

- `merged`: PR is merged, `origin/main` is at the merge commit, and the local checkout is on a
  clean, matching `main`.
- `blocked`: a specific external or user-owned condition prevents the next state. Name the exact
  condition, preserve the checkout, and state the one action that would unblock it.
- `not authorized`: local planning/resolution/verification may continue, but commit, push, ready,
  or merge must wait for explicit authorization.

"Paused", "staged", "CI running", or "PR open" are intermediate observations, not completion.
If publication is authorized and CI is running, monitor it to a terminal result. If CI fails,
repair the narrow cause, push the fix, and monitor the new run.

## Execution discipline

Keep this sync as one primary workstream until it reaches a terminal state. Do not let unrelated
Mentiko, Kollab, release, or UI work silently replace the active integration. If the user changes
tasks, preserve the exact sync checkpoint and return to it; if the session is ending, leave the
branch, commit, PR, CI run, blocker, and next command explicit. A long-running check is a reason to
monitor, not a reason to stop. A context/token boundary is a reason to create a concise handoff,
not to abandon the merge state.

## Non-negotiable invariant

An upstream integration must preserve both:

- upstream correctness, security, protocol, dependency, and operational behavior;
- Marcode's intentional product behavior, branding, compatibility identifiers, and source-of-truth
  architecture.

Never solve a conflict with a whole-file ours/theirs choice, a mass replacement, or an assumption
that every Marcode change should win.

## Protected merge state

Treat the integration checkout as a protected state machine. During an active merge:

- Never run `git stash`, `git reset`, `git restore`, `git clean`, force push, or broad checkout.
- Never use stash as a temporary baseline comparison or as a way to test whether an error is
  pre-existing. Use `git show <sha>:<path>`, `git diff <sha>...HEAD`, or a separate detached
  worktree created from the baseline.
- Never run a command that can implicitly clean up the checkout without checking its effect on
  `MERGE_HEAD` first.
- Do not let an agent or wrapper “normalize” the tree after an audit. A clean audit means the
  merge state and staged resolution remain intact.

Manual stash is never an acceptable recovery step. If a commit hook creates a temporary stash,
verify that it is hook-owned, that the hook restored the worktree, and that no user-owned stash was
modified or dropped.

Before and after every stateful edit, test, install, formatter, or audit command, verify:

```sh
git rev-parse --abbrev-ref HEAD
git rev-parse --verify MERGE_HEAD
git diff --name-only --diff-filter=U
git status --short
```

The `MERGE_HEAD` SHA must remain unchanged until the merge is intentionally concluded. If it
disappears, stop immediately, report the command that preceded it, and do not continue editing or
declare success. Do not apply a recovery stash without Marco's explicit approval.

## Workflow

### End-to-end control loop

Do not restart an interrupted sync from memory. Resume the existing branch, recovery ref, staged
resolution set, or PR when one exists. Treat these as intermediate states, not handoff points:
`MERGE_HEAD` active, merge commit recovered, staged, PR open, draft, or CI running. Once Marco
authorizes publication and merge, continue until the PR is merged and local `main` matches
`origin/main`, or until a precise external/user-owned blocker is reached.

1. Read `AGENTS.md`, `.github/upstream-sync.yml`, and the upstream-sync runbook. If the task is a
   continuation, use Chronicle to recover the recent repo, branch, visible merge state, files under
   review, commands already run, and last blocker. Chronicle is a compass; verify its claims in
   Git/GitHub before acting.
2. Inspect `git status --short --branch`, the current branch, remotes, `HEAD`, `origin/main`,
   `MERGE_HEAD`, unresolved paths, existing integration branches, recovery refs, and the existing
   PR. Record source SHA, target SHA, merge base, changed paths, hotspots, conflicts, and PR head.
   Distinguish an active merge (`MERGE_HEAD` exists) from a recovered merge commit (`MERGE_HEAD` is
   gone but the intended merge/staged recovery remains). Do not create a duplicate branch or
   restart a recovered merge.
3. Create or use `integrate/upstream-<short-sha>` from the intended Marcode target. Confirm the
   target branch and worktree before merging.
4. Merge the exact upstream SHA with the repository's guarded workflow. Record `MERGE_HEAD`.
5. Resolve conflicts path by path. For each path, write down upstream intent, Marcode intent, the
   smallest combined rule, and the focused verification.
6. Stage only reviewed resolutions. Do not stage unrelated dirty work or generated backups.
7. Run focused tests and typechecks. Preserve the merge sentinel before and after each check. Use
   `npx vp fmt --check <changed-paths>` for formatting; there is no `prettier` task. If stale local
   dependencies cause a missing-package failure, use the repository package manager (for example,
   `pnpm install --frozen-lockfile`) and rerun the same focused check.
8. Audit conflict markers, unmerged paths, staged diffs, `.bak` artifacts, compatibility names,
   hotspot coverage, and the sibling surfaces named by the customization map.
9. Keep the integration branch uncommitted or unpushed until Marco explicitly authorizes
   publication. After authorization, stage only approved files, commit without attribution, push
   without force, verify the remote head, and continue through CI, PR review, merge, and local-main
   verification in this same workflow.

### CI failure and recovery loop

After pushing, locate the PR and Actions run for the exact head SHA. Record the run ID and poll while
it is queued or in progress. Use job details as the authority when a combined-status endpoint is
empty or delayed. Required Marcode jobs are `Check`, `Test`, `Mobile Native Static Analysis`, and
`Release Smoke`.

When a job fails, identify the exact test or command, reproduce it locally when possible, and
classify the cause before editing: renamed workspace/plugin reference, stale artifact import,
fork-specific auth or contract boundary, fixture identity, timeout budget, merge logic, or
environment/tooling. Fix the narrow producer, run the focused check, commit and push the fix, then
monitor the replacement run to a terminal result. Do not hand back "CI is running" after publication
has been authorized.

Recent concrete examples from this integration were stale oxlint plugin references, renamed relay
keys, an obsolete desktop artifact import, missing legacy RPC scopes, fork-specific test fixtures,
an oversized compression fixture, and a URL-derived fork fixture whose key had to remain
`binbandit/t3code` because the PR URL was `github.com/pingdotgg/t3code`. Preserve upstream-shaped
compatibility identifiers while fixing these locally.

### PR review, merge, and post-merge proof

Before changing PR state, verify the base is `main`, the head is the exact green commit, the PR is
mergeable, required jobs are terminal and green, and no unresolved review threads or requested
changes remain. Record hotspot and coupled-change decisions in the PR description or a review
comment. Remove stale wording such as "intentionally draft", "CI pending", or a resolved blocked
test before marking the PR ready.

When merge is authorized, mark the draft ready, then merge with the expected head SHA and the
repository's `merge` strategy. Verify `merged=true` and capture the merge commit SHA. Do not delete
the integration branch unless separately requested.

Then finish the local checkout:

```sh
git fetch origin main
git switch main
git pull --ff-only origin main
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

The terminal proof is `HEAD == origin/main == <merge-commit>` plus a clean worktree. A merged PR
with a stale local integration branch is not the final state.

## Safe baseline verification

To prove a failure is pre-existing, do not touch the active integration state. Prefer:

```sh
git show <target-sha>:<path>
git diff <target-sha>...HEAD -- <path>
```

If a command must execute against the baseline checkout, use a disposable detached worktree
outside the integration worktree, run the focused check there, then remove only that exact
temporary worktree after recording its result. Never stash the integration worktree to make room.

## Conflict rules

- Preserve upstream security and correctness changes even in hotspot files.
- Preserve Marcode's floating editor, unified workspace tree, branding, and other documented
  product contracts when upstream assumes a different surface.
- Keep upstream-shaped compatibility identifiers such as `@t3tools/*`, storage keys, schemes,
  bundle identifiers, protocol names, and internal labels unless a deliberate migration says
  otherwise.
- Add comments only where ownership or an intentional divergence is non-obvious; explain the
  invariant, not the merge history.
- Remove temporary `.bak` artifacts before the audit. `*.bak` is already ignored, but ignored does
  not mean acceptable residue.
- Regenerate lockfiles with the repository's package manager; do not hand-edit them.

## Completion gate

Before reporting the integration ready, provide evidence for:

- exact source, target, merge-base, integration-branch, merge-commit-parent, and PR head SHAs;
- `MERGE_HEAD` was unchanged during active resolution, and is absent only when the merge was
  intentionally concluded;
- every conflict path and the combined upstream/Marcode decision;
- zero unmerged paths and zero conflict markers;
- expected staged diff, no unexpected deletions, no `.bak` files, and `git diff --cached --check`;
- focused tests, typechecks, and relevant live client verification;
- compatibility identifiers and sibling customizations checked;
- CI run ID and terminal result for every required job;
- PR base/head, mergeability, review-thread state, stale-description cleanup, ready transition,
  and merge commit SHA when publication was authorized;
- after merge, local `HEAD == origin/main` and a clean worktree;
- no force push, reset, restore, manual stash, clean, wholesale ours/theirs choice, or direct local
  merge into `main` occurred;
- anything still unverified or blocked.

If the merge sentinel changed unexpectedly, the completion gate fails even if the files look
resolved. If publication was authorized, an open PR, draft PR, in-progress CI run, or stale local
integration branch also fails the completion gate.
