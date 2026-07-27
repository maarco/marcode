# Unified workspace sidebar — editor tree parity

Status: implementation specification
Scope: `apps/web` unified workspace tree presentation and interaction
Visual oracle: `apps/web/src/editor/file-tree.tsx` in the floating Code editor
Behavior baseline: `docs/specs/unified-workspace-tree-sidebar.md`
Audit baseline: `df7d1654` on 2026-07-26

## 1. Directive

Make the unified workspace sidebar and the floating Code editor tree read as the same product
surface.

This is visual and interaction parity, not data-model parity. The unified tree still owns threads,
commands, terminals, browser tabs, attached paths, drag-and-drop, and project layout persistence.
The Code editor remains the reference for tree geometry, folder accordions, typography, icon color,
selection, active state, and density.

## 2. Invariant

One visible hierarchy level must create one indentation step.

A row must never receive both:

- indentation from nested accordion wrappers; and
- the full absolute `node.depth` indentation.

The Code editor uses nested folder panels. The unified tree therefore uses local row padding inside
those panels. Folder panel inset supplies the folder-to-child step. Non-folder containers receive
one explicit local child inset so their children remain visibly nested.

## 3. Audit findings

The commits from `3a2e26df` through `df7d1654` copied parts of the editor presentation but did not
produce parity:

1. `UnifiedWorkspaceTree.tsx` recursively nests folder content with `mx-1`.
2. `UnifiedWorkspaceTree.logic.ts` still applies the full absolute depth through
   `paddingInlineStart = calc(0.375rem + depth * var(--uw-tree-indent))`.
3. `UnifiedWorkspaceRow.tsx` adds an invisible disclosure spacer to file and other leaf rows even
   though the editor tree does not.
4. Folder wrappers have no editor-equivalent bounded height, vertical scrolling, or resize handle.
5. Folder rows omit the editor child count.
6. Folder icons omit `getFolderColor`; file rows use a generic outline icon instead of
   `FileTypeIcon`.
7. The unified tree labels the wrapper as an accordion, but only collapse state exists. The visible
   top-level folder panel behavior is incomplete.
8. Nested thread disclosure is conditional on child-thread presence while the renderer still shows
   live children. A collapsed thread can therefore hide live rows without exposing a disclosure
   control.

The visible result is double indentation, flat gray file/folder icon treatment, unbounded expanded
folders, and missing collapse affordances for some rendered subtrees.

## 4. Reference behavior

### 4.1 Rows

- height: `28px` desktop;
- typography: `11px` monospace;
- root padding: `8px`;
- item gap: `6px`;
- hover background: foreground at `4%`;
- selected background: foreground at `4%`;
- active background: foreground at `6%`;
- active label: foreground at `80%`;
- inactive label: foreground at `60%`;
- auxiliary count: `9px`, low-emphasis foreground;
- rounded corners: `4px` for items, `6px` for folder headers.

Touch targets may expand to `40px`; desktop geometry must not.

### 4.2 Icons

- folder: the Code editor's `FolderFilled` / `FolderOpenFilled`;
- folder color: `getFolderColor` using the displayed folder name;
- file: the Code editor's `FileTypeIcon`, using the final suffix without the leading dot;
- active file: retain the green active rail;
- thread and runtime resources: retain their existing semantic icons and truthful status colors;
- broken path: retain the warning icon and tooltip.

No leaf receives an empty disclosure spacer. A spacer exists only when it is necessary to align a
row with a visible sibling disclosure control in the same non-folder hierarchy.

### 4.3 Folder accordion

Every folder row toggles by clicking its row or pressing Enter.

An expanded root-level folder:

- renders its children in an inset panel;
- computes default maximum height as `clamp(directChildCount * 26px, 60px, 200px)`;
- scrolls vertically when content exceeds the current height;
- exposes a `6px` resize handle below the panel;
- allows pointer resizing down to `40px`;
- restores normal cursor and text selection on pointer release and component unmount.

Nested folders flow inside the root panel and do not create their own scroll container or resize
handle.

The resize handle must not start a row drag. Resizing must not mutate workspace layout.

### 4.4 Disclosure

- folders use the open/closed folder glyph as their accordion affordance; no extra chevron;
- a thread with any rendered children receives a chevron;
- other child-capable non-folder nodes receive a chevron;
- `aria-expanded` exists exactly when a visible disclosure action exists;
- Right expands or focuses the first child;
- Left collapses or focuses the parent;
- collapse state must match the visible subtree.

### 4.5 Child count

Folder count means direct visible/indexed children, not recursive descendants.

