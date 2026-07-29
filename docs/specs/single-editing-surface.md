# Single Editing Surface

## Status

**Implemented. Partially verified live.** All four stages landed across twelve
commits (`f756da5f` → `33c39170`). The floating pill editor is now the only
surface that opens a workspace file; `FilePreviewPanel` and `FileBrowserPanel`
are deleted along with the `file`/`files` right-panel kinds. Net −899 lines of
source.

Static gates green: web typecheck **clean** (the two long-standing baseline
errors were fixed independently while this landed), server typecheck clean, 99
tests passing across the touched suites, `vp lint` exit 0, production build
succeeds. An adversarial review of the full diff returned zero blocking and zero
material findings.

**Driven live and passing (4):**

- **The truncation guard.** `assets/large.log`, 1,500,000 bytes. Banner shown,
  editor read-only, keystroke refused; **1500000 bytes before and after**,
  re-checked independently after the run. Before this change the same sequence
  left the file at 1,048,576.
- **Binary/error path.** A real PNG renders a legible message instead of the
  blank _editable_ buffer it used to, where one keystroke would have replaced the
  binary.
- **Cross-workspace isolation.** Two repos holding the same relative path: edited
  one, the other stayed byte-for-byte identical, verified with `git status` in
  both rather than from the UI's own claims.
- **The v7→v8 migration.** A persisted v7 `file` surface was injected and
  dropped cleanly on reload, with no empty panel or orphan tab.

**Not verified, and deliberately not pursued (4):** the right panel's Files card,
a diff-panel file click, the plan/diff/browser/terminal regression sweep, and the
390px/820px viewports. The first three need a real thread with turns, which the
sandbox cannot produce without running a full-access agent against it.

That verification run also triggered an incident — a misclick registered an
unrelated real repository as a project and started an agent turn inside it.
Nothing was modified, but the conclusion stands: **this app should not be driven
by browser automation on a machine holding real work.** The Command Palette
browses and registers any directory the server can read, and a project's empty
state is one click from a full-access turn. Full writeup and preserved evidence:
`/private/tmp/marcode-single-surface-verify/ISOLATION-INCIDENT.md`.

The remaining gates are a minute of clicking in a real workspace. That is the
right way to close them.

Every `file:line` below was read on `feature/editor-file-state-unification`.
Citations were anchored before the implementation landed, so line numbers in
the files this change touched have since moved — the symbol names are the
durable part. Claims that could not be checked against the code are labelled
_unverified_ inline.

This is a shared checkout — `floating-code-pill.tsx` and `index.css` were being
edited by another agent while this was written, and the pill's line numbers
shifted by four mid-audit. Re-grep before trusting any single citation in that
file; the anchors quoted alongside them (symbol names, class strings) are the
durable part.

**Reviewed.** An independent adversarial pass against the source found one
blocking error and five material ones; all are folded in below. The two P0
findings were confirmed end to end. The correction that mattered: the
entry-point enumeration was wrong — there is a **sixth** producer (site F), and
without it Stages 2 and 3 both fail. Corrections are marked _[review]_ where
they replace something this spec previously asserted.

Marcode has two file-editing UIs. This retires T3's right-panel one
(`FilePreviewPanel`) and makes the floating pill the only surface that opens a
workspace file.

The framing in the task that produced this spec — "the file-state layer is
already shared, so this is a routing + capability problem, not a state problem"
— is right about state and wrong about capability. The shared layer really is
done (`apps/web/src/state/projectFileState.ts`, one buffer per
`{environmentId, cwd, relativePath}`). But the pill is **not** a drop-in: it has
no error state, no truncation handling, no image preview, and no browser-preview
handoff. Two of those are silent-data-loss shaped. They are prerequisites, not
follow-ups, and they are Stage 1 below.

## The two surfaces

**Floating pill** — `apps/web/src/editor/` (17 `.tsx` files plus stores and helpers). Mounted unconditionally in
`apps/web/src/routes/__root.tsx:126`, inside the authenticated app shell.
Monaco-based, owns its own tabs/panes/splits in
`apps/web/src/editor/editor-store.ts`, plus a file tree, search, quick open, and
a full git panel.

**T3 right panel** — `apps/web/src/components/files/FilePreviewPanel.tsx` (951
lines) is the surface. `FileBrowserPanel.tsx` is not rendered by the app
directly; `FilePreviewPanel` renders it as its file tree
(`FilePreviewPanel.tsx:43` import, `:939` render). It is lazily imported at
`ChatView.tsx:354` and rendered at `ChatView.tsx:5316-5337` for **both** the
`"files"` and `"file"` right-panel kinds. Retiring the surface means retiring
`FilePreviewPanel`; `FileBrowserPanel` follows as its only child.

## The bridge

`apps/web/src/editor/open-floating-file.ts` — `openFileInFloatingEditor(input)`
and `resolveFloatingFileTarget(workspacePath, relativePath)`. Unit-tested in
`open-floating-file.test.ts` (7 cases).

It takes `environmentId` as a required input rather than reading
`store.environmentId`, deliberately (`open-floating-file.ts:8-15`): a chat link
or a tree node belongs to its own thread's environment, not the one the editor
currently points at.

Already routed through it (2):

- `apps/web/src/components/ChatMarkdown.tsx:1065-1075` — chat file links, and it
  already passes `line`.
- `apps/web/src/unifiedWorkspace/useUnifiedWorkspaceProject.ts:488-494` —
  workspace-tree file activation.

## Resolved questions

### 1. Scope mismatch — the tab is scoped, the chrome is not

The right panel keys off `ScopedThreadRef`; the pill keys off environment +
workspace path. What happens to a file opened from a thread whose worktree
differs from the pill's current workspace?

**The tab is correct.** `FileData` carries its own `environmentId`, `cwd`, and
`relativePath` (`editor-store.ts:27-35`), tab identity is the composite
`fileKey(environmentId, path)` (`:73-75`), and `EnvFileEditor` reads and writes
through exactly those three fields (`editor-pane.tsx:259`, `:267`). A file
opened from thread B's worktree while the pill is pointed at workspace A gets a
tab with the right content, the right save target, and no collision with a
same-named file in A. There is a test for the two-environments case
(`open-floating-file.test.ts:90-108`).

**The chrome is not.** The pill's `projectRoot` is `useWorkspace().workspacePath`
(`floating-code-pill.tsx:171`), which is derived from the **route**
(`editor/workspace.ts:47-53`: active thread's worktree → its project's
workspaceRoot → `projects[0]` → server cwd). That single value roots the file
tree, search panel, git panel, quick open, and `SplitContainer`
(`floating-code-pill.tsx:675`, `:681`, `:684`, `:776`, `:779`, `:782`, `:840`,
`:855`). So does `store.environmentId`, set from the same hook
(`floating-code-pill.tsx:173-175`) and read by `git-panel.tsx:186`,
`search-panel.tsx:38`, `quick-open.tsx:37`, `file-tree.tsx:199`.

Two consequences worth stating plainly:

- **`setTreeWorkspacePath` in the bridge is dead.**
  `open-floating-file.ts:61` sets it; `floating-code-pill.tsx:177-179`
  unconditionally sets it back to `projectRoot` on the next render. And nothing
  in the chrome reads it anyway — its only consumers are the synthetic `cwd` for
  `openVirtualFile` and `openView` (`editor-store.ts:401`, `:432`).
- **`makeFileRef` has a silent fallback.** If the absolute path is not under
  `cwd`, `relativePath` becomes the absolute path (`editor-store.ts:57-59`).
  The bridge never trips this because `resolveFloatingFileTarget` joins
  `relativePath` onto `workspacePath` first, but it means **every migrated call
  site must pass the workspace the path is relative to**, not the pill's current
  one. `diffFileActions` in particular must pass the thread's cwd.

