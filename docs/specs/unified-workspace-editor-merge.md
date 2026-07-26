# Unified Workspace ↔ Floating Editor Merge

## Status

**Merged.** `main` is merged into `feature/editor-file-state-unification`
(`4716726f`) and the bridge between the two features is rewritten against the
shared file-state seam (`c9b282a0`). Web typecheck is back to main's 2
pre-existing errors; 189 tests pass across the editor, bridge, and
unified-workspace suites. Pre-merge branch head is preserved at
`backup/editor-unify-premerge` (`4ff0c1e3`).

The workspace tree → floating editor path and **all of the git surfaces** are now
verified live against a throwaway sandbox repo, which turned up two real bugs
(both fixed, both pre-existing on `main` rather than caused by the merge) — see
_Live git verification_ below. Still open: chat file links, and one path that
automation cannot reach. See _Remaining_ at the bottom.

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

6. ~~Drive the workspace tree → floating editor path live~~ — done. Added the
   marcode repo as a project with `node apps/server/src/bin.ts project add <path>
--base-dir <dir>` (the application command; no projection seeding), then
   clicked file nodes in the unified workspace tree. Both `AGENTS.md` and
   `package.json` opened in the floating editor with content, the editor
   re-rooted to the project (`dev/marcode`), and **zero `/api/editor/*` requests**
   were made — content came over the WS seam, which is the whole point of the
   rewrite.

## Live git verification

Driven in a browser against a throwaway sandbox repo — `/private/tmp/marcode-git-verify`,
three commits, two branches, and a local bare repo as `origin` so push has a real
target and nothing reaches a network. Registered with
`node apps/server/src/bin.ts project add <path> --base-dir <dir> --title git-verify`.
Every result below was checked against real git state in a shell, not against
what the panel drew.

- **Status / changes list** — the sandbox's modified + untracked files, with the
  count and per-file line deltas.
- **Diff view** — side-by-side HEAD vs working tree, added line marked.
- **Commit** — produced `210e7cd` containing both selected files (including the
  untracked one), tree clean afterwards, panel dropped to zero changes and the
  message box cleared.
- **Push** — the bare `origin`'s `main` advanced to `210e7cd`, local ahead count
  went 1 → 0 and the footer's push affordance disappeared.
- **Stash create** — `stash@{0}`, working tree reverted.
- **Stash show** — opens the patch as a `.diffs/stash-stash@{0}.diff` tab.
- **Stash apply** — confirm dialog, then the change is back on disk and the stash
  is retained (apply, not pop).
- **Stash drop** — confirm dialog listing id / message / branch / date, then the
  stash list is empty.
- **Branch switch** — succeeds on a clean tree (verified in both directions), and
  now surfaces an error when git refuses (see the two bugs below).
- **Branch delete** — confirm dialog, branch gone from `git branch`.
- **Edit → autosave → disk** — typing in the editor reached the real file and
  showed up in `git status` as a modification. First live proof of the
  `FileSaveCoordinator` path; previously only unit-tested.

### Two bugs this found, both pre-existing on `main`

1. **The git panel acted on the wrong repo** (`322f13bf`). `useWorkspace` only
   resolved a workspace for a `kind: "server"` route, so every `/draft/:draftId`
   route — including the app's own startup state — fell through to `projects[0]`.
   The whole editor takes its root from that value, so a draft in project B put
   the git panel on project A's repo. Caught before touching anything: the panel
   reported `main`, no changes, and **60 unpushed commits**, which is the real
   `dev/marcode` checkout, not the sandbox. Push was one click away.
2. **A failed branch switch was silent** (`e1fba006`). The error state and its
   banner both existed; Radix's default select-dismiss unmounted the banner's
   host before it could render.

Both are `main` bugs that the merge inherited, not merge damage.

## Remaining

- **Chat file links → floating editor** (`ChatMarkdown`) — same bridge, same code
  path as the verified tree click, but not driven end to end (needs a thread with
  a message containing a file path).
- **Dirty-tab discard confirm** — still not driven, and now understood to be
  close to unreachable rather than merely awkward. Autosave debounces at 500 ms
  (`FILE_AUTOSAVE_DEBOUNCE_MS`), and the confirm is gated on
  `dirtyKeys.has(key)`, which autosave clears — so the prompt only appears if the
  close click lands within half a second of the last keystroke. Attempts to race
  it from browser automation never produced a prompt while the file was already
  persisted to disk. Worth deciding whether that confirm should exist at all,
  rather than testing harder.
- **Git panel does not react to an in-editor save.** Editing a file writes it to
  disk, but the panel keeps showing "no changes" until Refresh is clicked; the
  status did appear correctly on refresh. This is the "cross-surface dirty state"
  item from the older spec, now pinned down: it is a missing live update, not a
  wrong value.
- **Driver errors are not specific.** A refused branch switch reports
  `GitVcsDriver.switchRef.checkout ... failed` without git's stderr, so the user
  is told an operation failed but not why.
- **Stash rows overflow the sidebar.** At the default git-panel width the stash
  message and the View / Apply / Delete buttons cannot be on screen at the same
  time; the actions sit outside the 240px panel and need a horizontal scroll to
  reach.

## Unrelated finding

While verifying, the client polled `GET /api/orchestration/threads/<id>` in a
tight loop against a thread that no longer exists, taking a 404 every time and
never backing off or giving up. The id came from a `t3code:composer-drafts:v1`
entry in `localStorage` — a composer draft outliving its thread, which is what a
wiped or rebuilt environment produces (and what deleting a thread with an open
draft would also produce). Not caused by this merge and not fixed here.

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
