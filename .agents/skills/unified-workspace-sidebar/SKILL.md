---
name: unified-workspace-sidebar
description: Test, verify, or extend Marcode's unified workspace tree sidebar — the project sidebar that unifies threads, attached files/folders, live terminals, live browser tabs, URL shortcuts, and project commands into one tree. Use when enabling or testing the unifiedWorkspaceSidebar client setting, touching apps/web/src/unifiedWorkspace/**, apps/web/src/components/unified-workspace/**, packages/contracts/src/projectWorkspace.ts, or packages/shared/src/fractionalRank.ts, or when verifying that sidebar tree behavior matches the spec.
---

# Unified Workspace Sidebar

Marcode-only feature; does not exist upstream (T3 Code). It replaces the project's flat thread list
with a tree: threads, attached files/folders, live terminals, live browser tabs, URL shortcuts, and
project commands, all in one place. The right panel is still where content opens — the tree only
navigates and organizes.

Full behavior spec: [`docs/specs/unified-workspace-tree-sidebar.md`](../../../docs/specs/unified-workspace-tree-sidebar.md)
(1146 lines — read it before changing behavior, not this skill). Data-model reference:
[`docs/reference/project-workspace-layout.md`](../../../docs/reference/project-workspace-layout.md).
User-facing description: [`docs/user/unified-workspace-sidebar.md`](../../../docs/user/unified-workspace-sidebar.md).
This skill is the "how do I actually run and verify it" layer — read it before spending time
rediscovering the flag toggle, the file map, or the gaps below.

This feature is under active development at the time of writing (baseline: commit `50471316`,
2026-07-22). Several files this skill names were uncommitted working-tree edits when verified. Re-run
the verification steps in this file before trusting any claim below — do not assume it is still
accurate, and do not assume it is still incomplete either.

## Enable the flag

`unifiedWorkspaceSidebar` is a client setting, default `true`. An explicit `false` renders the
existing flat project → thread list unchanged.

First check the schema actually declares it — this field was added and removed at least once during
development:

```bash
grep -n "unifiedWorkspaceSidebar" packages/contracts/src/settings.ts
```

You need both a `ClientSettingsSchema` line (with `Schema.withDecodingDefault`) and a
`ClientSettingsPatch` line (`Schema.optionalKey(Schema.Boolean)`). If either is missing, the flag
still flips for the current tab (the in-memory settings snapshot updates immediately — see
`apps/web/src/components/Sidebar.logic.ts`'s `isUnifiedWorkspaceSidebarEnabled`/
`ClientSettingsWithUnifiedWorkspaceFlag`) but silently reverts on reload, because
`Schema.encode`/`Schema.decode` in `apps/web/src/clientPersistenceStorage.ts` drops keys the schema
doesn't declare. There is no Settings-page UI toggle for this flag yet — flip it directly. Browser
client settings persist in `localStorage` under `t3code:client-settings:v1`
(`apps/web/src/clientPersistenceStorage.ts`). In the running app's browser context:

```js
const KEY = "t3code:client-settings:v1";
const current = JSON.parse(localStorage.getItem(KEY) ?? "{}");
current.unifiedWorkspaceSidebar = true;
localStorage.setItem(KEY, JSON.stringify(current));
location.reload();
```

Use `test-t3-app`'s isolated environment to do this in a controlled browser, not a shared session.

## Where it lives

