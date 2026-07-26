# Unified Workspace ↔ Floating Editor Merge

## Status

**Merged.** `main` is merged into `feature/editor-file-state-unification`
(`4716726f`) and the bridge between the two features is rewritten against the
shared file-state seam (`c9b282a0`). Web typecheck is back to main's 2
pre-existing errors; 189 tests pass across the editor, bridge, and
unified-workspace suites. Pre-merge branch head is preserved at
`backup/editor-unify-premerge` (`4ff0c1e3`).

Still open: the tree → editor click path and the git surfaces have no live
browser verification — see _Remaining_ at the bottom.

The rest of this document is the record of what the merge involved.

Two features were built in parallel and neither knew about the other. Both were
complete on their own branch; the integration between them was not written.

- **main** (`108b4330`) — unified workspace tree sidebar
  (`apps/web/src/unifiedWorkspace/**`, `apps/web/src/components/unified-workspace/**`),
  T3 → Marcode rebrand, floating-nav polish.
- **`feature/editor-file-state-unification`** (`d3c983a0` + working tree) — the
  floating editor migrated onto env-scoped WebSocket RPCs, the `/api/editor/*`
  HTTP surface deleted, tabs re-keyed by composite `fileKey(environmentId, path)`.
  See [`editor-file-state-unification.md`](./editor-file-state-unification.md).

Branch is 3 commits ahead of main and 29 behind. `git merge-tree main
feature/editor-file-state-unification` reports **no textual conflicts**.

## The trap: a clean merge does not compile

Git merges cleanly only because the branch never touched the files main added
after the branch point. One of those files is the bridge between the two
features, and it is written against the pre-migration editor store.

`apps/web/src/editor/open-floating-file.ts` (main-only, does not exist on the
branch):

| line   | call                                         | why it breaks after the merge                         |
| ------ | -------------------------------------------- | ----------------------------------------------------- |
| 52     | `pane.openPaths.includes(absolutePath)`      | `openPaths` hold `fileKey(env, path)`, not bare paths |
| 53     | `setActiveFile(pane.id, absolutePath)`       | expects a composite key                               |
| 55, 67 | `setPendingReveal({ path, line, column })`   | `environmentId` is now required                       |
| 64, 85 | `openFile(paneId, path, name, ext, content)` | signature is `openFile(paneId, ref: FileRef)`         |
| 65, 90 | `setFileLoading(absolutePath, …)`            | removed — content lives in the atom layer             |
| 76     | `fetch("/api/editor/fs/file?path=…")`        | route deleted in P5                                   |

Its two callers are exactly the seams between the two features:

- `apps/web/src/unifiedWorkspace/useUnifiedWorkspaceProject.ts:492` — activating a
  file node in the workspace tree.
- `apps/web/src/components/ChatMarkdown.tsx:1070` — clicking a file path in a chat
  message.

Everything else main changed since the branch point either merges trivially
(`packages/contracts/src/settings.ts`, `apps/web/src/editor/floating-surface-z.ts`)
or is a file the branch rewrote wholesale and main did not touch (`git-panel`,
`quick-open`, `stash-selector`, `floating-code-pill`) — those resolve to the
branch's version, which is correct.

`apps/server/src/ws.ts` is modified on **both** sides. It auto-merges, but read
the merged hunks: the branch adds the new file-mutation and VCS RPCs there.

## What the merge took

1. ~~Finish the branch's in-flight `fileKey` conversion~~ — done (`4ff0c1e3`),
   see _Completed_ below.
2. ~~Merge main → branch~~ — done (`4716726f`). No conflicts, and exactly the
   predicted breakage: 6 new errors, all in `open-floating-file.ts`. The 6
   stale-base errors in `unifiedWorkspace/useUnifiedWorkspaceProject.ts`
   disappeared, since main's copy replaces the branch's.