Ambient folders must expose their direct indexed child count before expansion. Persisted folders use
the larger of their materialized child count and indexed direct child count. Counts must not invent
children when the file index is truncated; truncation remains a diagnostic.

## 5. Geometry algorithm

The renderer carries `panelDepth`, separate from the data model's absolute `node.depth`.

- Root rows use `8px` inline start padding.
- Entering a folder accordion panel adds `4px` through the panel wrapper.
- Entering a non-folder child container adds one `14px` child inset.
- Rows inside a recursive folder panel do not additionally multiply by absolute `node.depth`.
- Branch guides use the same local geometry and never derive position from absolute depth.

The data model keeps absolute depth for ARIA level, move validation, and diagnostics. Presentation
must not use that absolute depth after recursive wrappers have already expressed hierarchy.

## 6. Component changes

### `apps/web/src/unifiedWorkspace/types.ts`

Add optional presentation fact:

```ts
directChildCount?: number;
```

It is derived from authoritative layout/index inputs and is never persisted.

### `apps/web/src/unifiedWorkspace/buildTree.ts`

- populate `directChildCount` for ambient folders from `ambientChildrenByParent`;
- populate it for persisted folders from indexed direct children plus placed children without
  double-counting the same path/resource.

### `apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.tsx`

- render folder accordions through one reusable root/nested panel path;
- own panel-height state keyed by node id;
- add the root-level resize handle;
- keep one DnD context and allow drags to cross folder scroll containers;
- render every visible child exactly once.

### `apps/web/src/components/unified-workspace/UnifiedWorkspaceRow.tsx`

- use shared Code editor folder colors and file-type icons;
- render folder child counts;
- remove unconditional leaf disclosure spacing;
- expose disclosure for every non-folder subtree that can actually collapse.

### `apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.styles.ts`

Define the row, panel, resize-handle, and local-child-inset recipes. Do not duplicate geometry in
`index.css`.

### Shared editor visuals

Folder colors and file-type icon resolution must have one implementation used by both the Code
editor and the unified sidebar. Do not fork the palette or extension mapping.

## 7. State and edge cases

- Ambient folder before first expansion: closed glyph, authoritative count, no materialized child
  rows.
- Empty folder: no false disclosure and count `0`.
- Broken folder: warning state wins over folder color; no fake disk children.
- Attached folder with ambient disk children: count each direct path once.
- Thread with only terminal/browser children: chevron remains visible because those rows are
  rendered and collapsible.
- Long labels: truncate without forcing the count or status metadata off-screen.
- Renaming: input replaces only the label and preserves icon/count geometry.
- Dragging: original row remains in place at reduced opacity; folder panel height does not jump.
- Mobile/coarse pointer: no resize handle; accordion still toggles; rows use `40px` targets.
- Reduced motion: no disclosure or hover transition duration.
- Light mode: semantic foreground/background states remain legible; folder/file accent colors retain
  sufficient contrast.

## 8. Focused verification

Run:

```bash
vp test run \
  apps/web/src/unifiedWorkspace/buildTree.test.ts \
  apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.logic.test.ts \
  apps/web/src/components/Sidebar.logic.test.ts
```

Run targeted formatting, lint, and the web package typecheck for the changed files/package only.

Integrated proof uses the `test-t3-app` skill in one isolated environment:

1. Open the unified sidebar and floating Code editor for the same project.
2. Compare root folders, nested folders, root files, nested files, long labels, and dot folders.
3. Expand and collapse folders by pointer, Enter, Left, and Right.
4. Resize a root folder panel and scroll it.
5. Drag a row within one folder and across two root folders.
6. Verify a thread with only live runtime children still exposes collapse.
7. Verify active file/thread, selected, hover, broken, loading, and running states.
8. Reload and confirm workspace placement remains intact.
9. Check dark and light themes at desktop, `820px`, and `390px`.

## 9. Acceptance gate

- indentation: no row is offset by both recursive panel inset and absolute depth;
- colors: folder and file icons match the Code editor's shared resolver;
- accordion: top-level folder panels collapse, scroll, and resize;
- disclosure: every collapsible visible subtree has an operable affordance;
- counts: folder counts are direct, truthful, and visible before expansion;
- accessibility: tree roles, levels, expanded state, roving focus, and keyboard behavior remain
  correct;
- DnD: reordering and cross-folder moves still work;
- responsive: no horizontal viewport overflow at `390px` or `820px`;
- data integrity: no duplicate nodes and no filesystem mutation from sidebar organization;
- scope: the editor and unified sidebar share visuals without changing unrelated right-panel,
  terminal, browser, or persistence behavior.