**Decision: do not re-root the pill per tab.** Re-rooting would fight the route,
thrash the git panel, and reset the tree on every cross-worktree click. Instead:

- Tabs stay independently scoped (already true).
- Tree / search / git / quick open stay on the route's workspace (already true).
- Make the divergence **visible** rather than silent: when a tab's `cwd` differs
  from the pill's `projectRoot`, the tab bar shows the workspace basename. Today
  the two files are indistinguishable. This is new work — Stage 1.
- Delete the dead `setTreeWorkspacePath` call from the bridge and its now-unused
  behaviour, or make `floating-code-pill.tsx:177-179` not clobber it. Prefer
  deleting the bridge call: the field is vestigial and the pill owns the root.

### 2. Does the bridge support `line`? — Yes

`openFileInFloatingEditor` accepts `line` and `column`
(`open-floating-file.ts:18-19`) and writes an environment-scoped `pendingReveal`
(`:74-81`). `EnvFileEditor` consumes it on Monaco mount
(`editor-pane.tsx:334-345`) and again on tab switch (`:351-365`), clearing it
after. Covered by `open-floating-file.test.ts:110-124`, and already exercised
live by chat file links (`ChatMarkdown.tsx:1073`).

Repeat-open semantics match the right panel's. `rightPanelStore.openFile` bumps
`revealRequestId` so re-opening the same path re-reveals
(`rightPanelStore.ts:299-303`); the bridge sets a fresh `pendingReveal` object
each call and the pane effect depends on that object, so it re-fires the same
way.

**Not a prerequisite.** One gap: `openFile` never had a `column` parameter, so
nothing is lost, but `resolvePathLinkTarget` can encode `:line:col` into the
path string it returns (`terminal-links.ts:284-285`) — call sites that pass a
raw `path:line` string must split it before handing it to the bridge, or the
line ends up in the filename.

### 3. Do both `"files"` and `"file"` go away? — Both

They cannot be separated. Both kinds render the same component
(`ChatView.tsx:5316`), and `"files"` **is** the file-browser host — keeping it
keeps `FilePreviewPanel` mounted, which is the thing being retired.

- `"file"` has one producer: `rightPanelStore.openFile` (`:288-314`).
- `"files"` has **three** _[review]_: `ChatView.addFilesSurface`,
  `useUnifiedWorkspaceProject.openFilesSurface`, and — missed on the first pass
  — the pill nav's own "Files" item (`FloatingPillNav.tsx:291-298`, grep
  `meta: "workspace:files"`) → `dispatchWorkspaceAction("files")` →
  `ChatView.tsx:4096-4099` `toggle(activeThreadRef, "files")`. See site F.

Both go. Details under _rightPanelStore_ below.

### 4. Mobile / narrow viewports — laid out, not yet proven

The pill has a real narrow mode, not a desktop layout squeezed:

- `MOBILE_BREAKPOINT = 640` (`floating-code-pill.tsx:73`), applied via
  `matchMedia` with a live `change` listener (`:147-152`).
- At that width the panel goes full-bleed — `MOBILE_BOUNDS = {top:0, left:0,
right:0, bottom:0}` (`:72`) — and the sidebar starts collapsed (`:151`).
- The file tree becomes a collapsible top panel capped at 40% height
  (`:592-596`), toggled by a header button that only exists on mobile
  (`:511-519`).
- Drag, resize, pin, and split are disabled (`:360`, `:455`, `:507`, `:543`,
  `:561`).
- The **Code Editor** pill item is rendered unconditionally
  (`FloatingPillNav.tsx:1437-1447`) and is deliberately placed before the
  contextual portal slot so it is never what falls off a narrow row (the comment
  at `:1449-1456` says so explicitly).

And the right panel is not a better mobile surface: below 980px it is already a
sheet (`rightPanelLayout.ts:1`), sized `min(88vw,24rem)` below 760px
(`rightPanelLayout.ts:3`) — roughly 343px of usable width at a 390px viewport.
Removing it does not remove a mobile-first surface; it removes a narrower one.

**Unverified: whether Monaco is actually usable at 390px.** No live check was
run for this spec. Specifically unknown — whether the tab bar scrolls or
overflows with 3+ tabs, whether the status bar fits, and whether touch selection
and the on-screen keyboard behave. This is a **blocking gate** on Stage 4, not a
reason to abandon the plan. See _Verification_.

### 5. Upstream sync — delete, and declare the deletion

`apps/web/src/components/files/**` is not in the hotspot list
(`.github/upstream-sync.yml:34-68`); `apps/web/src/editor/**` is, as
`owner: editor-runtime`.

Upstream is actively working in that directory — five commits in ~five weeks,
three of them within eight days of this spec:

| commit     | date       | change                                     |
| ---------- | ---------- | ------------------------------------------ |
| `8ca4eec9` | 2026-07-20 | drag files from the explorer into composer |
| `0936fd27` | 2026-07-20 | preview workspace images in the file panel |
| `4cfec8c1` | 2026-07-18 | file explorer mention actions              |
| `fb103454` | 2026-06-23 | persistent word-wrap setting               |
| `9a78c6f2` | 2026-06-20 | structured local-storage failures          |

**Decision: delete, and add `apps/web/src/components/files/**`to`hotspots`.\*\*

Leave-orphaned merges more cleanly — that is true and it is the whole case for
it. It is still the wrong call. Orphaned, `FilePreviewPanel.tsx` +
`FileBrowserPanel.tsx` are ~43KB of TSX that nothing renders, still importing
`@pierre/diffs`, still carrying `FilePreviewPanel.test.ts`, and still absorbing
upstream commits that no one reviews because nothing exercises them. That is the
worse failure mode: an upstream change lands cleanly into dead code and looks
fine.

Deleting costs one conflict per upstream touch of any deleted file, resolved by
`git rm`-ing it again. At the observed rate that is a handful of times a year
and each resolution is mechanical. The hotspot entry makes it a reviewed
decision every sync instead of a surprise:

```yaml
- path: "apps/web/src/components/files/**"
  owner: editor-runtime
  reason: "Marcode retired the right-panel file surface; the floating editor owns file editing"
```

Note the four helpers that **stay** (see _Deletions_) — the hotspot glob covers
them too, which is correct: upstream changes to `projectFilesQueryState.ts` are
exactly what the shared file-state layer needs reviewed.

## Capability gap table

`FilePreviewPanel` does more than edit text. Every capability, audited:

