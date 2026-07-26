# Floating Editor File-State Unification

## Status

Implemented (P0–P5). The floating code editor is fully migrated onto the
provider-environment model: file content, the file tree, file mutations, git
operations, and content search all flow through environment-scoped WebSocket
RPCs. The raw host-filesystem HTTP surface is retired.

A follow-up pass re-keyed tabs by composite `fileKey(environmentId, path)` so two
environments mounted at the same absolute path cannot share a tab; that
conversion is complete and browser-verified for the file/tab surfaces. The git
surfaces still have no interactive verification (see _Verification_), and the
merge with main's unified workspace sidebar is specified separately in
[`unified-workspace-editor-merge.md`](./unified-workspace-editor-merge.md).

## Background

Two file-editing surfaces coexist in the web app:

- **Floating code editor** (`apps/web/src/editor/`) — a ported mentiko IDE-style
  Monaco surface with split panes, tabs, file tree, search, and a git panel.
- **Files panel** (`apps/web/src/components/files/FilePreviewPanel.tsx`) — the
  native T3 review surface backed by `@pierre/diffs`.

Before this work the floating editor operated on an **independent data plane**:
its own zustand content cache, manual `Cmd+S` saves, and a private set of HTTP
routes (`/api/editor/fs/*`, `/api/editor/git`) that did raw `node:fs` /
`execFileSync` on host absolute paths. The Files panel used the
environment-scoped WebSocket RPCs (`projects.readFile`, `projects.writeFile`,
etc.) onto the provider workspace.

Consequences:

- **Two sources of truth** per file — edits in one surface were invisible to the
  other.
- The raw HTTP routes were only correct when host filesystem == provider
  workspace (local single-env). In isolated/remote environments they read and
  wrote the wrong tree.
- Two git models: the ported mentiko git client and the existing VCS subsystem.

## Target architecture

One shared file-state layer keyed by `{environmentId, cwd, relativePath}`,
consumed by both surfaces; one transport (WebSocket); one sandbox
(`WorkspaceFileSystem` + `WorkspacePaths`); one git model (the VCS subsystem).

- **One buffer per file.** Both surfaces read/write the same optimistic atom
  family (`projectEnvironment.optimisticFile`), so an edit in the floating
  editor surfaces as dirty state in the Files panel on the same keystroke.
- **One save model.** Debounced 500 ms autosave (`FileSaveCoordinator`) with
  `Cmd+S` as a force-flush. `flushProjectFile()` is exported so any component
  (e.g. the tab-bar save button) can force-persist via a coordinator registry.
- **Tabs as env-refs.** `FileData` carries `{environmentId, cwd, relativePath}`
  alongside its absolute `path` (identity/display); content no longer lives in
  the store.
- **One transport / one sandbox / one git model.** No `/api/editor/*` HTTP
  surface remains.

## Decisions

Three trade-offs were resolved during planning:

1. **Save model — autosave + `Cmd+S` flush.** Uniform semantics across surfaces
   (matches the Files panel); `Cmd+S` remains as the universal "save now"
   accelerator via `FileSaveCoordinator.flush()`. Chosen over manual-save-only
   (which would have reintroduced two sources of truth) and pure-autosave
   (which drops a universal IDE reflex).
2. **Environment scope — per-tab env-refs.** Each tab carries its originating
   `{environmentId, cwd}`, so navigating threads never corrupts open tabs and
   tabs from different environments can coexist. Degrades to "follow active
   thread" when only one environment exists.
3. **Mutations transport — environment-scoped WS RPCs.** All file mutations
   (create/rename/delete) and git operations go through new WS contracts on
   `WorkspaceFileSystem` + the VCS subsystem, inheriting `WorkspacePaths`
   sandboxing and the VCS driver. The raw HTTP routes are deleted, not
   deprecated.

## Implementation

### P0 — Shared seam

- `apps/web/src/state/projectFileState.ts` — `useProjectFile` (reactive read +
  dirty), `useProjectFileEditor` (`update` / `flush` / `revert`), a coordinator
  registry, and `flushProjectFile()`.
- `FileSaveCoordinator.flush()` (cancel debounce, persist now; re-persist with a
  0 ms timer when content changes during an in-flight write).
- `useWorkspace()` exposes `environmentId` alongside `workspacePath` (it always
  resolved it internally from the active thread).

### P1 — Content binding + tab env-identity

- `FileData` drops `content` / `savedContent` / `originalContent`; gains
  `{environmentId, cwd, relativePath}` and optional `diffOriginal` / `virtualContent`.
- `editor-pane` is split into `EnvFileEditor` (bound to the seam — reactive
  content, autosave, `Cmd+S` flush, markdown preview, diff) and
  `VirtualFileEditor` (read-only commit/stash patches), so React's hook rules
  are respected without env sentinels.
- All content fetches removed from `tab-bar`, `quick-open`, `file-tree`,
  `search-panel`, `git-panel`; opening a file registers a ref and content loads
  lazily from the atom layer.
- Dirty state lives in the store's `dirtyKeys`, driven by the seam's
  `onPendingChange`; discard-on-close reverts the optimistic overlay.

### P2 — Tree over WS

- `file-tree` and `quick-open` consume `projects.listEntries` via
  `useProjectEntriesQuery`, with an `entriesToTree` adapter (flat `ProjectEntry[]`
  → nested `FileNode[]`, absolute paths). `useProjectEntriesQuery` accepts a
  nullable `environmentId`.

### P3 — Create / rename / delete over WS

- New contracts: `ProjectCreateFile` / `ProjectRenameFile` / `ProjectDeleteFile`
  (inputs, results, errors; `ProjectFileFailure` extended with `path_already_exists`
  / `path_not_found`, `ProjectFileOperation` with create/rename/delete).