| Layer            | Files                                                                                                       | Owns                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema           | `packages/contracts/src/projectWorkspace.ts`                                                                | Entry union, layout command/event, rejection tags. Treated as frozen — see spec §6.                                                                                                                                                                                                                                                                                                         |
| Ordering         | `packages/shared/src/fractionalRank.ts`                                                                     | `rankBetween`/`rankSequence`/`needsCompaction`/`compactRanks`. Lexically-comparable fractional ranks; never use array index as order.                                                                                                                                                                                                                                                       |
| Client ops       | `packages/client-runtime/src/operations/projectWorkspace.ts`                                                | `applyProjectWorkspaceLayout`. Exported as subpath `@t3tools/client-runtime/operations/project-workspace` (kebab-case) — see the naming note below before you go looking for a `project-workspace.ts` file.                                                                                                                                                                                 |
| Server           | `apps/server/src/orchestration/{decider,projector,commandInvariants,Normalizer}.ts`                         | Validates and applies `project.workspace-layout.apply`, emits `project.workspace-layout-applied`.                                                                                                                                                                                                                                                                                           |
| Persistence      | `apps/server/src/persistence/Migrations/033_ProjectWorkspaceLayout.ts`                                      | Adds `workspace_layout_version`/`workspace_layout_json` columns to `projection_projects`, both `NOT NULL DEFAULT`-backed.                                                                                                                                                                                                                                                                   |
| Web view model   | `apps/web/src/unifiedWorkspace/{types,buildTree,treeOperations,activateNode,useUnifiedWorkspaceProject}.ts` | Pure merge of layout + live threads/scripts/terminals/preview tabs into `UnifiedWorkspaceNode[]`; the one hook (`useUnifiedWorkspaceProject`) the sidebar consumes. No React in the pure modules.                                                                                                                                                                                           |
| Web presentation | `apps/web/src/components/unified-workspace/**`                                                              | `UnifiedWorkspaceTree.tsx` (DnD, keyboard, ARIA live region), `UnifiedWorkspaceRow.tsx`, `UnifiedWorkspaceTree.logic.ts` (pure flatten/drop-zone/context-menu-item logic), `UnifiedWorkspaceTree.styles.ts` (literal class recipes from spec §12.4 — do not "clean up" these strings), `UnifiedWorkspaceAddMenu.tsx`, `UnifiedWorkspaceAttachDialog.tsx`, `UnifiedWorkspaceMoveDialog.tsx`. |
| Integration seam | `apps/web/src/components/Sidebar.tsx` (`SidebarProjectWorkspaceTree`), `Sidebar.logic.ts` (flag helpers)    | Mounts the tree instead of the flat list per project when the flag is on.                                                                                                                                                                                                                                                                                                                   |
| Flag             | `packages/contracts/src/settings.ts` (`unifiedWorkspaceSidebar`)                                            | See "Enable the flag" above.                                                                                                                                                                                                                                                                                                                                                                |

## Invariants to protect

These are the things a change to this feature must never break (spec §16, verified against
`buildTree.ts`/`commandInvariants.ts` at the cited baseline):

- **Every unarchived thread renders exactly once.** An unplaced thread becomes a synthetic root
  entry (`buildSyntheticThreadNode`); a thread whose parent got hidden (deleted/archived ancestor)
  reparents to the nearest visible ancestor or root (`resolveDisplayParent`) — it never just
  disappears.
- **The layout stores placement, never runtime objects.** Live terminals/browser tabs are
  synthesized into the tree each render from the existing terminal/preview registries
  (`terminal:<environmentId>:<threadId>:<terminalId>`, `browser:<environmentId>:<threadId>:<tabId>`)
  and are never written into `workspaceLayout`. Closing one removes the live node with no layout
  mutation.
- **"Remove from sidebar" never deletes anything real** — not the file on disk, not the thread, not
  the script, not a running terminal/browser tab. It resets a thread/command entry to a synthetic
  root placement (`removeWorkspaceLayoutEntryById`) and reparents a removed file/folder/URL's
  children to its own parent, preserving order.
- **Attaching a path never touches disk.** `attach-path` stores a project-relative reference; the
  decider does not require the path to still exist (a vanished path becomes a visible broken
  reference — `isBroken`/`TriangleAlertIcon`/"Path not found: …" — never a silent removal).
  `knownPaths: null` (index not loaded yet) is treated as "assume healthy," not "assume broken."
- **No cycles, no cross-project moves.** Both are rejected client-side for drag affordance
  (`treeOperations.ts`/`UnifiedWorkspaceTree.logic.ts`) and authoritatively server-side
  (`requireNoWorkspaceLayoutCycle`, project/parent-scope checks in `commandInvariants.ts`). The
  server is the source of truth; client checks are optimistic UI only.
- **`expectedVersion` conflicts never silently overwrite.** A stale `expectedVersion` returns
  `version-conflict` with `currentVersion`; the client is expected to resync and retry, never guess.
- **Old data decodes cleanly.** `workspaceLayoutVersion`/`workspaceLayout` both decode with defaults
  (`0` / `[]`) via `Schema.withDecodingDefault`, so old projection rows, old events, and a new client
  against an old server all degrade to an empty layout rather than erroring.
- **Native mobile (`apps/mobile`) must keep decoding the project shell** even though it ignores
  layout presentation entirely. Not independently re-verified in this pass — see Known gaps.