| Capability                                                    | Where it lives today                                                                                                     | Pill status                                                                                                                                   | Decision                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Edit + autosave                                               | `EditableFileSurface` `:332-591`                                                                                         | `EnvFileEditor` (`editor-pane.tsx:247`), Monaco, same shared buffer                                                                           | **Covered.** Pill is the better editor.                                                                  |
| Loading state                                                 | `:873-876`                                                                                                               | `editor-pane.tsx:367-375` WaveSpinner                                                                                                         | **Covered.**                                                                                             |
| **Read error state**                                          | `:869-872` renders `file.error`                                                                                          | **None.** `EnvFileEditor` never reads `fileState.error`; falls to `contents ?? ""` (`:378`) → blank editor                                    | **P0 — build.** See below.                                                                               |
| **1 MB truncation**                                           | banner `:849-853` + read-only viewer `:887-912`                                                                          | **None.** `fileState.truncated` is never read; the tab is editable and autosave writes the truncated buffer back                              | **P0 — build.** Data loss.                                                                               |
| **Image preview**                                             | `WorkspaceImagePreview` `:118-153`, `useAssetUrlState`                                                                   | **None.** `useProjectFile` always issues the text read; server rejects binary                                                                 | **P1 — build.** See below.                                                                               |
| Markdown rendering                                            | `ChatMarkdown` via `RenderedMarkdownSurface` `:593-637`                                                                  | `editor/markdown.tsx` — plain `react-markdown` + gfm; preview is the default for `.md`/`.mdx` (`editor-pane.tsx:138`, `:295-300`, `:385-390`) | **Partial — accept.** See below.                                                                         |
| Markdown task-checkbox writeback                              | `setMarkdownTaskChecked` `:625-633`                                                                                      | None                                                                                                                                          | **Drop.** Editable source is one toggle away.                                                            |
| **Browser preview handoff**                                   | `handleOpenInBrowser` `:713-735`, `.html`/`.pdf` only                                                                    | **None**                                                                                                                                      | **P1 — build** as a tab action.                                                                          |
| Open in external editor                                       | `OpenInPicker` `:773-782`, primary environment only                                                                      | None in the pill                                                                                                                              | **Keep out.** Still reachable from chat file links and the diff panel via `useOpenInPreferredEditor`.    |
| Breadcrumbs                                                   | `fileBreadcrumbs` `:688-691`, rendered `:748-771`                                                                        | Tab label + `projectRoot` basename in the header (`floating-code-pill.tsx:525-529`)                                                           | **Drop.**                                                                                                |
| Line reveal                                                   | `useFileLineReveal` `:184-281`                                                                                           | `pendingReveal` (`editor-pane.tsx:334-365`)                                                                                                   | **Covered.** See Q2.                                                                                     |
| `@pierre/diffs` viewer                                        | `VirtualizedFile`/`EditorProvider`/`Virtualizer` `:538-590`                                                              | Monaco, plus a Monaco side-by-side diff for diff tabs (`editor-pane.tsx:391-416`)                                                             | **Drop the renderer, keep the capability.**                                                              |
| Line-range selection + comment drafting                       | `:460-591`, `fileCommentAnnotations.ts`, `LocalCommentAnnotation.tsx`, `buildFileReviewComment`                          | **None**                                                                                                                                      | **Drop from the file surface.** See below.                                                               |
| Asset URL resolution                                          | `useAssetUrlState` `:124-128`                                                                                            | None                                                                                                                                          | Follows image preview — **P1**.                                                                          |
| Word wrap                                                     | `useClientSettings(s => s.wordWrap)` `:663`                                                                              | Own `editorConfig.wordWrap` in localStorage (`editor-store.ts:112`, `:120-127`)                                                               | **Accept divergence.** Pill's config panel is richer; the client setting still governs chat code blocks. |
| File tree                                                     | `FileBrowserPanel` `:939-945`                                                                                            | `editor/file-tree.tsx` — plus create / rename / delete (`:488`, `:572`, `:638`) and git-status refresh (`:476`)                               | **Pill is richer.**                                                                                      |
| Tree drag → composer mention                                  | `fileTreeDragMention.ts`, wired `:142-148`, `:205-218`                                                                   | **None**                                                                                                                                      | **P2 gap — accept for now.** Tracked, not built.                                                         |
| Tree "Copy mention" / "Add to chat"                           | `:75-135` (desktop-only, needs `readLocalApi()`)                                                                         | Pill tree has its own menu: New file / New folder / Rename / Delete (`file-tree.tsx:873-905`)                                                 | **P2 gap — accept for now.** Tracked, not built.                                                         |
| Tree search / refresh                                         | `:236-251`                                                                                                               | `SearchPanel` + `refreshTree` (`file-tree.tsx:213`)                                                                                           | **Covered.**                                                                                             |
| Surface-tab "Copy path"                                       | `RightPanelTabs.tsx:289-291`, `:314`                                                                                     | **None** in the pill tab bar                                                                                                                  | **P2 — build.** One menu item; cheap.                                                                    |
| **Theme** _[review]_                                          | Follows app light/dark (`useTheme` `:662`, `resolveDiffThemeName` `:562`; tree `colorScheme` `FileBrowserPanel.tsx:261`) | Hardcoded dark `mentiko-void` Monaco theme (`editor-pane.tsx:47-90`, bg `#0a0a0a`)                                                            | **Accept divergence — deliberate.** See below.                                                           |
| Tree header: indexing / file count / partial-index _[review]_ | `FileBrowserPanel.tsx:230-234`, error branch `:253-254`                                                                  | None — `rg truncated apps/web/src/editor/` returns nothing                                                                                    | **Partial-index state: build.** Count and "Indexing…" : drop.                                            |
| Markdown default view _[review]_                              | Defaults to **source**; toggle opts into rendered (`:675-684`)                                                           | Defaults `.md`/`.mdx` to **preview** (`editor-pane.tsx:295-300`)                                                                              | **Accept.** Behaviour change on migration day; preview-first is the better default.                      |
| Unsaved indicator on the tab                                  | `pendingFileSurfaceIds` → `RightPanelTabs`                                                                               | `dirtyKeys` → tab bar dot + "N unsaved" in the header (`floating-code-pill.tsx:530-534`)                                                      | **Covered.**                                                                                             |

Four of these need saying properly.

**Error state (P0).** `useProjectFile` exposes `error`
(`projectFileState.ts:126`), and `EnvFileEditor` ignores it. Trace: on a failed
read, `query.isPending` is false and `data` is null, so `contents` is null; the
spinner guard at `editor-pane.tsx:367` requires `isPending`, so it does not
fire; execution reaches `:378` and Monaco mounts on `""`. **A file that failed
to read renders as an empty editable buffer.** If the user then types, autosave
writes to a path the server just said it could not read. This is reachable today
from the pill's own file tree — it is a pre-existing pill bug, not damage caused
by this migration — but it becomes load-bearing the moment the pill is the only
surface.

**Truncation (P0).** Same shape, worse outcome. The server caps reads at
`PROJECT_READ_FILE_MAX_BYTES = 1024 * 1024`
(`apps/server/src/workspace/WorkspaceFileSystem.ts:38`, `:286`, `:313`).
`useProjectFile` surfaces `truncated` (`projectFileState.ts:123`); `EnvFileEditor`
never reads it. So a 4MB file opens showing its first 1MB, looks complete, and
the first keystroke queues an autosave that **truncates the file on disk to 1MB**.
`FilePreviewPanel` avoids this by rendering truncated files through a read-only
`File` viewer with a banner (`:849-853`, `:887-912`).

**Image preview (P1).** `FilePreviewPanel` skips the text read entirely for
images — `useProjectFileQuery(environmentId, cwd, relativePath, !isImage)`
(`:673`) — and renders an `<img>` from an asset URL (`:118-153`). The pill has
no such branch: `useProjectFile` calls `useProjectFileQuery` with no `enabled`
argument (`projectFileState.ts:113`), so it always issues the read, and the
server returns `is binary and cannot be previewed as text`
(`WorkspaceFileSystem.ts:105`) — which, per the error-state bug above, renders
as a blank editor. Minimum acceptable behaviour once the error state exists is a
legible "binary file" message. Full image preview is the port of
`WorkspaceImagePreview` + `useAssetUrlState`.

_[review]_ It is **not** free, and the spec's earlier "no new plumbing" was
wrong. The `workspace-file` asset resource requires a `threadId` by contract
(`packages/contracts/src/assets.ts:8-11`) and the server resolves the file
against **that thread's** workspace root (`apps/server/src/assets/AssetAccess.ts:177-192`,
`apps/server/src/ws.ts` `worktreePath ?? workspaceRoot`). The pill has an
environment and a cwd, no thread.

Three ways out, and the choice matters because two of them are wrong:

1. **Ship the binary message only, defer image preview.** Cheapest. But it drops
   a capability upstream shipped six days before this spec (`0936fd27`), and
   dropping it silently is the failure mode this document exists to prevent.
2. **Add a cwd-addressed asset variant** to the contract and server. Correct in
   the abstract, but it drags a client-only migration into `packages/contracts`
   and `apps/server`. Scope creep.
