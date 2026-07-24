# Unified Workspace Tree Sidebar

Status: implementation-ready proposal  
Scope: `apps/web` in browser and Electron, including the responsive sidebar sheet  
Baseline verified: `6f34ad3e87eba2ffba66cac5593dae8b680e5b84` on 2026-07-22  
Delivery model: three agents, three non-overlapping lanes, one primary-agent integration pass

## 1. Directive

Replace the project → flat thread list in the existing left sidebar with a unified workspace tree.
The tree must make threads, attached workspace files and folders, live terminals, live browser tabs,
URL shortcuts, and project commands feel like one navigable system without turning Marcode into a
Visual Studio Code clone.

The tree is navigation and organization. Existing chat, terminal, browser, file, diff, and plan
surfaces remain the content views. The right-panel tab system remains intact and is not copied into
the left sidebar.

## 2. Current source truth

The current capabilities are real but split across unrelated state owners:

- `apps/web/src/components/Sidebar.tsx`
  - renders projects and flat thread rows;
  - owns project expansion, thread navigation, thread context menus, archive/delete/rename, status
    indicators, project sorting, and the current project-only drag-and-drop context;
  - already exposes discovered-port and terminal status affordances on thread rows.
- `apps/web/src/components/Sidebar.logic.ts`
  - owns pure sorting, visibility, selection, navigation, and row-state helpers;
  - has the focused sidebar test seam in `Sidebar.logic.test.ts`.
- `apps/web/src/components/ui/sidebar.tsx`
  - owns the resizable/off-canvas shell and reusable row primitives;
  - current desktop row height is 28px for small rows.
- `apps/web/src/components/AppSidebarLayout.tsx`
  - mounts the existing sidebar shell;
  - persists width and enforces main-content minimum width.
- `apps/web/src/components/files/FileBrowserPanel.tsx`
  - already renders the project file index from `@pierre/trees`;
  - current file drag behavior creates composer mentions only and explicitly does not rearrange the
    physical filesystem.
- `apps/web/src/components/files/projectFilesQueryState.ts`
  - exposes the project entry list and file-read query atoms.
- `packages/contracts/src/project.ts`
  - defines each indexed project entry as `{ path, kind }`.
- `apps/server/src/workspace/WorkspaceFileSystem.ts`
  - owns safe workspace file read/write behavior and root-escape protection.
- `apps/web/src/rightPanelStore.ts`
  - persists per-thread content surfaces for browser, terminal, files, individual files, diff, and
    plan;
  - is the current source of ordering and activation for the content tabs.
- `apps/web/src/components/RightPanelTabs.tsx`
  - renders the content tab strip and opens browser, terminal, files, and diff surfaces.
- `apps/web/src/components/ChatView.tsx`
  - owns the runtime actions that activate right-panel surfaces, open terminals, run project
    scripts, and synchronize preview tabs.
- `apps/web/src/terminalUiStateStore.ts`
  - owns terminal drawer UI state.
- `apps/web/src/state/terminalSessions.ts`
  - exposes live terminal metadata and state by environment/thread.
- `packages/contracts/src/terminal.ts`
  - defines terminal snapshots with `threadId`, `terminalId`, `cwd`, `status`, `label`, and
    lifecycle metadata.
- `apps/web/src/previewStateStore.ts`
  - owns per-thread preview tabs and already exposes a cross-thread live preview index through
    `useActivePreviewSessions()`.
- `packages/contracts/src/preview.ts`
  - defines preview snapshots with `threadId`, `tabId`, navigation state, and timestamps.
- `apps/web/src/components/ProjectScriptsControl.tsx`
  - creates, updates, deletes, and runs project commands;
  - supports an optional preview URL and automatic preview opening.
- `packages/contracts/src/orchestration.ts`
  - defines the event-sourced project and thread contracts;
  - project shells currently contain `scripts` but no workspace layout.
- `apps/server/src/orchestration/decider.ts`, `projector.ts`, and `commandInvariants.ts`
  - validate commands, emit events, and reconstruct the orchestration read model.
- `apps/server/src/persistence/Services/ProjectionProjects.ts` and
  `apps/server/src/persistence/Layers/ProjectionProjects.ts`
  - persist the projected project shell, including scripts as JSON.

The implementation must integrate these sources. It must not create a second terminal registry,
browser registry, project-script registry, or file index.

## 3. Product rule

The clean rule is:

> The sidebar tree is a projection over persistent project layout plus authoritative live resource
> state. It stores placement and shortcuts, not copies of runtime objects or filesystem content.

Consequences:

- Adding a file or folder attaches a project-relative reference. It does not copy, move, rename, or
  delete anything on disk.
- Every unarchived thread in a project must appear exactly once, even if it has never been manually
  placed.
- Moving a thread under a file, folder, or another thread changes only sidebar placement.
- Live terminals and live browser tabs appear automatically under their owning thread.
- Closing a terminal or browser tab removes the live node. It does not leave stale persisted data.
- A browser tab can be converted into a durable URL shortcut through an explicit “Pin shortcut”
  action.