3. ~~Rewrite `openFileInFloatingEditor` against the shared seam~~ — done
   (`c9b282a0`). It builds a `FileRef` via `makeFileRef` and calls
   `openFile(paneId, ref)`; the `fetch` and both `setFileLoading` calls are gone,
   so content loads lazily from the atom layer; the already-open check is keyed
   with `fileKey`; `setPendingReveal` carries the environment.

   Both open questions resolved:
   - **Sync, not async.** The `Promise<void>` existed only for the fetch. It is
     now `void` and both call sites dropped their `void` operator.
   - **`environmentId` is a required input, not read from the store.** A
     workspace-tree node belongs to its project/thread's environment, which is
     not necessarily the environment the editor is currently pointed at — reading
     `store.environmentId` would open a same-path file from the wrong
     environment, the exact collision composite tab keys exist to prevent. Both
     callers already had the id in scope (`useUnifiedWorkspaceProject`'s
     `environmentId`, `ChatMarkdown`'s `threadRef.environmentId`).

4. ~~Cover the store interaction in `open-floating-file.test.ts`~~ — done. Five
   cases: env-scoped ref with no content in the store, re-open activates instead
   of duplicating, two environments' identical paths stay separate tabs, reveal
   is env-scoped, no-op without an active pane.
5. ~~Re-verify~~ — web typecheck is at main's 2 pre-existing errors
   (`Sidebar.logic.test.ts:870`, `environmentGrouping.test.ts:32`). 189 tests
   pass across `open-floating-file`, `editor-store`, `fileSaveCoordinator`,
   `Sidebar.logic`, and the `unifiedWorkspace` suite. `vp lint` clean on the
   touched files. The app boots on the merged branch.

## Remaining

Live browser verification only — nothing is known broken.

- **Workspace tree → floating editor.** The rewritten bridge is covered by unit
  tests but the click path was not driven end to end: it needs a project in the
  test environment, and "Add project" did not open under browser automation.
  Drive it manually, or seed a project, then click a file node and confirm the
  tab opens with content over WS.
- **Chat file links → floating editor** (`ChatMarkdown`) — same bridge, also not
  driven.
- **Git surfaces** — commit/push, stash create/apply/drop/show, branch switch and
  delete, and the diff view. Outstanding since before the merge.

## Not in scope

The unified-workspace sidebar's own known gaps — Add-item menu not mounted, "Add
command" has no controller call, duplicate-attach shows a toast instead of
focusing the existing node, thread rows missing PR/worktree badges — are tracked
in `.agents/skills/unified-workspace-sidebar/SKILL.md` and are unaffected by this
merge.

## Completed

The branch's in-flight composite-key conversion is finished and verified.

Converted the remaining bare-path call sites (the store, `editor-pane`, and
`file-tree` were already done):

- `tab-bar.tsx` — close button, close-button dirty guard, `Enter` activation, and
  double-click pin all passed `file.path` into a store keyed by `fileKey`; the
  close button silently no-opped. Also added the missing `cancelProjectFile`
  before `clearProjectFileQueryData`, matching the discard order `editor-pane`'s
  `Cmd+W` already used — without it an in-flight autosave can resurrect
  discarded content.
- `search-panel.tsx` — `pinFile` was bare; `setPendingReveal` was missing the now
  required `environmentId`, which made every search-result reveal a no-op.
- `quick-open.tsx` — `pinFile` was bare.
- `editor-pane.tsx` — `EnvFileEditor`/`VirtualFileEditor` are now keyed by the
  composite identity. Without a key React reused one instance across tab
  switches, so `editorRef` still pointed at the **previous** file's Monaco
  instance for a render and the pending-reveal effect fired against it — a search
  hit opened a not-yet-open file at line 1 and consumed the reveal.
- `editor-store.test.ts` — updated to the two-argument `closeFilesUnder` and
  composite fixtures, plus a new case proving a second environment's identical
  path stays open (the invariant the whole conversion exists for).

Evidence:

- `vp run --filter @t3tools/web typecheck` — 8 errors, all pre-existing (2 shared
  with main, 6 stale-base). The 5 introduced by the in-flight refactor are gone.
- `vp test run apps/web/src/editor/editor-store.test.ts apps/web/src/components/files/fileSaveCoordinator.test.ts`
  — 13 passed. With `WorkspaceFileSystem` and `GitVcsDriverCore`: 71 passed.
- `vp lint` on the touched files — clean (2 pre-existing `no-array-index-key`
  warnings on untouched lines).
- Live, in a browser against a dev server on the branch: file opens from the tree
  with content over WS; double-click pins a tab (two tabs coexist instead of the
  preview tab being replaced); the tab close button closes the correct tab;
  content search returns hits; clicking a search result in a **not-yet-open** file
  opens it and lands the cursor on the hit (`Ln 2726, Col 19` for the
  `GitVcsDriverCore.ts:2726` result); quick-open pins its tab.
- Deliberately **not** exercised live: the dirty-tab discard confirm (a
  `window.confirm` freezes browser automation, and typing would write to real
  files in the worktree). Covered by `fileSaveCoordinator`'s flush tests instead.