3. **Resolve a thread from the route** (the same `resolveThreadRouteTarget` walk
   `editor/workspace.ts` already does) and render the preview **only when a
   route thread exists and the tab's `cwd` equals that thread's workspace root.**

**Take 3.** It covers the ordinary case — one workspace, a thread route — with
no new server surface, and the guard is load-bearing rather than defensive: two
worktrees holding the same `docs/logo.png` would otherwise render the wrong
image with nothing on screen to say so. Where the guard fails, fall through to
the binary-file message from the error state. Option 1 remains the acceptable
floor if the gating proves messier than it looks.

**Line comments (drop from files, keep in diffs).** This is the one genuine
capability loss and it is smaller than it looks. Selecting lines in a file and
attaching a comment to the composer draft goes away for the **file** surface.
The same interaction survives on the **diff** surface: `DiffPanel.tsx:812`
renders `AnnotatableCodeView`, which imports the same
`components/files/fileCommentAnnotations.ts` and
`components/files/LocalCommentAnnotation.tsx`
(`components/diffs/AnnotatableCodeView.tsx:37`, `:97`). Review-by-commenting was
always primarily a diff workflow; the file-surface copy was the secondary one.
Both helper modules therefore **survive the deletion** — they are shared, not
`FilePreviewPanel`-exclusive.

**Theme (accept the divergence).** _[review]_ `FilePreviewPanel` follows the app
theme; the pill hardcodes dark. So a light-theme user loses the only file surface
that matched their theme. Considered: (1) accept and document; (2) add a light
Monaco variant switched off `useTheme()`; (3) theme the whole pill.

(3) is out — it means editing `floating-code-pill.tsx` and re-skinning the panel
chrome, tab bar, sidebar and status bar, which is a design project, not a
migration. (2) sounds like the conscientious middle but produces a light code
pane inside a dark floating panel, which is worse than either end state. The
pill's darkness is not an oversight, it is the surface's identity.

**Accept (1).** The regression is real and it is small: the code content is
legible and syntax-highlighted either way. Recorded here so it is a decision
rather than a silence — if light-theme users complain, the answer is (3), scoped
properly.

**Partial file index (build).** _[review]_ Distinct from the per-file 1 MB
truncation. `FileBrowserPanel` surfaces "· partial" when the entries query is
truncated (`:230-234`); the pill's tree reads no entries-query state at all. A
file tree that silently shows a subset is decorative truth. Surface it in
`editor/file-tree.tsx`. The "Indexing…" label and the file count are cosmetic and
are dropped.

**Markdown (partial, accept).** The pill already defaults `.md`/`.mdx` to a
rendered preview with an `edit`/`preview` toggle (`editor-pane.tsx:138`,
`:295-300`, `:385-390`, `:457-464`). It is `react-markdown` + `remark-gfm`
(`editor/markdown.tsx`), not `ChatMarkdown`, so it loses chat-flavoured
extensions and the task-checkbox writeback. Swapping in `ChatMarkdown` is
possible but drags a `threadRef` and `cwd` into the editor pane for a preview
mode. Not worth it. If the rendering quality turns out to matter, that is a
separate, self-contained change.

## Where the write guard belongs

_[review]_ A write-path audit asked whether guarding `EnvFileEditor` is enough to
stop a truncated buffer reaching disk. Answer: **for today's code, yes — and for
a reason fragile enough that it should not be the safety mechanism.**

The good news is structural. `FileSaveCoordinator` holds no file state: content
enters only through `change()`, and `flush()`, `dispose()` and `persistLatest()`
all bail at revision 0 (`fileSaveCoordinator.ts:47`, `:52-56`, `:91`). So Cmd+S,
the tab-bar save button, tab close, Cmd+W and unmount are **all provably inert**
on a file that was never edited. The earlier worry that `flushProjectFileRef`
fires on close regardless of what rendered is real but harmless — it hits an
empty coordinator and issues no RPC. Every write funnels through one inlet:
Monaco's `onChange` → `useProjectFileEditor.update()`.

The bad news is that the guard eats its own signal. `setProjectFileQueryData`
stamps `truncated: false` into the optimistic overlay
(`projectFilesQueryState.ts:57-63`), and `useProjectFileQuery` prefers the
overlay (`:161`). **The first `update()` that slips through erases the
truncation flag** — and with it the banner and the `readOnly`. It holds today
only because the component that reads the flag is also the only thing that can
write it. Circular, self-consistent, and it breaks silently the moment anyone
adds a second `update()` caller.

So the guard goes at the choke point as well:

- **`update()`** no-ops when the last _confirmed_ read was truncated or errored,
  read non-reactively via the already-exported `getProjectFileQueryAtom` +
  `appAtomRegistry.get`. Gating here also keeps the flag alive, because the
  overlay is never stamped.
- **the `persist` closure** (`projectFileState.ts:165-169`) applies the same
  predicate, catching anything already inside the coordinator. This covers one
  edge a render guard structurally cannot: a `change()` is queued, the file grows
  externally, a refresh flips `truncated` true, the pane goes read-only — and the
  already-armed 500 ms timer still writes the stale buffer. You cannot cancel an
  armed coordinator from the render layer.

Requiring a confirmed _successful_ read closes the error case in the same lines.
The worst concrete case there is binary: the read fails
(`WorkspaceBinaryFileError`) but `writeFile` succeeds, so one keystroke in a
binary file's blank tab replaces the binary.

**And a server backstop**, because the client story only holds for clients that
have shipped the fix. `writeFile` has no precondition of any kind
(`WorkspaceFileSystem.ts:332-368`). The guard is precise rather than heuristic:
no client of this transport can hold the full contents of a file over
`PROJECT_READ_FILE_MAX_BYTES`, because the read path will not give it to them —
so **any** write to an existing file above the cap is provably lossy. Stat before
writing, reject above the cap, let ENOENT through so creation still works. ~15
lines and one typed error, following `WorkspaceBinaryFileError`'s shape, with one
`ws.ts` mapping case (`:239`).

The render-layer work stays. It is the UX — it is what tells the user why the
file is read-only. It just stops being the thing standing between them and data
loss.

**Not fixed by any of this, and it dies on its own:** `FilePreviewPanel`'s
markdown-checkbox writeback. Its branch order (`:878-887`) tests
`isMarkdown && renderMarkdown` _before_ `file.data.truncated`, so a >1 MB `.md`
with the rendered view toggled mounts `RenderedMarkdownSurface`, and one checkbox
click runs `setMarkdownTaskChecked` over the truncated buffer and writes it
(`:625-633`). Narrow, real, and live until Stage 3 deletes the panel. The server
backstop covers it in the meantime.

## Per-call-site migration plan

**Six** entry points reach the right panel, not five _[review]_ — the pill nav's
own "Files" item was missed on the first pass and is site F. The
unified-workspace pair also deserves a correction to the framing that produced
this spec.

### A. `useUnifiedWorkspaceProject.ts:495-497` — not a second path, a fallback

`activateNode.ts:136` is not itself a right-panel call — it invokes the injected
`ops.openFile`, whose real implementation is
`useUnifiedWorkspaceProject.ts:488-498`. Reading it end to end resolves "two
paths coexist, find out why":

```ts
const workspacePath = targetThread?.worktreePath ?? project?.workspaceRoot;
if (workspacePath) { openFileInFloatingEditor({...}); return; }
useRightPanelStore.getState().openFile(...);
```

They are not competing paths. `:495-497` is the **fallback for when no workspace
path can be resolved** — a thread with no worktree in a project with no
`workspaceRoot`.