- Project commands use the existing `ProjectScript` source of truth. The layout stores only their
  placement.
- The right panel remains the viewer. Clicking a tree item activates the existing surface.

## 4. User-visible information architecture

Example:

```text
Project Alpha
├─ src/                                  attached folder reference
│  ├─ auth.ts                            attached file reference
│  │  └─ Fix token refresh               thread
│  │     ├─ pnpm test auth               terminal, live
│  │     └─ localhost:5173               browser tab, live
│  └─ Redesign authentication            thread
├─ Product brief.md                      attached file reference
│  └─ Turn brief into milestones         thread
├─ Run web                               project command
├─ Local app                             durable URL shortcut
└─ General investigation                 unplaced thread at project root
```

Rules:

- The project row stays the root and retains project status, environment, favicon, context menu,
  expand/collapse, and “new thread” affordances.
- A physical file may contain sidebar children. This is an organizational relationship; it does not
  imply that files are directories on disk.
- A thread may contain other threads and its live terminal/browser resources.
- Commands and URL shortcuts are leaves in v1.
- Terminal and browser nodes are leaves.
- The tree supports arbitrary thread/file/folder nesting subject to cycle prevention.
- The physical filesystem hierarchy is not expanded automatically. An attached folder is a shortcut
  node whose visible children are other attached/tree items, not every descendant on disk.
- Duplicate attachment of the same scoped project path is rejected. The existing node is focused
  instead.
- Cross-project drag-and-drop is rejected in v1.
- For a grouped logical project containing multiple physical projects/environments, each physical
  member retains its own persisted layout. Node IDs and targets remain environment- and
  project-scoped. A move across physical members is rejected with a clear explanation.

## 5. Scope

### Required

- Attach an indexed project file.
- Attach an indexed project folder.
- Add a URL shortcut with label and URL.
- Show every unarchived thread.
- Create a thread at project root.
- Create a thread as a child of a file, folder, or thread.
- Move/reorder persistent nodes with pointer, touch, and keyboard input.
- Provide a non-drag “Move to…” action for accessibility and mobile reliability.
- Show live terminals under the owning thread.
- Show live browser tabs under the owning thread.
- Show project commands and run them from the tree.
- Activate the existing file, chat, terminal, browser, and command flows from a tree row.
- Persist attachment, placement, ordering, labels, and shortcut data on the server.
- Synchronize tree changes through the existing orchestration project shell stream.
- Render missing file/folder references as broken references without silently deleting them.
- Preserve existing thread actions, statuses, selection, archive/delete confirmation, PR link, and
  discovered-port behavior.
- Preserve existing project grouping and manual project ordering.
- Preserve the responsive off-canvas sidebar at 390px and the constrained layout at 820px.

### Explicitly out of scope

- Replacing `RightPanelTabs`.
- Adding a Visual Studio Code-style activity rail, explorer header, editor tab system, breadcrumbs,
  or icon theme.
- Moving, renaming, creating, or deleting physical files through tree drag-and-drop.
- Persisting terminal output or browser DOM state in project layout.
- Cross-project or cross-environment moves.
- Full native `apps/mobile` tree parity in this release. Native mobile must continue decoding the
  expanded project shell and keep its current thread-only navigation without regression.
- Collaborative multi-cursor tree editing.
- Server-side filesystem watchers for automatic path rename repair.
- Hiding threads entirely. An unplaced thread falls back to the project root.

## 6. Persistent data model

Add schema-only definitions in `packages/contracts/src/projectWorkspace.ts` and export them through
`packages/contracts/src/index.ts`.

### 6.1 Identifiers and version

- `ProjectWorkspaceItemId`
  - branded trimmed non-empty string;
  - unique within one physical project layout;
  - generated with the existing UUID/ID convention for attachment and shortcut entries;
  - deterministic for resource references:
    - thread: `thread:<threadId>`;
    - command: `command:<scriptId>`.
- `ProjectWorkspaceLayoutVersion`
  - non-negative integer;
  - starts at `0`;
  - increments once per accepted layout command.
- `ProjectWorkspaceRank`
  - trimmed string rank used for stable sibling ordering;
  - generated through a pure helper in `@t3tools/shared/fractional-rank`;
  - compare lexically;
  - a compaction operation may rewrite ranks when no midpoint remains.

Do not use array index as durable order. Do not send the entire layout for a single move.

### 6.2 Persistent entry union

Every entry has:

```ts
{
  id: ProjectWorkspaceItemId;
  parentId: ProjectWorkspaceItemId | null;
  rank: ProjectWorkspaceRank;
}
```

Entry variants:

