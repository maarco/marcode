---
name: marcode-customizations
description: Preserve and extend Marcode's intentional differences from upstream T3 Code. Use whenever changing Marcode product behavior, reviewing an upstream sync, deciding whether a T3 pattern still applies, tracing a Marcode-only subsystem, or handing work to an agent that needs the fork boundary before editing.
---

# Marcode Customizations

Marcode is a maintained fork of `pingdotgg/t3code`, not a renamed checkout. Treat upstream as an
input and Marcode's current behavior as a product contract.

This skill was audited against local `main` at `54a1cba9` on 2026-07-26. That commit is a checkpoint,
not permanent truth. Re-verify claims touched by later commits before changing them.

## Start here

Before editing:

1. Read the repository `AGENTS.md`.
2. Read `.github/upstream-sync.yml`. Its hotspots are the current fork-boundary review map.
3. Read [`references/customization-map.md`](references/customization-map.md) for the affected
   subsystem and inspect the named live source files.
4. Run `git log --oneline 54a1cba9..HEAD -- <affected paths>`. If the baseline is no longer an
   ancestor, compare from the latest shared merge base instead of pretending the checkpoint applies.
5. If the work touches the project tree, also use `$unified-workspace-sidebar`.
6. If the work changes user-visible web behavior, finish with `$test-t3-app`.
7. If this skill or another repository skill has drifted, use `$marcode-skill-upkeep`.
8. If the work concerns first publication, branch topology, fork drift, or an upstream merge, use
   `$marcode-fork-maintenance`.

Do not infer current behavior from a spec alone. Specs preserve intent and decision history; running
code, schemas, tests, and the live UI are the oracle.

## The fork invariant

Preserve both sides of the fork:

- Incorporate upstream correctness, security, protocol, and dependency changes.
- Preserve Marcode's intentional product behavior at every touched fork boundary.
- Never resolve an upstream conflict by taking an entire file from one side. Combine the two
  intentions by hand and add a focused test for the merged rule.
- Keep upstream-owned compatibility identifiers unless a migration explicitly requires changing
  them. `@t3tools/*`, root package names, storage keys, mobile bundle identifiers, schemes, and some
  internal "T3 Code" names remain intentionally upstream-shaped.
- Use **Marcode** for user-visible product identity. Do not mass-replace every occurrence of `T3`,
  because compatibility and upstream-owned names are not branding defects.

## Non-negotiable Marcode behavior

### Product identity and shell

- User-visible web and desktop identity comes from `apps/web/src/branding.ts` and
  `apps/desktop/src/app/DesktopEnvironment.ts`, with stage-aware display names.
- The web and mobile marks plus every dev, nightly, production, desktop, marketing, favicon, and
  packaged asset sibling use the approved black mark on a white rounded-square background. Keep the
  artwork aligned across channels; channel identity comes from naming and build metadata.
- `apps/web/src/components/FloatingPillNav.tsx` is the primary floating navigation shell.
- Floating application layers use `apps/web/src/editor/floating-surface-z.ts`; do not introduce
  arbitrary z-index islands.
- Layered dropdown/modal clicks must respect `apps/web/src/lib/modalLayer.ts` so closing a child
  overlay does not incorrectly dismiss its host surface.

### One canonical project workspace tree

- The unified sidebar is a projection over one persisted project workspace layout plus live
  authoritative resources. Do not add a second sidebar state model.
- Persistence owns placement and shortcuts, never copies of filesystem contents, terminal sessions,
  browser tabs, or script runtime state.
- Ambient disk files and folders come from the existing project index and remain client-projected.
  Attached paths win over ambient projections so each path renders once.
- Live terminals and browser tabs remain synthetic. Moving them must not write fake persistent
  layout entries.
- Layout mutations are versioned project-aggregate commands with server-side cycle, parent,
  ownership, path, and stale-version checks.
- The `unifiedWorkspaceSidebar` client setting defaults to `true`; an explicit `false` remains the
  legacy-list escape hatch.