That fallback is a no-op with extra steps. The right panel needs
`activeProject && activeWorkspaceRoot` to render at all
(`ChatView.tsx:5317-5318`), and `activeWorkspaceRoot` is derived exactly the same
way — `activeThreadWorktreePath ?? activeProjectCwd` (`ChatView.tsx:2391`). So
the condition that sends you down the fallback is the condition that makes the
panel render nothing. (Strictly: once the route settles. Activation navigates to
the target thread first via `resolveThreadIdForActivation`
(`activateNode.ts:105-115`), and `router.navigate` is fire-and-forget
(`useUnifiedWorkspaceProject.ts:475`), so the store write lands before the route
does — which changes the timing, not the outcome.)

**Migration:** delete lines `:495-497`; when `workspacePath` is null, do nothing
(and, if you want to be kind, toast "This project has no workspace"). Net
change: `ops.openFile` becomes unconditional.

### B. `useUnifiedWorkspaceProject.ts:499-503` — `openFilesSurface`

Folder activation in the workspace tree (`activateNode.ts:139-142`) — this is
the actual `"files"` producer on that path, not `:136`.

**Migration:** open the pill with its file sidebar showing —
`useEditorStore.getState().openOverlay()` +
`setSidebarView("files")`.

**Known loss:** the folder is not expanded or scrolled to. The pill's tree keeps
`expanded` in component-local `useState` (`file-tree.tsx:184`), so there is no
cross-component reveal API. Building one means a `pendingTreeReveal` store field
mirroring `pendingReveal`. **Recommendation: do not build it in this migration.**
Ship the open-the-tree behaviour, see whether anyone misses folder focus. If they
do, it is ~20 lines against an established pattern.

### C. `diffFileActions.ts:13-25`

```ts
if (threadRef) {
  useRightPanelStore.getState().openFile(threadRef, filePath);
  return;
}
openInEditor(activeCwd ? resolvePathLinkTarget(filePath, activeCwd) : filePath);
```

Single caller: `DiffPanel.tsx:457-480`.

**Migration:** replace the `threadRef` branch with `openFileInFloatingEditor`.
_[review]_ No signature change is needed — an earlier draft claimed otherwise.
`activeCwd` is already a parameter (`diffFileActions.ts:9`) and `environmentId`
rides on `threadRef`. In `DiffPanel`,
`activeCwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot`
(`DiffPanel.tsx:219`) is the correct `workspacePath`. Every input the bridge
needs is already there; only the guard tightens, from `if (threadRef)` to
`if (threadRef && activeCwd)`.

New shape:

```ts
if (threadRef && activeCwd) {
  openFileInFloatingEditor({
    environmentId: threadRef.environmentId,
    workspacePath: activeCwd,
    relativePath: filePath,
  });
  return;
}
openInEditor(activeCwd ? resolvePathLinkTarget(filePath, activeCwd) : filePath);
```

Keep the external-editor fallback — it is the only path for a non-thread diff
route.

Two hazards. **`filePath` shape:** the diff's path is repo-relative
(`resolveFileDiffPath`), which is what the bridge wants, but if it can ever
carry a `:line` suffix it must be split before it reaches
`resolveFloatingFileTarget` — see Q2. **Worth checking during implementation;
not verified here.** **Intent:** the right panel opens the _editable working
file_, not a diff. The bridge does the same. Do not silently upgrade this to
`openDiffFile` (`editor-store.ts:354`) — that is a different feature and a
different decision.

`diffFileActions.test.ts` (2 cases) must be rewritten against the bridge.

### D. `ChatView.tsx:3043-3049` — `openFileSurface`

```ts
const openFileSurface = useCallback(
  (relativePath: string) => {
    if (!activeThreadRef || !activeProject) return;
    useRightPanelStore.getState().openFile(activeThreadRef, relativePath);
  },
  [activeProject, activeThreadRef],
);
```

Its only consumer is `FilePreviewPanel`'s own `onOpenFile`
(`ChatView.tsx:5334`) — the callback `FileBrowserPanel` fires when a tree row is
selected (`FileBrowserPanel.tsx:175`).

**Migration: delete it.** It has no life independent of the panel it feeds. It
disappears with the render block in Stage 3, along with `handleFilePendingChange`
(`:1628-1645`), `pendingFileSurfaceIdsByProject` (`:1622-1627`),
`activeFileSurface` (`:1539`), and `copyRightPanelFilePath` (`:3300`).

### E. `ChatView.tsx:3039-3042` + `:5706` / `:5733` — the "Files" card

`addFilesSurface` opens the `"files"` kind. It is wired into `RightPanelTabs` as
`onAddFiles` at both render sites — inline (`:5706`) and sheet (`:5733`) — where
it becomes the "Files — Browse and read workspace files" card
(`RightPanelTabs.tsx:115-122`, `:457-464`).

**Migration:** point it at the pill —
`useEditorStore.getState().openOverlay()` + `setSidebarView("files")` — and
retitle the card so it does not promise a right-panel surface. Suggested:
**"Files — Open the code editor."** Then, in Stage 4, remove the card entirely
along with `onAddFiles` / `filesAvailable` /
`SURFACE_DISABLED_REASONS.files`; the pill nav's own **Code Editor** item
(`FloatingPillNav.tsx:1437`) is the durable affordance and duplicating it in the
right-panel add menu is clutter.

Since Stages 2E, 3 and 4 land as one change, the retitle is skipped and the card
is removed outright — there is no intermediate state to protect.

### F. `FloatingPillNav.tsx` "Files" item — _[review] the missed producer_

Not in the original enumeration, and Stages 2 and 3 both fail without it.

The pill nav renders a workspace item labelled `"Files"`
(`FloatingPillNav.tsx:291-298`, grep `meta: "workspace:files"`) whose `onClick`
is `dispatchWorkspaceAction("files")`. That dispatches `WORKSPACE_ACTION_EVENT`,
which `ChatView.tsx` handles in a `switch (action)` whose `case "files":` arm
(`:4096-4099`) runs `useRightPanelStore.getState().toggle(activeThreadRef, "files")`.
The item sits outside the `isServerThread` guard, so it is always visible.

Left alone it breaks twice: Stage 2 ships a nav button that opens a retired
surface, and Stage 3 produces two `TS2367` errors — the `toggle(..., "files")`
call and the item's `active: activePanelKind === "files"` comparison, both now
against a union without that member.

**Does the item survive?** There is already a "Code Editor" item a few lines
below (`:1437-1447`), so a case exists for deleting "Files" as a duplicate. It
is the wrong call: the two express different intents — "Files" lands you on the
file tree, "Code Editor" toggles the editor at whatever tab you left — and the
nav item is contextual to the workspace category while Code Editor is a global
utility. Deleting a nav button people have muscle memory for is a bigger change
than repointing it.

**Migration:** retarget the `case "files":` arm at the pill (`openOverlay()` +
`setSidebarView("files")`, same as sites B and E), keeping the existing
`activeProject !== null` guard. Drive the item's `active` from the editor store
— overlay open **and** `sidebarView === "files"` — instead of `activePanelKind`;
`FloatingPillNav.tsx` already imports `useEditorStore`. The `WorkspaceAction`
union member `"files"` stays: the action still exists, only its target moved.

## What happens to `rightPanelStore`

`RIGHT_PANEL_KINDS` goes from six to four:

```ts
export const RIGHT_PANEL_KINDS = ["plan", "diff", "preview", "terminal"] as const;
```

Removed:

- `RightPanelSurface`'s `{ id: "files"; kind: "files" }` (`:32`) and the whole
  `{ id: \`file:${string}\`; kind: "file"; relativePath; revealLine;
  revealRequestId }` variant (`:33-39`).
- `openFile` (`:55` declaration, `:288-314` implementation) — the only method
  that ever produced a `"file"` surface.