```ts
type ProjectWorkspaceEntry =
  | {
      kind: "file";
      id: ProjectWorkspaceItemId;
      parentId: ProjectWorkspaceItemId | null;
      rank: ProjectWorkspaceRank;
      relativePath: string;
      label?: string;
    }
  | {
      kind: "folder";
      id: ProjectWorkspaceItemId;
      parentId: ProjectWorkspaceItemId | null;
      rank: ProjectWorkspaceRank;
      relativePath: string;
      label?: string;
    }
  | {
      kind: "thread";
      id: ProjectWorkspaceItemId;
      parentId: ProjectWorkspaceItemId | null;
      rank: ProjectWorkspaceRank;
      threadId: ThreadId;
    }
  | {
      kind: "command";
      id: ProjectWorkspaceItemId;
      parentId: ProjectWorkspaceItemId | null;
      rank: ProjectWorkspaceRank;
      scriptId: string;
    }
  | {
      kind: "url";
      id: ProjectWorkspaceItemId;
      parentId: ProjectWorkspaceItemId | null;
      rank: ProjectWorkspaceRank;
      label: string;
      url: string;
    };
```

Project shell additions:

```ts
{
  workspaceLayoutVersion: ProjectWorkspaceLayoutVersion;
  workspaceLayout: ReadonlyArray<ProjectWorkspaceEntry>;
}
```

Backward compatibility:

- Both fields decode with defaults: `0` and `[]`.
- Old project events and old projection rows remain readable.
- New clients connected to an old server must degrade to the existing flat thread list.
- Native mobile must ignore layout presentation but successfully decode the project shell.

### 6.3 Synthetic and live nodes

The view model adds nodes that are not persisted:

- an unplaced unarchived thread becomes a synthetic root thread entry;
- a live terminal becomes `terminal:<environmentId>:<threadId>:<terminalId>`;
- a live browser tab becomes `browser:<environmentId>:<threadId>:<tabId>`;
- a script with no explicit command placement becomes a synthetic root command entry.

Persisted item IDs are project-local. The web view model must qualify every rendered key with
`environmentId` and `projectId` (for example
`node:<environmentId>:<projectId>:<projectWorkspaceItemId>`) before combining physical members into
one logical project display.

When a synthetic thread or command is first moved, the move command materializes its persistent
entry. Closing live terminal/browser resources does not mutate project layout.

Archived threads:

- do not render in the active tree;
- keep their persisted placement so unarchive restores it;
- cannot receive a drop while archived.

Deleted threads and deleted scripts:

- are pruned from the projected layout by server-side lifecycle handling;
- must also be ignored defensively by the client view-model builder.

### 6.4 Mutation command

Add one project-aggregate command:

```ts
type ProjectWorkspaceLayoutApplyCommand = {
  type: "project.workspace-layout.apply";
  commandId: CommandId;
  projectId: ProjectId;
  expectedVersion: ProjectWorkspaceLayoutVersion;
  operation:
    | { type: "attach-path"; entry: FileOrFolderEntry }
    | { type: "add-url"; entry: UrlEntry }
    | {
        type: "place-resource";
        resource: { kind: "thread"; threadId: ThreadId } | { kind: "command"; scriptId: string };
        parentId: ProjectWorkspaceItemId | null;
        beforeId: ProjectWorkspaceItemId | null;
      }
    | {
        type: "move";
        itemId: ProjectWorkspaceItemId;
        parentId: ProjectWorkspaceItemId | null;
        beforeId: ProjectWorkspaceItemId | null;
      }
    | { type: "rename"; itemId: ProjectWorkspaceItemId; label: string }
    | { type: "remove"; itemId: ProjectWorkspaceItemId };
};
```

Emit `project.workspace-layout-applied` with:

- `projectId`;
- normalized operation;
- new layout version;
- `updatedAt`.

Server invariants:

- project exists and is active;
- `expectedVersion` equals the current version;
- entry and parent belong to the same physical project;
- parent exists unless `null`;
- item cannot be its own parent;
- the new parent cannot be a descendant of the item;
- commands and URLs cannot be parents;
- live terminal/browser IDs are rejected because they are not persistent entries;
- file/folder paths are normalized, relative to `workspaceRoot`, and cannot escape it;
- attachment kind is restricted to file/folder, but the pure orchestration decider does not require
  the path to still exist; the attach dialog selects from the authoritative current index, and a
  path that disappears before or after persistence becomes a visible broken reference;
- duplicate scoped path attachment is rejected;
- referenced thread exists, is not deleted, and belongs to the project;
- referenced script exists;
- `beforeId`, when present, has the same resulting parent;
- removing a file/folder/URL attachment reparents its persistent children to the removed node’s
  parent while preserving order;
- removing a thread entry resets it to a synthetic root placement and does not delete the thread;
- removing a command entry resets it to a synthetic root placement and does not delete the script;
- version conflict returns a typed conflict response with current version; client refreshes and
  offers retry instead of guessing.

## 7. Derived web view model

Create `apps/web/src/unifiedWorkspace/` as the adapter boundary.

Required modules:

- `types.ts`
  - web-only `UnifiedWorkspaceNode`, node status, capabilities, activation target, and move target.