- **Grouped projects retain one physical tree per member.** The sidebar lists grouped checkouts or
  worktrees as a single-open accordion, automatically selects the member that owns the active
  thread, and mounts that member's independently indexed/persisted tree. Switching members never
  merges duplicate relative paths or permits a cross-project move.

## Naming: kebab-case export, camelCase file

`packages/client-runtime/package.json`'s `exports` map aliases the public subpath to a differently-cased
internal filename — this is an existing repo convention, not a bug:

```json
"./operations/project-workspace": { "default": "./src/operations/projectWorkspace.ts" }
```

Same pattern already exists for `./state/project-grouping` → `projectGrouping.ts` and
`./state/thread-sort` → `threadSort.ts`. If you grep for `projectWorkspace` and only find the
camelCase file, then go looking for a matching kebab-case file and find nothing, you have not found a
bug — check the `exports` map before concluding an import is broken.

## Known gaps at this baseline

Verify each of these against current `HEAD`/working tree before relying on this list — this feature
was still being integrated live when this skill was written, by agents other than the one who wrote
this file.

- **The project-header "Add item" menu is not mounted.** `UnifiedWorkspaceAddMenuButton`
  (`UnifiedWorkspaceAddMenu.tsx`) is the only UI surface for "Attach file," "Attach folder," "Add URL
  shortcut," and "Add command," and at this baseline it is not rendered anywhere —
  `grep -rn "UnifiedWorkspaceAddMenuButton" apps/web/src` matches only its own definition file. Until
  a project-header trigger mounts it, those four actions have no click path in the running app, even
  though `controller.attachPath`/`addUrlShortcut` and the dialogs behind them are fully implemented.
  The only way layout entries get created today is "New child thread" (row context menu / keyboard),
  drag-and-drop/"Move to…" repositioning, and "Pin shortcut" on a live browser tab.
- **"Add command" has no controller call even once mounted.** `ProjectScriptsControl` owns script
  creation and isn't exposed as a callable trigger; `UnifiedWorkspaceAddMenuButton` falls back to a
  "Not available yet" toast unless a caller passes `onAddCommand`. Nothing currently does.
- **Duplicate-attach doesn't focus the existing node.** Spec §9 calls for focusing/revealing the
  existing row on a duplicate path; the current handler shows an "Already attached" toast instead
  (`UnifiedWorkspaceAddMenu.tsx`'s `handleFocusExistingAttach`) because the controller has no
  "find node id by relative path" lookup yet.
- **Thread rows in the tree show less status than the flat list.** PR badge, worktree badge, jump
  hint, and relative-time label are not threaded through in this pass (`Sidebar.tsx`'s
  `SidebarProjectWorkspaceTree` doc comment says so explicitly). The tree falls back to the
  controller's narrower pending-approval/awaiting-input status only. `UnifiedWorkspaceRow.tsx`
  already accepts a `threadExtras` prop shaped for the richer data — it just isn't populated yet.
- **A stale code comment describes a hook that doesn't exist.** `useUnifiedWorkspaceProject.ts`'s
  file-header comment says it's written against a planned state file
  (`packages/client-runtime/src/state/projectWorkspace.ts`, exporting `useProjectWorkspaceLayout`).
  That file was never created; the hook instead reads `project.workspaceLayout`/
  `project.workspaceLayoutVersion` directly off the `EnvironmentProject` entity (a verified
  pass-through of `OrchestrationProjectShell` via `scopeProject`'s spread in
  `packages/client-runtime/src/state/models.ts`). Don't go looking for that state file.
- **`packages/client-runtime/src/state/projectEntities.ts` carries unused scaffolding for the same
  nonexistent hook** — `createEnvironmentProjectAtoms`/`getLatestEnvironmentProjectAtomAccessor`'s doc
  comment justifies itself by referencing `useProjectWorkspaceLayout`. It isn't dead in the sense of
  being unreachable (the registration still runs), but its stated reason for existing refers to a
  caller that doesn't exist yet. Confirm whether it has a real caller before assuming it's needed.
- **Native mobile parity was not independently re-verified in this pass.** Spec explicitly puts full
  native tree parity out of scope for this release; `apps/mobile` should keep decoding the expanded
  project shell and keep thread-only navigation. Treat as unverified until someone runs the mobile
  decode path after a contracts change.

## Verify a change

Follow root `AGENTS.md`: don't run the full workspace suite. Run the exact test files that exist for
this feature (confirmed present at this baseline):

```bash
vp test run \
  packages/contracts/src/projectWorkspace.test.ts \
  packages/shared/src/fractionalRank.test.ts \
  packages/client-runtime/src/operations/projectWorkspace.test.ts

vp test run \
  apps/server/src/orchestration/decider.workspaceLayout.test.ts \
  apps/server/src/orchestration/projector.workspaceLayout.test.ts \
  apps/server/src/orchestration/commandInvariants.test.ts \
  apps/server/src/persistence/Migrations/033_ProjectWorkspaceLayout.test.ts

vp test run \
  apps/web/src/unifiedWorkspace/buildTree.test.ts \
  apps/web/src/unifiedWorkspace/treeOperations.test.ts \
  apps/web/src/unifiedWorkspace/activateNode.test.ts \
  apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.logic.test.ts \
  apps/web/src/components/Sidebar.logic.test.ts
```

Run targeted typecheck for whichever of `@t3tools/contracts`, `@t3tools/shared`,
`@t3tools/client-runtime`, or the server/web packages you touched — not a repo-wide
`vp run typecheck`.

For an integrated live pass, use the [`test-t3-app`](../test-t3-app/SKILL.md) skill (launch one
isolated environment, authenticate through the printed pairing URL), enable the flag as above, then
work through spec §15's flow, adjusted for the current gaps above (skip steps 2/3's UI trigger if the
Add-item menu still isn't mounted — call `controller.attachPath`/`addUrlShortcut` directly via the
console, or exercise them through `UnifiedWorkspaceAttachDialog`/the Add-URL dialog if you've wired a
temporary trigger):