Use `$unified-workspace-sidebar` for the full tree model, activation behavior, drag-and-drop rules,
runtime fixtures, and visual verification.

### One file-editing surface

- The floating Code editor is the only file-editing surface. The right panel owns plan, diff,
  browser preview, and terminal surfaces; it does not own file or files surfaces.
- Every real file tab is environment-scoped. Identity must include environment plus path; a bare
  absolute path can collide across containers or worktrees.
- File content and optimistic edits flow through `apps/web/src/state/projectFileState.ts`. Do not
  create a second editor transport or a parallel content cache.
- Workspace-tree files, chat file links, and diff file actions open through
  `apps/web/src/editor/open-floating-file.ts`.
- The editor must not write when the last confirmed read failed, never loaded, or was truncated.
  Closing a real file tab flushes pending autosave instead of offering a misleading discard flow.
- Images, markdown previews, diffs, binary failures, unscoped previews, and truncated reads are
  selected through the guarded surface logic in `apps/web/src/editor/editor-surface.ts`.
- Project filesystem and Git behavior flow through shared contracts/client runtime and the server's
  workspace/VCS services. Do not restore deleted `/api/editor/*` routes as a shortcut.

### Shell surface ownership

- Workspace "Files" opens the floating editor with its file sidebar selected.
- Browser and terminal resources remain right-panel surfaces and can also appear as live nodes in
  the unified tree.
- The right-panel persisted-state migration deliberately drops legacy `file` and `files` surfaces.
  Do not re-add those union members to satisfy old local storage.
- Keep floating surface placement, hit testing, portal overlays, and always-on-top navigation
  coordinated through the shared shell primitives named above.

### Upstream integration is guarded

- `.github/upstream-sync.yml` is the authoritative source/target and hotspot policy.
- Use `$marcode-fork-maintenance` for bootstrap publication, branch protection, fork-drift audits,
  unpublished-main limitations, and conflict-resolution evidence.
- Use `npx vp run upstream:status` and `npx vp run upstream:plan` for read-only inspection.
- Use `npx vp run upstream:integrate` only when explicitly authorized and from a clean target base.
- Never replace the guarded workflow with an ad hoc merge into `main`.
- Hotspots are mandatory-review paths, not "always keep Marcode" paths.
- Do not push, auto-merge, force push, reset, stash, clean, or choose wholesale ours/theirs
  resolutions as part of upstream integration.

## Change workflow

For any Marcode customization:

1. State the invariant the change must preserve.
2. Locate the source owner and its sibling surfaces using the customization map.
3. Compare the affected path with upstream when the behavior originated there:

   ```sh
   git diff upstream/main...HEAD -- <path>
   git log --oneline upstream/main..HEAD -- <path>
   ```

   A local `upstream/main` ref may be stale. Use the checked-in sync tooling when freshness matters.

4. Implement the smallest change at the shared producer.
5. Sweep the sibling entry points named in the map.
6. Run focused tests, formatting, lint, and package typecheck for the affected scope.
7. Drive every affected user-visible client surface.
8. Update the relevant spec, user doc, or skill when the invariant or source owner changed.

## Verification routing

- Unified sidebar: focused tree/build/controller tests plus live sidebar behavior.
- Floating editor/file state: editor-store, editor-surface, open-floating-file,
  projectFileState/fileSaveCoordinator, project RPC, workspace filesystem, and VCS tests as
  applicable.
- Branding: branding and desktop identity tests plus rendered web/desktop labels and asset siblings.
- Floating shell: nav/right-panel/overlay focused tests plus real click, stacking, and viewport checks.
- Upstream automation: sync config/Git/workflow tests and a read-only plan.

Use `npx vp test run <focused-test-files>`. Do not run the full workspace suite as routine local
verification.

## Completion gate

Before claiming a Marcode change is done, report:

- the fork invariant preserved;
- every source and user surface touched;
- the upstream behavior incorporated or ruled out;
- sibling customizations checked;
- focused tests and live runtime evidence;
- compatibility identifiers deliberately left unchanged;
- documentation or skill updates made;
- anything still unverified.