- `WorkspaceFileSystem.createFile` / `renameFile` / `deleteFile` (inherit
  `resolveRelativePathWithinRoot` sandboxing + `WorkspacePathAlreadyExistsError` /
  `WorkspacePathNotFoundError`). Wired through `ws.ts`; client atoms in
  `projectCommands.ts`; `file-tree` swapped over.

### P4 — Git consolidation onto the VCS subsystem

The existing VCS subsystem covered ~9 of the ported panel's ~22 git actions.
The remaining surface was added as new env-scoped RPCs across the full stack
(contract → `GitVcsDriver` → `GitVcsDriverCore` → `GitWorkflowService` →
`ws.ts` → client atom → UI):

- `vcs.showFile` — file contents at a git ref (diff views; `null` when not
  present at the ref). `sanitizeGitRelativePath` rejects `..`, absolute, and
  NUL paths before the `git show ref:path` call.
- `vcs.deleteRef` — local / remote-tracking branch delete.
- `vcs.log` — commit history (sha, author, date, message, parents) with cursor
  pagination.
- Stash domain — `vcs.listStashes`, `vcs.createStash`, `vcs.applyStash`,
  `vcs.dropStash`, `vcs.showStash`. `createStash` detects creation via a
  before/after `stash list` count (git's exit code / stdout are unreliable on a
  clean tree).
- `git-panel`, `branch-selector`, `stash-selector`, and the `editor-pane` diff
  view rewritten to consume `vcsEnvironment` / `vcsActionManager` atoms.
- Commit/push via the existing `runStackedAction` with `filePaths` (the VCS
  status model has no staged/unstaged split — files are committed directly).

### Content search over WS

- New `projects.searchContent` RPC — ripgrep scoped to the workspace root (`rg`
  runs with `cwd = workspace`, searching `.`), returning line/column matches.
- `search-panel` consumes the reactive atom (debounced query keys the atom
  family).

### P5 — Retire the HTTP surface

- `apps/server/src/editor/editorHttpRoutes.ts` **deleted**; its layer removed
  from `server.ts`. Zero `/api/editor/*` call sites remain in `apps/web/src`.
- `file-tree` git-status badges migrated to the `vcsEnvironment.status`
  subscription (per-file M/A/D kind collapses to a uniform "changed" indicator,
  since `VcsStatusResult.workingTree.files` carry only path + insertions +
  deletions). The `/api/editor/config` fallback in `floating-code-pill` is
  dropped (env-scoping makes it redundant).

## Verification

Automated, all green at the pre-existing baselines:

- Typecheck — server 118 / web 8 / client-runtime 18 errors (all pre-existing;
  zero introduced).
- Web production build succeeds.
- `vp lint` clean (exit 0) across touched files.
- Tests — `WorkspaceFileSystem` (21), `GitVcsDriverCore` (35),
  `FileSaveCoordinator` (6), `contracts/project` (2) all passing. New coverage:
  11 `WorkspaceFileSystem` mutation tests, 7 `GitVcsDriverCore` git tests
  (showFile / deleteRef / log / stash lifecycle), 3 `flush()` tests, 2
  `searchContent` tests.

Interactive, in a browser against a dev server on this branch:

- open a file from the tree — content arrives over the WS RPC (status bar line
  count / size / language populated);
- double-click a tab pins it — a second opened file adds a tab instead of
  replacing the preview tab;
- the tab close button closes that tab and leaves the other open;
- content search returns hits across files;
- clicking a search result in a not-yet-open file opens it and lands the cursor
  on the hit line/column;
- quick-open (`Cmd+P`) opens and pins.

**Outstanding:**

- The git surfaces have no interactive verification: commit / push, stash
  create / apply / drop / show, branch switch and delete, and the diff view.
- The dirty-tab discard confirm was deliberately not driven in automation — a
  `window.confirm` blocks the browser-automation session, and producing a dirty
  buffer would have written to real files in this worktree. `FileSaveCoordinator`'s
  flush tests cover the save path instead.
- Cross-surface dirty state (edit in the floating editor → dirty in the Files
  panel) is unverified for the same reason.

## Known reductions vs. the ported mentiko panel

- No staged/unstaged split (commits selected files directly).
- Per-file M/A/D tree badges are now a uniform "changed" indicator.
- Commit-history click-to-view-patch was dropped (no `showCommit` atom).
- Stash apply no longer surfaces a conflict-resolution dialog (`applyStash`
  returns only `{id}`).

These align the floating editor with T3's native git model.

## Key files

| Layer                       | Location                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared seam                 | `apps/web/src/state/projectFileState.ts`                                                                                                      |
| Editor store (env-ref tabs) | `apps/web/src/editor/editor-store.ts`                                                                                                         |
| Editor surfaces             | `apps/web/src/editor/{editor-pane,git-panel,branch-selector,stash-selector,file-tree,quick-open,search-panel,tab-bar,floating-code-pill}.tsx` |
| Coordinator                 | `apps/web/src/components/files/fileSaveCoordinator.ts`                                                                                        |
| Contracts                   | `packages/contracts/src/{project,git,rpc,ipc}.ts`                                                                                             |
| File sandbox                | `apps/server/src/workspace/WorkspaceFileSystem.ts`                                                                                            |
| VCS driver                  | `apps/server/src/vcs/{GitVcsDriver,GitVcsDriverCore}.ts`                                                                                      |
| Workflow service            | `apps/server/src/git/GitWorkflowService.ts`                                                                                                   |
| WS wiring                   | `apps/server/src/ws.ts`                                                                                                                       |
| Client atoms                | `packages/client-runtime/src/state/{projectCommands,vcs}.ts`                                                                                  |