1. Add a project with at least two files and two folders indexed.
2. Group at least two physical checkouts/worktrees, switch between their member rows, and confirm
   the active thread's member opens automatically with its own folder index.
3. Attach a file and a folder.
4. Create a thread at the project root.
5. Create a thread for the attached file (context menu → "New child thread", or drag a new-thread
   creation onto it).
6. Drag the root thread under the folder.
7. Move it again through "Move to…".
8. Open the file from the tree; confirm the existing right-panel file surface opens.
9. Open a terminal; confirm the live terminal node appears under the thread without a sidebar reload.
10. Run a command; confirm terminal activation.
11. Open two browser tabs; confirm both live browser nodes appear.
12. Pin one browser tab as a URL shortcut; confirm it survives the tab closing.
13. Close the terminal/browser; confirm the live nodes disappear (no stale rows).
14. Reload; confirm persisted placement and shortcuts restore.
15. Archive, then unarchive, a placed thread; confirm placement is preserved across the round trip.
16. Remove an attached file from the sidebar; confirm the file on disk is untouched.
17. Rename/delete a disk path behind an attachment; confirm it renders as a broken reference, not a
    silent removal.
18. Attempt a cycle (drag a folder into its own descendant) and a cross-project drop; confirm both
    are rejected with an explanation.
19. Reconnect a second client/tab; confirm the layout stream synchronizes.

Check both themes and check 390px, 820px, and desktop width — this sidebar inherits Marcode's
existing responsive sidebar sheet behavior, and any new row/menu/dialog can introduce its own overflow
independent of that.

## Troubleshoot predictably

- **Flag doesn't survive reload:** the schema doesn't declare `unifiedWorkspaceSidebar` yet in this
  checkout — see "Enable the flag."
- **Attach/Add URL/Add command have no button:** expected at this baseline — see Known gaps. Don't
  spend time hunting for a UI entry point that isn't wired yet; verify with the grep shown above
  first.
- **A thread appears twice, or not at all:** check the browser console for
  `[unifiedWorkspace] N invalid persisted relationship(s) fell back to root` — `buildUnifiedWorkspaceTree`
  logs a `UnifiedWorkspaceDiagnostic` for every duplicate id, missing parent, cycle, or stale
  thread/script reference it had to paper over. That log, not silence, is the first thing to check.
  It also means the projected layout itself has an orphaned/duplicate entry — the client fallback
  hid the symptom without fixing the cause.
- **A move is silently rejected:** the server is authoritative; a client-side-valid-looking drop can
  still fail on `cross-project`, `cycle`, or `version-conflict` server-side. Check the toast message
  (`reportMutationFailure` surfaces `result.message`) before assuming the UI is broken.
- **Import resolution errors on `@t3tools/client-runtime/operations/project-workspace`:** check the
  `exports` map in `packages/client-runtime/package.json` actually has that kebab-case key — see the
  naming note above.