- `fileSurface()` (`:116-126`) and `normalizeRevealLine()` (`:177-180`).
- The `"files"` arm of `singletonSurface` (`:104-105`).
- `reconcileFileSurfaces` (`:84`, `:511-531`) and its caller
  (`ChatView.tsx:1651-1654`) — it exists only to prune `files`/`file` surfaces
  when a workspace disappears.
- The `surface.kind === "file"` migration arm (`:199-212`).
- `RightPanelTabs`'s `"Copy path"` menu item (`:289-291`, `:314`) and the
  `onCopyFilePath` prop (`:42`). The equivalent is rebuilt on the pill's tab bar
  in Stage 1 — see the P2 row in the capability table.
- _[review]_ **Two exhaustive `switch (surface.kind)` statements in
  `RightPanelTabs.tsx`** that the first draft missed: `surfaceTitle`
  (`:194-218`, arms at `:197` and `:199-200`) and `SurfaceIcon` (`:246-269`,
  arms at `:254-264`, one using `PierreEntryIcon`). Both break the moment the
  union shrinks. Remove the arms and every import they orphan — a stranded
  import is a lint failure, and this is the most under-counted part of the
  Stage 3 diff.

Simplified:

- `open` and `toggle` lose the `Exclude<..., "file" | "terminal">` gymnastics
  (`:53`, `:88`, `:99`) — with `"file"` gone, `Exclude<RightPanelKind,
"terminal">` is the whole story.
- `withoutStandaloneExplorer` (`:291-293`) — the rule that opening a file
  replaces the standalone explorer surface. _[review]_ An earlier draft
  attributed this to `openBrowser`; it actually lives inside `openFile` and dies
  with it. `openBrowser`'s own filter is `withoutPlaceholder` (`:282-284`) and
  must be left alone.

**Persisted state must be migrated, not just left alone.**
`RIGHT_PANEL_STORAGE_KEY = "marcode:right-panel-state:v2"` at
`RIGHT_PANEL_STORAGE_VERSION = 7` (`:42-43`). Every existing install has
`files`/`file` surfaces in `localStorage`. Bump to `8` and extend
`migratePersistedRightPanelState` (`:182-262`) to **drop** them:

```ts
if (surface.kind === "file" || surface.kind === "files") return [];
```

_[review]_ **That snippet does not compile as written.** Once the variants leave
`RightPanelSurface`, `surface.kind === "file"` compares against a union that no
longer has the member — `TS2367`, inside the exact function the version bump
depends on. Type the migration's input as a legacy shape that still knows the
old kinds (a local `LegacyRightPanelSurface = RightPanelSurface | { kind: "file" | "files" }`,
or a looser structural read) and keep the widening inside the migration
function. Do not weaken `RightPanelSurface` itself to make the comparison legal.

The existing `activeSurfaceId` reconciliation at `:247-251` already handles the
fallout — it nulls the active id when the surface it names is gone. Without the
bump, a user with a persisted `file:` surface gets a panel whose active surface
matches no render branch: `ChatView.tsx:5341` falls to `null`, so an empty panel
with an untitled tab. Not fatal, but it is exactly the kind of "looks broken"
state that gets reported as a regression.

**Untouched:** `plan`, `diff`, `preview`, `terminal` and all their machinery,
including the whole terminal-group model. The store keeps earning its keep.

## Staged plan

Each stage leaves the app working and shippable. No big-bang cut. Stages 1–2 are
independently valuable even if the rest is abandoned.

### Stage 1 — Close the capability gaps in the pill (no routing change)

Nothing is retired. The right panel still works. Purely additive to
`apps/web/src/editor/`.

1. **Error state** in `EnvFileEditor`: render `fileState.error` instead of
   falling through to an empty Monaco (`editor-pane.tsx:367-380`). Block edits
   while errored.
2. **Truncation**: read `fileState.truncated`; show a banner and mount Monaco
   `readOnly` so autosave can never write a truncated buffer back. Mirrors
   `FilePreviewPanel.tsx:849-853`, `:887-912`.
3. **Image preview**: branch on `isWorkspaceImagePreviewPath` before the read
   (as `FilePreviewPanel.tsx:673` does) and render the ported
   `WorkspaceImagePreview`. Needs `useAssetUrlState` and a `threadRef` for the
   `workspace-file` asset resource (`FilePreviewPanel.tsx:124-128`) — check
   whether the asset can be addressed without a thread; **unverified**. If it
   cannot, fall back to the binary-file message from (1) and re-scope image
   preview as its own change.
4. **Browser preview handoff**: a tab action for `.html`/`.pdf`
   (`isBrowserPreviewFile`, `browser/openFileInPreview.ts:25`) calling
   `openFileInPreview`. Note it opens a right-panel **browser** surface
   (`openFileInPreview` → `useRightPanelStore.openBrowser`) — that surface stays,
   so this keeps working after the file kinds are gone.
5. **Cross-workspace tab labelling**: show the workspace basename on a tab whose
   `cwd` differs from `projectRoot`. Closes the visible half of Q1.
6. **Tab-bar "Copy path"** (P2, cheap, do it here).
7. **Write gates at the choke point** _[review]_ — see _Where the write guard
   belongs_ below. Two predicates in `useProjectFileEditor`
   (`state/projectFileState.ts`), plus a server-side size backstop in
   `apps/server/src/workspace/WorkspaceFileSystem.ts`.

Tests: unit coverage for (1) and (2) in `editor-pane`-adjacent tests — the
truncation guard in particular must have a test that fails if the read-only flag
is dropped, because the failure mode is silent data loss.

Rollback: revert; nothing else changed.

### Stage 2 — Reroute the call sites

Right panel still renders; these paths just stop producing its file surfaces.

- A: the dead right-panel fallback in `useUnifiedWorkspaceProject`'s `openFile`
  op, deleted — replaced by a toast so the click is not silently swallowed.
- B: `openFilesSurface` → open the pill's file sidebar.
- C: `diffFileActions.ts` → bridge. No signature change (see site C); rewrite
  `diffFileActions.test.ts`.
- D: `ChatView.openFileSurface` left in place — it only feeds the panel and dies
  with it in Stage 3.
- E: `addFilesSurface` → pill.
- F: _[review]_ the pill nav's `"Files"` item → pill, plus its `active` state
  re-sourced from the editor store.

_[review]_ An earlier draft claimed this stage ends with **nothing** producing a
`file` or `files` surface. Two things falsify that, and both are fine as long as
they are named. Old persisted state can still restore a surface — that is
intentional, and it is the window in which to confirm nothing was missed. And
via site D, a user who lands on a restored `files` surface still has a live
`FilePreviewPanel` whose tree rows call `openFileSurface` and mint fresh `file:`
surfaces until Stage 3. Nothing _new_ is produced by a fresh session; the
residue is bounded and short-lived.

Rollback: revert the call sites individually. Each is 3–10 lines.

### Stage 3 — Remove the render path and the store kinds

1. Delete the `"files" || "file"` branch (`ChatView.tsx:5316-5337`) and the
   `FilePreviewPanel` lazy import (`:354`).
2. Delete `openFileSurface` (`:3043-3049`), `handleFilePendingChange`
   (`:1628-1645`), `pendingFileSurfaceIdsByProject` (`:1622-1627`),
   `activeFileSurface` (`:1539`), `copyRightPanelFilePath` (`:3300`), the
   `reconcileFileSurfaces` effect (`:1651-1654`), and the now-unused
   `pendingSurfaceIds` / `onCopyFilePath` props at `:5694`, `:5702`, `:5721`,
   `:5729`.
3. _[review]_ `RightPanelTabs.tsx`: remove the `"files"`/`"file"` arms from both
   exhaustive switches (`surfaceTitle`, `SurfaceIcon`), the `"Copy path"` item,
   the `onCopyFilePath` prop, and every orphaned import.