- `buildTree.ts`
  - pure deterministic merge of layout, project threads, scripts, terminal metadata, preview
    sessions, and indexed path health.
- `treeOperations.ts`
  - pure flattening, ancestry, cycle checks, drop resolution, before/after placement, and selection
    helpers.
- `useUnifiedWorkspaceProject.ts`
  - reads existing environment/project/thread/terminal/preview/file sources and returns the derived
    tree plus command callbacks.
- `activateNode.ts`
  - translates node activation into the existing navigation/right-panel operations.
- focused test files beside each pure module.

`UnifiedWorkspaceNode` must expose presentation-ready facts without importing React:

```ts
type UnifiedWorkspaceNode = {
  id: string;
  kind: "file" | "folder" | "thread" | "terminal" | "browser" | "command" | "url";
  label: string;
  parentId: string | null;
  depth: number;
  children: readonly UnifiedWorkspaceNode[];
  isLive: boolean;
  isBroken: boolean;
  canHaveChildren: boolean;
  canMove: boolean;
  canRename: boolean;
  canRemove: boolean;
  activation: UnifiedWorkspaceActivation;
  status: UnifiedWorkspaceStatus | null;
};
```

Ordering:

1. explicit persisted rank;
2. unplaced attached resources do not exist;
3. synthetic commands in script-array order;
4. synthetic threads by the user’s current thread sort setting;
5. live children by creation/update time and stable ID tie-breaker.

No object may render twice. The builder must emit diagnostics for:

- duplicate IDs;
- missing parents;
- cycles;
- invalid targets;
- stale thread/script entries.

Invalid persisted relationships fall back to root in the client, remain visible, and generate a
development log. The server remains responsible for preventing new invalid state.

## 8. Activation semantics

### Thread

- Navigate through the existing scoped thread route helper.
- Preserve multi-select behavior and current thread status/read tracking.

### File

- Resolve a thread context in this order:
  1. active thread when it belongs to the same physical project;
  2. most recently active descendant thread;
  3. existing project draft thread;
  4. new project draft thread through the existing new-thread flow.
- Navigate to that thread/draft context.
- Call `rightPanelStore.openFile(ref, relativePath)`.
- Never create a committed server thread merely because a file row was single-clicked.

### Folder

- Single click expands/collapses.
- Enter or the explicit “Open in Files” action resolves thread context using the file rule and opens
  the existing `files` surface.
- The existing full file explorer remains the place to browse physical descendants.

### Terminal

- Navigate to the owning thread.
- Call `rightPanelStore.openTerminal(ref, terminalId)`.
- Activate the terminal in the current terminal group when already present.
- A stale terminal node encountered during activation is removed by the next metadata reconciliation
  and produces a non-destructive toast.

### Browser tab

- Navigate to the owning thread.
- Call `rightPanelStore.openBrowser(ref, tabId)`.
- Call the existing `setActivePreviewTab`.
- Use title, host, URL, and favicon from the authoritative preview snapshot.

### URL shortcut

- Resolve thread context.
- Use the existing preview open command and right-panel browser surface.
- On web, where embedded preview is unavailable, expose “Open externally” and explain the runtime
  limitation.

### Command

- Resolve an active/descendant/draft thread context.
- Reuse the current `runProjectScript` behavior rather than duplicating terminal-open/write logic.
- The terminal created or reused by the command appears automatically as a live child.
- Preserve preview URL and `autoOpenPreview` behavior.

## 9. Creation and attachment flows

Replace the project-row single-purpose plus affordance with an “Add item” menu while preserving a
one-click new-thread option in the menu and keyboard shortcut.

Menu items:

- New thread
- Attach file
- Attach folder
- Add URL shortcut
- Add command

Context-sensitive creation:

- Invoking from project root creates at root.
- Invoking from a file, folder, or thread creates under that node.
- Invoking from a leaf command, URL, terminal, or browser uses that node’s parent.

Attach file/folder:

- Reuse `projectEnvironment.listEntries`.
- Provide search over normalized project-relative paths.
- Filter by requested kind.
- Do not expose paths outside `workspaceRoot`.
- Submit `attach-path` with the current layout version.
- On duplicate, focus and reveal the existing node.

New thread for file/folder/thread:

- Seed the draft/new-thread flow with the target placement.
- Materialize the thread placement when the thread ID is available.
- If the user abandons an empty draft, remove the uncommitted placement.
- The first message and placement must not race into two visible thread nodes.

Add command:

- Reuse the existing `ProjectScriptsControl` editor.
- After successful script creation, submit `place-resource` for the new script.
- If placement fails after script creation, show the command at project root and report the placement
  error. Do not delete the newly created script.

## 10. Drag-and-drop and keyboard behavior

Use one project-local `DndContext` for tree items. Do not nest it inside the existing project-sort
context. Project sorting remains the outer concern; tree dragging is enabled only after the pointer
begins on a tree row/handle inside an expanded project.

Sensors:

