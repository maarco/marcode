---
name: marcode-upstream-integration
description: Safely plan, resolve, verify, and hand off upstream T3 Code integrations into Marcode while preserving Marcode customizations, merge metadata, and recoverable work. Use for upstream plans, conflict resolution, merge audits, integration branches, or future fork-sync automation.
---

# Marcode Upstream Integration

Use this skill with `$marcode-fork-maintenance` and `$marcode-customizations`. Add
`$marcode-skill-upkeep`, `$unified-workspace-sidebar`, `$test-t3-app`, or `$test-t3-mobile`
when the touched paths require them.

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

1. Read `AGENTS.md`, `.github/upstream-sync.yml`, and the upstream-sync runbook.
2. Run the read-only upstream status/plan command and record source SHA, target SHA, merge base,
   changed paths, hotspots, and conflicts.
3. Create or use `integrate/upstream-<short-sha>` from the intended Marcode target. Confirm the
   target branch and worktree before merging.
4. Merge the exact upstream SHA with the repository's guarded workflow. Record `MERGE_HEAD`.
5. Resolve conflicts path by path. For each path, write down upstream intent, Marcode intent, the
   smallest combined rule, and the focused verification.
6. Stage only reviewed resolutions. Do not stage unrelated dirty work or generated backups.
7. Run focused tests and typechecks. Preserve the merge sentinel before and after each check.
8. Audit conflict markers, unmerged paths, staged diffs, `.bak` artifacts, compatibility names,
   hotspot coverage, and the sibling surfaces named by the customization map.
9. Keep the integration branch uncommitted or unpushed until Marco explicitly authorizes the
   final commit/push. Do not push on behalf of Marco.

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

- exact source, target, merge-base, branch, and `MERGE_HEAD` SHAs;
- every conflict path and the combined upstream/Marcode decision;
- zero unmerged paths and zero conflict markers;
- expected staged diff, no unexpected deletions, no `.bak` files, and `git diff --cached --check`;
- focused tests, typechecks, and relevant live client verification;
- compatibility identifiers and sibling customizations checked;
- no force push, reset, restore, stash, clean, wholesale ours/theirs choice, or direct merge into
  `main` occurred;
- anything still unverified or blocked.

If the merge sentinel changed unexpectedly, the completion gate fails even if the files look
resolved.