4. Apply the `rightPanelStore` changes above, including the version bump to `8`
   and the drop migration — with the legacy-typed input, or it will not compile.
   `rightPanelStore.test.ts` is ~503 lines with roughly ten file-kind cases
   (`:82`, `:136-221`, `:444-480`): delete those and **add a case proving the
   v7→v8 migration drops persisted `file`/`files` surfaces** and falls the
   active id back correctly. Check
   `components/preview/openTerminalLinkInPreview.test.ts` and
   `components/preview/addBrowserSurface.test.ts`, which also touch the store.
5. Delete the files listed under _Deletions_ — splitting
   `FilePreviewPanel.test.ts` first, not deleting it — and reword the two stale
   comments.
6. Add the `hotspots` entry to `.github/upstream-sync.yml`.

Rollback: this is the one stage with a real revert cost — a store schema version
is in play. See _Rollback posture_.

### Stage 4 — Remove the "Files" card

Delete `addFilesSurface` (`ChatView.tsx:3039-3042`), the `onAddFiles` /
`filesAvailable` props, the card (`RightPanelTabs.tsx:115-122`, `:457-464`,
`:486`, `:489`), and `SURFACE_DISABLED_REASONS.files`.

Split from Stage 3 so the surface-removal diff and the add-menu diff can be
reviewed and reverted independently.

**Gated on the 390px live check.** If the pill turns out to be unusable at that
width, stop here: Stages 1–3 already collapse to one surface, and Stage 4 is
only cosmetic cleanup. The mobile fix would then be pill work, not a right-panel
restoration.

## Deletions

Exact paths. Everything else in `apps/web/src/components/files/` **stays**,
because it is imported from outside that directory.

**Delete:**

```
apps/web/src/components/files/FilePreviewPanel.tsx
apps/web/src/components/files/FilePreviewPanel.test.ts   # SPLIT FIRST — see below
apps/web/src/components/files/FileBrowserPanel.tsx
apps/web/src/components/files/fileContentRevision.ts
apps/web/src/components/files/fileContentRevision.test.ts
apps/web/src/components/files/fileEditorDismissal.ts
apps/web/src/components/files/filePath.ts
apps/web/src/components/files/filePath.test.ts
apps/web/src/components/files/filePreviewMode.ts
apps/web/src/components/files/fileTreeDragMention.ts
apps/web/src/components/files/fileTreeDragMention.test.ts
```

Verified exclusive to the two deleted components: `projectFileCacheKey`
(`fileContentRevision.ts:10`) used only at `FilePreviewPanel.tsx:552`, `:900`;
`fileBreadcrumbs` (`filePath.ts:7`) only at `:689`; `isMarkdownPreviewFile` /
`setMarkdownTaskChecked` (`filePreviewMode.ts:1`, `:3`) only at `:680`, `:629`;
`installFileEditorDismissal` (`fileEditorDismissal.ts:30`) only at `:502`;
`createFileTreeDragMentionController` (`fileTreeDragMention.ts:47`) only at
`FileBrowserPanel.tsx:144`.

**Keep — imported outside `components/files/`:**

| File                             | Imported by                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `fileSaveCoordinator.ts`         | `state/projectFileState.ts:5` — the shared layer's autosave engine                                                               |
| `fileSaveCoordinator.test.ts`    | keep with it                                                                                                                     |
| `projectFilesQueryState.ts`      | `state/projectFileState.ts:6`, `editor/quick-open.tsx`, `editor/file-tree.tsx`, `unifiedWorkspace/useUnifiedWorkspaceProject.ts` |
| `projectFilesQueryState.test.ts` | keep with it                                                                                                                     |
| `fileCommentAnnotations.ts`      | `components/diffs/AnnotatableCodeView.tsx` — the diff panel's line comments                                                      |
| `LocalCommentAnnotation.tsx`     | `components/diffs/AnnotatableCodeView.tsx`                                                                                       |

Those six are the reason `components/files/` cannot be removed as a directory,
and the reason its hotspot entry is worth having.

**`FilePreviewPanel.test.ts` must be split, not deleted.** _[review]_ Despite the
name it does not test `FilePreviewPanel` at all. It holds three `describe`
blocks: one for `fileCommentAnnotations` — a **kept** module, and this is its
only coverage anywhere in the repo — and two for `filePreviewMode`, which is
being deleted. Move the annotations block to a new
`apps/web/src/components/files/fileCommentAnnotations.test.ts`, then delete the
rest with its module. Deleting the file wholesale would silently strip the diff
panel's line-comment helpers of their only tests.