- pointer sensor with a small distance activation constraint to preserve clicks and text selection;
- touch sensor with press delay and movement tolerance;
- keyboard sensor using sortable keyboard coordinates.

Drop zones:

- top quarter: before target;
- middle half: inside target when it can have children;
- bottom quarter: after target;
- leaf middle falls back to after target;
- root gutter accepts root placement.

During drag:

- collapse nothing automatically;
- auto-expand a collapsed valid container after 600ms hover;
- auto-scroll the existing sidebar scroll area near its top/bottom edge;
- show one insertion line or one inside-target highlight, never both;
- keep the original row visible at reduced opacity;
- use a compact drag overlay with icon and truncated label;
- announce source, target, and result through an ARIA live region.

Rejected drops:

- descendant cycle;
- cross-project/environment;
- into command, URL, terminal, or browser;
- archived/deleted/missing target;
- stale version after server response.

Keyboard:

- Up/Down: previous/next visible tree item.
- Right: expand, or move focus to first child when already expanded.
- Left: collapse, or move focus to parent when already collapsed.
- Home/End: first/last visible item.
- Enter: activate.
- Space: select for movement/multi-select where applicable.
- F2: rename eligible item.
- Delete/Backspace: open the correct confirmation/removal flow; never delete a physical file.
- Context-menu key/Shift+F10: open row menu.
- Move mode: Mod+Shift+Arrow or the “Move to…” dialog; exact binding must be added to the keybinding
  contract only if it does not collide with current commands.

## 11. Context menus

Common:

- Open
- Move to…
- New child thread, when container
- Rename, when eligible
- Remove from sidebar, when eligible

File/folder:

- Open in Files
- Copy relative path
- Add to chat
- Reveal in system file manager when desktop bridge supports it
- Remove from sidebar

Thread:

- preserve current mark unread, rename, archive, delete, copy ID, PR, and worktree actions;
- add Move to… and New child thread.

Terminal:

- Open
- Rename through existing terminal behavior if supported
- Close terminal

Browser:

- Open
- Pin shortcut
- Copy URL
- Open externally
- Close tab

Command:

- Run
- Edit command
- Move to…
- Remove from sidebar
- Delete command remains a separate destructive action with the existing confirmation.

URL:

- Open
- Edit shortcut
- Move to…
- Remove from sidebar

“Remove from sidebar” must never masquerade as deleting the underlying file, thread, terminal,
browser tab, or command.

## 12. Visual and CSS specification

### 12.1 Direction

The sidebar must remain Marcode’s current flat, neutral, compact system:

- no activity rail;
- no editor-style tab chrome;
- no boxed icon tiles;
- no bright type-color rainbow;
- no connector-line forest at every level;
- no permanent drag handles;
- no new color palette.

Use existing semantic tokens from `apps/web/src/index.css`: `background`, `foreground`, `accent`,
`muted-foreground`, `border`, `ring`, `destructive`, `warning`, `success`, and `info`.

### 12.2 Component files

- Keep reusable row class recipes in
  `apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.styles.ts`.
- Add only geometry/pseudo-element rules that Tailwind cannot express cleanly to
  `apps/web/src/index.css`, under a named `@layer components` section.
- Do not add a new global theme or redefine the root palette.
- Continue using `surface-grain` and the current floating sidebar shell.

### 12.3 CSS variables

Add under `[data-unified-workspace-tree]`:

```css
--uw-tree-row-height: 1.75rem;
--uw-tree-row-height-touch: 2.5rem;
--uw-tree-indent: 0.875rem;
--uw-tree-icon-size: 0.875rem;
--uw-tree-guide-color: color-mix(in srgb, var(--border) 70%, transparent);
--uw-tree-drop-color: var(--ring);
```

At coarse pointer/mobile widths, use `--uw-tree-row-height-touch`.

### 12.4 Exact row recipes

Tree:

```text
relative flex min-w-0 flex-col gap-0.5
```

Row:

```text
group/workspace-row relative isolate flex h-7 min-w-0 cursor-default select-none
items-center gap-1.5 rounded-md pr-1.5 text-xs text-foreground outline-none
transition-colors duration-150 hover:bg-accent
focus-visible:ring-1 focus-visible:ring-ring
data-[active=true]:bg-accent data-[active=true]:font-medium
data-[selected=true]:bg-accent/80
data-[broken=true]:text-muted-foreground
max-sm:h-10 max-sm:text-sm
```

Indent:

```ts
paddingInlineStart = `calc(0.375rem + ${depth} * var(--uw-tree-indent))`;
```

Disclosure:

```text
inline-flex size-4 shrink-0 items-center justify-center rounded-sm
text-muted-foreground transition-transform duration-150
hover:bg-accent hover:text-foreground
```

Use an invisible `size-4` spacer for leaves so labels align.

Primary icon:

```text
size-3.5 shrink-0 text-muted-foreground
group-data-[active=true]/workspace-row:text-foreground
```

Label:

```text
min-w-0 flex-1 truncate text-left
```

Metadata/status:

```text
ml-auto flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground
```

Hover actions:

```text
pointer-events-none absolute right-1 flex items-center gap-0.5 opacity-0
transition-opacity duration-150
group-hover/workspace-row:pointer-events-auto group-hover/workspace-row:opacity-100
group-focus-within/workspace-row:pointer-events-auto group-focus-within/workspace-row:opacity-100
max-sm:pointer-events-auto max-sm:opacity-100
```

Drop-before/after line:

```text
pointer-events-none absolute inset-x-1 h-px bg-ring
before:absolute before:-left-0.5 before:-top-0.5 before:size-1
before:rounded-full before:bg-ring
```

Drop-inside:

```text
bg-accent ring-1 ring-ring
```

Drag overlay:

```text
flex max-w-64 items-center gap-1.5 rounded-md border border-border/60
bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-lg
```

Broken path:

- use `TriangleAlertIcon` at `size-3.5 text-warning-foreground`;
- keep label readable;
- tooltip: `Path not found: <relativePath>`;
- no strikethrough because it reads as deleted rather than unresolved.

Live status:

- terminal status reuses `terminalStatusFromRunningIds` and current pulse behavior;
- thread status reuses `ThreadStatusLabel`;
- browser loading uses the existing loading state, not a second animation language.

Icons:

- folder: `FolderIcon`;
- file: `FileIcon` or existing file-type icon helper when available;
- thread: `MessageSquareIcon`;
- terminal: `TerminalIcon`;
- browser/URL: favicon when valid, otherwise `Globe2Icon`;
- command: existing project script icon mapping;
- broken: `TriangleAlertIcon`.

### 12.5 Connector policy

- Render a single subtle guide only for the currently hovered/focused branch or active branch.
- Do not draw permanent guides for the entire tree.
- The guide is 1px using `--uw-tree-guide-color`.
- A depth greater than six does not increase visual contrast or icon size.

### 12.6 Motion and accessibility

- expand/collapse and disclosure rotation: 150ms;
- drag overlay and insertion state: no spring/bounce;
- existing list auto-animation may remain only if it does not fight DnD transforms;
- under `prefers-reduced-motion: reduce`, set tree transition and animation duration to `0ms`;
- focus cannot depend on color alone;
- active, selected, live, broken, and drop states must remain distinguishable in light and dark mode;
- every icon-only action requires an accessible label and tooltip.

## 13. File change inventory

This is the expected implementation surface at the verified baseline. If a named file moves during
upstream integration, preserve the ownership boundary and update the spec before coding.

### New contracts and client-runtime files

- `packages/contracts/src/projectWorkspace.ts`
- `packages/contracts/src/projectWorkspace.test.ts`
- `packages/shared/src/fractionalRank.ts`
- `packages/shared/src/fractionalRank.test.ts`
- `packages/client-runtime/src/operations/projectWorkspace.ts`
- `packages/client-runtime/src/operations/projectWorkspace.test.ts`
- `packages/client-runtime/src/state/projectWorkspace.ts`
- `packages/client-runtime/src/state/projectWorkspace.test.ts`

### Existing contracts/client-runtime files

- `packages/contracts/src/index.ts`
- `packages/contracts/src/orchestration.ts`
- `packages/contracts/src/orchestration.test.ts`
- `packages/shared/package.json`
- `packages/client-runtime/package.json`
- `packages/client-runtime/src/operations/index.ts`
- `packages/client-runtime/src/state/projectCommands.ts`
- `packages/client-runtime/src/state/models.ts`
- `packages/client-runtime/src/state/projects.ts`

### Server orchestration and persistence