**Two stale comments the deletions strand.** _[review]_ Reword, do not change the
code: `apps/web/src/hooks/useHandleNewThread.ts` names `rightPanelStore.openFile`
in a doc comment (the spec's own grep gate would trip on it), and
`apps/web/src/unifiedWorkspace/useUnifiedWorkspaceProject.ts:281-282` names
`FileBrowserPanel.tsx` as the file-index source — the source is really
`projectFilesQueryState.ts`, which survives.

**Also delete / edit:**

- `apps/web/src/diffFileActions.ts` — rewritten, not deleted (the external-editor
  fallback survives).
- `apps/web/src/diffFileActions.test.ts` — rewritten against the bridge.
- `apps/web/src/rightPanelStore.ts` — the members enumerated above.
- `apps/web/src/components/RightPanelTabs.tsx` — the Files card and
  `onCopyFilePath` plumbing.
- `apps/web/src/components/ChatView.tsx` — the render branch and its five
  supporting hooks.
- `.github/upstream-sync.yml` — one added `hotspots` entry.

Do **not** touch `apps/web/src/components/diffs/**`.

## Rollback posture

**Stages 1, 2, 4** — plain `git revert`. Stage 1 is additive; Stages 2 and 4 are
small call-site diffs with no persisted state.

**Stage 3** is the asymmetric one, in exactly one respect: the storage version
bump to `8`. Reverting the code restores the `openFile` producer, but a user who
loaded the app on `8` had their `file`/`files` surfaces stripped from
`localStorage`. Reverting does not bring them back — they are gone, permanently,
for that user.

That is acceptable and should be stated rather than engineered around. A
right-panel file surface is a _view_, not data: the file itself is untouched on
disk, and unsaved edits are not at risk because `flushProjectFileRef` commits
pending buffers on close (`state/projectFileState.ts:69-76`) and autosave runs at
500ms (`:29`). The worst outcome is "the panel forgot which files I had open."
The alternative — a reversible migration that preserves surfaces it can no longer
render — is more machinery than the loss justifies.

**Practical posture:**

- Ship Stages 1 and 2 first and let them sit. They are independently valuable and
  fully reversible, and Stage 2 is where a missed call site would surface.
- Ship Stage 3 as one commit, so `git revert <sha>` is the whole rollback.
- Take a `backup/pre-single-surface` tag at the Stage 2 head, matching the
  `backup/editor-unify-premerge` convention from
  [`unified-workspace-editor-merge.md`](./unified-workspace-editor-merge.md).
- If Stage 4 is reverted, the Files card comes back pointing at the pill (its
  Stage 2 state), which is still correct behaviour. Stage 4 is safe to bounce.

## Verification

Unit tests are necessary and nowhere near sufficient. The two P0 bugs this spec
found — the blank-editor error state and the truncating autosave — both pass
every existing test.

### Must be driven live in a browser

Use a throwaway sandbox repo, the way _Live git verification_ in
[`unified-workspace-editor-merge.md`](./unified-workspace-editor-merge.md) did —
`node apps/server/src/bin.ts project add <path> --base-dir <dir>`. Do not type
into the real worktree.

**Stage 1 gates (desktop, 1440px):**

1. Open a file the server cannot read (permission-denied, or a `.png`). The
   error is legible. Monaco is not editable. Nothing is written.
2. Open a file over 1MB. Banner present; editor read-only; `git status` clean
   after clicking into it and pressing a key. **Then check the file's byte count
   on disk** — this is the one that matters.
3. Open a `.png`. Image renders (or, if image preview was descoped, the binary
   message renders).
4. Open an `.html`. The browser-preview action opens the preview surface.
5. Open a file from thread B's worktree while the pill is rooted at project A.
   Tab shows B's workspace; edits land in B's file; A's same-named file is
   untouched. Verify against `git status` in **both** repos.

**Stage 2 gates:**

6. Diff panel → click a changed file → it opens in the pill, in the right
   worktree, editable, and the diff panel still works.
7. Workspace tree → click a file → pill. Click a **folder** → pill opens with
   the file sidebar showing.
8. Right panel → Files card → pill opens with the file sidebar showing.
9. Chat file link with a line number → pill opens at that line. This is the path
   `unified-workspace-editor-merge.md` lists as still unverified under
   _Remaining_ — this migration is the occasion to finally drive it.
10. Regression: `plan`, `diff`, `preview`, `terminal` surfaces all still open,
    activate, split, and close.

**Stage 3 gates:**

11. With a **pre-existing** `localStorage` entry containing a `file:` surface
    (capture one before the version bump), load the app. No empty panel, no
    orphan tab, no console error.
12. Full sweep of 6, 7, 8, 9, 10 again post-deletion.

### Viewports

Per `MARCO_STEERING.md`, **390px and 820px**, both mandatory, plus 1440px as the
baseline.

- **390px** — the blocking gate on Stage 4, and the open question from Q4. Check:
  the Code Editor pill item is reachable; the panel goes full-bleed; the file
  tree toggle works and the tree caps at 40% height; **the tab bar with 3+ tabs
  does not overflow the panel**; the status bar fits; Monaco accepts touch
  selection and the on-screen keyboard does not cover the caret.
- **820px** — between `MOBILE_BREAKPOINT` (640) and the right-panel sheet
  threshold (980), so the pill is in desktop mode while the right panel is in
  sheet mode. The most likely place for a layout collision, and the least likely
  to be checked by hand.
- **1440px** — baseline.

### Static gates

- `vp run --filter @t3tools/web typecheck` — must land at main's 2 known
  pre-existing errors (`Sidebar.logic.test.ts:870`,
  `environmentGrouping.test.ts:32`), no more.
- `vp test run` across `editor/`, `unifiedWorkspace/`, `diffFileActions.test.ts`,
  `rightPanelStore` tests.
- `vp lint` clean on touched files.
- Grep gate after Stage 3: no remaining reference to `FilePreviewPanel`,
  `FileBrowserPanel`, `openFileSurface`, `addFilesSurface`,
  `reconcileFileSurfaces`, or `rightPanelStore.openFile`.

## Unverified

Stated plainly, because none of it was checked against a running app:

- **Whether the pill is usable at 390px.** Statically it is reachable and has a
  purpose-built narrow layout (Q4). Nobody has driven it. Blocking gate on
  Stage 4.
  _Resolved since the first draft:_ `DiffPanel`'s `filePath` **cannot** carry a
  `:line` suffix. It comes from `resolveFileDiffPath()` (`lib/diffRendering.ts:127`)
  reading `FileDiffMetadata.name`/`prevName`, which `@pierre/diffs`
  (`types.d.ts:197`) documents as a unified-diff patch-header path. The diff format
  carries position in hunk headers (`@@ -a,b +c,d @@`), never in the path —
  `path:line:col` is a terminal-link convention, which is why
  `splitPathAndPosition` exists at all. No splitting needed at site C.

_Also resolved:_ the `workspace-file` asset **cannot** be
addressed without a thread — confirmed against
`packages/contracts/src/assets.ts:8-11` and `apps/server/src/assets/AssetAccess.ts:177-192`.
Image preview therefore ships behind the route-thread + matching-`cwd` gate
described in the capability table, not as a straight port.

- **Whether the `mentiko-void` Monaco theme is legible enough** to stand as the
  only file surface for a light-theme user. The divergence is an accepted
  decision (see the capability table); whether it is an acceptable one is a
  taste call nobody has made in front of a screen.
- **How the pill's Monaco behaves on a genuinely large file** below the 1MB cap —
  the right panel virtualizes (`Virtualizer`), Monaco does its own thing. Not a
  correctness risk, possibly a performance one.

## Adjacent findings, not fixed here

`DiffPanel.tsx:341-356` — when the branch-diff query against `activeCwd` fails
with a "configured workspace root" error, it retries against `serverConfig.cwd`
(`fallbackBranchDiffPreview`). In that fallback the rendered diff's paths are
relative to `serverConfig.cwd`, but `openDiffFile` still passes `activeCwd` as
the workspace path, so opening a file from a fallback diff resolves against the
wrong root.

### Writes with no preconditions — same root cause, own ticket

The write-path audit surfaced one further instance of "no precondition before
writing", pre-existing and out of scope here — plus one claim that turned out to
be false:

~~**`createFile` wipes an existing file.**~~ **Retracted — this was wrong.**
An earlier draft of this section claimed `createFile` had no existence check.
It does: `statExists` guards it and returns `WorkspacePathAlreadyExistsError`
(`WorkspaceFileSystem.ts:453-459`, covered by a test at `:388`). The original
read started mid-function and missed the guard. Recorded rather than quietly
deleted, because a confident false claim in a spec is worse than the bug it
described would have been.

- **Plan save can overwrite any path.** `PlanSidebar.tsx:104-116` and
  `ProposedPlanCard.tsx:53`, `:77-78` write generated markdown to a
  user-chosen path with no existence check. Neither can carry a truncated read —
  their contents come from thread plan state, not a file read — so neither is a
  P0 here.

Deliberately not folded into this migration: mixing an unrelated server-side
data-loss fix into a UI-surface change makes both harder to review and to
revert. Note the >1 MB write refusal added here does now cap the blast radius —
plan save can still overwrite an existing file, but no longer a large one.

### Write failures do not reach the user

The new oversized-write error explains why it refused, and that text never
arrives in the UI. `decodedProjectErrorMessage` only preserves a message when
the constructor props carry one, and none of the six `ProjectFileFailure` kinds
do — every one collapses to a generic `Failed to write workspace file 'X' in
'Y'`. Pre-existing and identical for the binary-file error today. Fixing it
means touching all six kinds, so it is its own change.

### `fallbackBranchDiffPreview` resolves against the wrong root

Pre-existing and unchanged by this migration — the retired right panel derived
its cwd from `activeWorkspaceRoot`, the same
`activeThreadWorktreePath ?? activeProjectCwd` expression, so it carried the
identical mismatch. Surfaced while migrating site C. Worth its own ticket.

## Not in scope

- **External file changes still are not noticed.** The status push covers writes
  made through the app; a shell-side edit needs Refresh. No file watcher exists.
  Carried over unchanged from `unified-workspace-editor-merge.md`.
- **`ChatMarkdown` as the pill's markdown renderer.** See the capability table.
- **Folder reveal in the pill's file tree.** See migration site B.
- **Drag-to-composer and mention actions in the pill's tree.** P2 gaps,
  acknowledged and not built.
- **The unified-workspace sidebar's own known gaps** — tracked in
  `.agents/skills/unified-workspace-sidebar/SKILL.md`, unaffected.
- **The two FilePreviewPanel-vs-shared-layer coordinator instances.**
  `FilePreviewPanel` builds its own `FileSaveCoordinator`
  (`FilePreviewPanel.tsx:311-326`) that is never registered in
  `projectFileState`'s `coordinators` registry (`projectFileState.ts:40`,
  `:189-196`), so a `flushProjectFile` from the pill cannot flush an edit made in
  the panel, and two debounce timers can race on one file. It is a real bug and
  this migration deletes it for free by deleting the second surface. Not worth
  fixing separately.