- `apps/server/src/orchestration/decider.ts`
- `apps/server/src/orchestration/projector.ts`
- `apps/server/src/orchestration/commandInvariants.ts`
- `apps/server/src/orchestration/Normalizer.ts`
- focused tests beside all four files
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts`
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- focused tests for shell snapshot/stream propagation
- `apps/server/src/persistence/Services/ProjectionProjects.ts`
- `apps/server/src/persistence/Layers/ProjectionProjects.ts`
- `apps/server/src/persistence/Layers/ProjectionRepositories.test.ts`
- `apps/server/src/persistence/Migrations/033_ProjectWorkspaceLayout.ts`
- `apps/server/src/persistence/Migrations/033_ProjectWorkspaceLayout.test.ts`
- `apps/server/src/persistence/Migrations.ts`

Migration number `033` is correct at this baseline. Use the next free number at implementation time
if upstream adds another migration first.

### New web model/controller files

- `apps/web/src/unifiedWorkspace/types.ts`
- `apps/web/src/unifiedWorkspace/buildTree.ts`
- `apps/web/src/unifiedWorkspace/buildTree.test.ts`
- `apps/web/src/unifiedWorkspace/treeOperations.ts`
- `apps/web/src/unifiedWorkspace/treeOperations.test.ts`
- `apps/web/src/unifiedWorkspace/activateNode.ts`
- `apps/web/src/unifiedWorkspace/activateNode.test.ts`
- `apps/web/src/unifiedWorkspace/useUnifiedWorkspaceProject.ts`

### New web presentation files

- `apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.tsx`
- `apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.logic.ts`
- `apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.logic.test.ts`
- `apps/web/src/components/unified-workspace/UnifiedWorkspaceRow.tsx`
- `apps/web/src/components/unified-workspace/UnifiedWorkspaceAddMenu.tsx`
- `apps/web/src/components/unified-workspace/UnifiedWorkspaceMoveDialog.tsx`
- `apps/web/src/components/unified-workspace/UnifiedWorkspaceAttachDialog.tsx`
- `apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.styles.ts`

### Existing web integration files

- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/Sidebar.logic.test.ts`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/RightPanelTabs.tsx`
- `apps/web/src/rightPanelStore.ts`
- `apps/web/src/rightPanelStore.test.ts`
- `apps/web/src/components/ProjectScriptsControl.tsx`
- `apps/web/src/hooks/useHandleNewThread.ts`
- `apps/web/src/previewStateStore.ts`
- `apps/web/src/state/terminalSessions.ts`
- `apps/web/src/index.css`

`apps/web/src/components/ui/sidebar.tsx` should change only if a missing generic accessibility hook
cannot live in the unified-tree component. Do not put product-specific tree logic into the generic
sidebar primitives.

### Documentation

- `docs/user/unified-workspace-sidebar.md`
- `docs/reference/project-workspace-layout.md` — corrected during interface freeze.
  `docs/reference/workspace-layout.md` already exists and documents the monorepo package layout;
  reusing that filename would have destroyed an unrelated document.
- `docs/architecture/overview.md`

## 14. Three-agent execution plan

The primary agent owns interface freeze, integration, live verification, and final scope review.
Agents work in separate branches/worktrees and do not start independent dev servers.

### Agent 1 — contracts, event model, and persistence

Owns:

- `packages/contracts/**` changes listed above;
- `packages/shared/src/fractionalRank*` and the explicit package export;
- `packages/client-runtime/src/operations/projectWorkspace*`;
- `packages/client-runtime/src/state/projectCommands.ts`;
- all listed `apps/server` orchestration, persistence, migration, and focused tests.

Deliverables:

- schema and command/event union;
- backward-compatible project shell;
- expected-version concurrency;
- invariant validation and rank normalization;
- projection persistence and migration;
- shell snapshot/stream propagation;
- focused server/contract tests.

Must not edit:

- `apps/web/src/components/**`;
- `apps/web/src/unifiedWorkspace/**`;
- `apps/web/src/index.css`.

Handoff contract:

- exports exact public type/function names before Agent 2/3 integration;
- provides one fixture containing a file, folder, nested thread, command, and URL;
- provides typed error tags for version conflict, cycle, missing target, duplicate path, and
  cross-project placement.

### Agent 2 — tree presentation, DnD, keyboard, and CSS

Owns:

- `apps/web/src/components/unified-workspace/**`;
- tree-specific additions to `apps/web/src/index.css`;
- the narrow replacement seam inside `Sidebar.tsx`;
- presentation-focused additions to `Sidebar.logic.ts` and its focused tests.

Deliverables:

- accessible tree renderer;
- pointer/touch/keyboard movement;
- row menus, attach/move dialogs, drag overlay, drop indicators, focus management;
- exact visual rules in section 12;
- preservation of project header/grouping/sorting behavior;
- component/pure-logic tests.

Must not edit:

- contracts;
- server/persistence;
- `ChatView.tsx`, `rightPanelStore.ts`, preview or terminal state.

Handoff contract:

- component consumes `UnifiedWorkspaceNode[]` and callback props only;
- no direct server/RPC calls;
- story/test fixture covers every node kind and state.

### Agent 3 — runtime projection and activation adapters

Owns:

- `apps/web/src/unifiedWorkspace/**`;
- `ChatView.tsx`;
- `rightPanelStore.ts` and its focused tests;
- `ProjectScriptsControl.tsx`;
- `useHandleNewThread.ts`;
- only the minimal preview/terminal selector additions required for project-wide projection.

Deliverables:

- pure tree builder;
- live terminal/browser projection;
- file/folder health projection;
- node activation;
- thread-context resolution for file/folder/URL/command actions;
- placement-aware thread creation;
- existing command runner reuse;
- focused adapter/store tests.

Must not edit:

- server/persistence/contracts;
- unified-tree JSX/CSS;
- generic sidebar primitives.

Handoff contract:

- exposes one hook/controller consumed by Agent 2;
- proves one source of truth for terminal, preview, file index, and project scripts;
- no duplicated session persistence.

### Integration order

1. Primary agent freezes the contract names in section 6.
2. Agent 1 lands.
3. Agent 3 rebases and connects to the real contract.
4. Agent 2 rebases and connects to Agent 3’s controller.
5. Primary agent resolves only true integration seams.
6. Primary agent runs focused tests and one integrated web verification environment.
7. Primary agent checks native mobile decoding/type safety without implementing native parity.

## 15. Focused verification

Follow root `AGENTS.md`: do not run the full workspace suite locally.

### Agent 1

Run the exact changed test files with `vp test run`:

- contract schema tests;
- client operation/state tests;
- decider/invariant/projector tests;
- projection repository tests;
- migration test;
- shell snapshot/stream test.

Run targeted typecheck for:

- `@t3tools/contracts`;
- `@t3tools/client-runtime`;
- server package.

### Agent 2

Run:

- unified tree logic/component tests;
- `Sidebar.logic.test.ts`;
- targeted web typecheck and formatting for owned files.

### Agent 3

Run:

- `buildTree.test.ts`;
- `treeOperations.test.ts`;
- `activateNode.test.ts`;
- `rightPanelStore.test.ts`;
- focused preview/terminal selector tests if changed;
- targeted web typecheck and formatting for owned files.

### Primary integrated proof

Use the `test-t3-app` skill after all three lanes are integrated:

- launch one isolated environment;
- authenticate through the printed pairing URL;
- use a temporary test project containing at least two files and two folders;
- verify light and dark mode;
- verify 390px, 820px, and desktop width;
- stop all launched servers/watchers after verification.

Required live flow:

1. add project;
2. attach file and folder;
3. create root thread;
4. create thread for attached file;
5. drag root thread under folder;
6. move it again through “Move to…”;
7. open file from tree and observe existing right-panel file surface;
8. open terminal and observe the live terminal node;
9. run a command and observe terminal activation;
10. open two browser tabs and observe both live browser nodes;
11. pin one browser tab as URL shortcut;
12. close terminal/browser and observe live nodes disappear;
13. reload and observe persistent placement/shortcuts restored;
14. archive/unarchive thread and observe placement restored;
15. remove attached file and prove the disk file remains;
16. simulate a deleted disk path and observe broken-reference UI;
17. attempt a cycle and cross-project drop and observe rejection;
18. reconnect a second client and observe layout stream synchronization.

## 16. Acceptance criteria

### Data integrity

- No thread renders more than once.
- No terminal/browser state is persisted in project layout.
- No sidebar action moves or deletes a physical file.
- Version conflicts do not overwrite a newer layout.
- Cycles and cross-project placements are rejected server-side.
- Old projects decode with an empty layout.
- Old events replay successfully.
- Project projection migration preserves title, workspace root, model selection, scripts, and
  deletion state.

### UX

- Every required node kind is visible and activatable.
- New terminal/browser resources appear without sidebar reload.
- Closed live resources disappear without stale nodes.
- File/folder/thread nesting survives reload.
- Root fallback keeps every unarchived thread visible.
- Pointer, touch, keyboard, and “Move to…” can complete the same move.
- Active, selected, live, broken, and drop states are visually distinct in both themes.
- 390px and 820px have no horizontal viewport overflow.
- Long labels truncate and remain available through tooltip/accessibility text.
- The result does not resemble a transplanted editor explorer or tab system.

### Regression

- Existing project manual sorting still works.
- Existing project grouping still works across environments.
- Existing thread rename/archive/delete/selection/context-menu flows still work.
- Existing PR, worktree, status, terminal, and discovered-port indicators still work.
- Existing right-panel tabs still open, activate, close, and persist.
- Existing file explorer drag-to-composer still works.
- Existing project-script edit/run/preview behavior still works.
- Native mobile thread navigation still decodes and renders.

## 17. Rollout

- Ship behind a client setting/feature flag: `unifiedWorkspaceSidebar`.
- Default on after the integration cycle; an explicit `false` remains the flat-sidebar opt-out.
- When off, render the current flat thread list.
- When on and server lacks layout command capability, render a read-only derived tree with root
  threads/commands/live resources and disable attachment/movement with an explicit upgrade message.
- Record only non-content diagnostics: mutation result tag, node kind, depth, latency, version
  conflict count. Never log file content, terminal output, chat text, or full URLs.
- Remove the flag only after live verification and one release cycle without layout corruption.

## 18. Completion gate

The implementing primary agent may claim completion only with:

- surfaces: exact project/sidebar/right-panel/native decode surfaces listed as verified or
  unverified;
- live proof: isolated environment URL/session and observed flow results;
- responsive proof: 390px and 820px screenshots plus desktop;
- sibling sweep: project grouping, archived threads, drafts, live resources, commands, missing
  paths, old server, and native decode;
- regressions: exact focused commands and counts;
- truthfulness: no decorative live state and no duplicated registries;
- copy: consistent “New thread”, “Attach file”, “Attach folder”, “Add URL shortcut”, “Add command”,
  “Move to…”, and “Remove from sidebar” labels;
- scope: only intended files changed and all unrelated dirty-tree work preserved;
- unverified: every remaining runtime, platform, or release gap named plainly.
