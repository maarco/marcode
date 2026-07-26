/**
 * Shared tree recipes. The state selectors remain the unified-tree contract;
 * the typography, density, and active treatment deliberately borrow the
 * floating editor's file-tree register so both surfaces read as one explorer.
 */

export const UW_TREE_ROOT_CLASS = "relative flex min-w-0 flex-col gap-0.5 font-mono";

// Row/touch-row height read from `--uw-tree-row-height(-touch)` (§12.3) rather
// than hardcoded `h-7`/`max-sm:h-10` — same computed values (1.75rem/2.5rem),
// but the coarse-pointer/mobile override now flows through the CSS variable
// defined once in index.css instead of being duplicated as a literal here.
export const UW_TREE_ROW_CLASS =
  "group/workspace-row relative isolate flex h-[var(--uw-tree-row-height)] min-w-0 cursor-default select-none " +
  "items-center gap-1.5 rounded-sm pr-1.5 text-[11px] font-mono text-foreground/70 outline-none " +
  "transition-colors duration-150 hover:bg-foreground/[0.03] " +
  "focus-visible:ring-1 focus-visible:ring-ring " +
  "data-[active=true]:bg-foreground/[0.06] data-[active=true]:font-medium " +
  "data-[active=true]:text-foreground/80 " +
  "data-[selected=true]:bg-foreground/[0.04] " +
  "data-[broken=true]:text-muted-foreground " +
  "max-sm:h-[var(--uw-tree-row-height-touch)] max-sm:text-sm pointer-coarse:h-[var(--uw-tree-row-height-touch)]";

export const UW_TREE_ACTIVE_RAIL_CLASS =
  "data-[active=true]:after:pointer-events-none data-[active=true]:after:absolute " +
  "data-[active=true]:after:inset-y-1.5 data-[active=true]:after:left-0.5 " +
  "data-[active=true]:after:w-0.5 data-[active=true]:after:rounded-r " +
  "data-[active=true]:after:bg-emerald-400/60";

/** Folder header/content wrappers borrowed from the floating editor's
 * AccordionFolder. The unified tree keeps one owner for scrolling, so the
 * nested panel gets the editor's inset/overflow treatment without adding a
 * competing per-folder resize or scroll container. */
export const UW_TREE_ACCORDION_FOLDER_CLASS = "relative mb-0.5 min-w-0";

export const UW_TREE_ACCORDION_CONTENT_CLASS = "mx-1 mt-0.5 min-w-0 overflow-x-hidden rounded-t-md";

export const UW_TREE_DISCLOSURE_CLASS =
  "inline-flex size-4 shrink-0 items-center justify-center rounded-sm " +
  "text-muted-foreground transition-transform duration-150 " +
  "hover:bg-accent hover:text-foreground";

/** Invisible size-4 spacer for leaves so labels still align with containers. */
export const UW_TREE_DISCLOSURE_SPACER_CLASS = "inline-block size-4 shrink-0";

export const UW_TREE_ICON_CLASS = "size-[var(--uw-tree-icon-size)] shrink-0 text-muted-foreground";

export const UW_TREE_ACTIVE_ICON_CLASS = "group-data-[active=true]/workspace-row:text-foreground";

export const UW_TREE_LABEL_CLASS = "min-w-0 flex-1 truncate text-left font-mono text-[11px]";

export const UW_TREE_META_CLASS =
  "ml-auto flex shrink-0 items-center gap-1 font-mono text-[9px] text-muted-foreground";

export const UW_TREE_HOVER_ACTIONS_CLASS =
  "pointer-events-none absolute right-1 flex items-center gap-0.5 opacity-0 " +
  "transition-opacity duration-150 " +
  "group-hover/workspace-row:pointer-events-auto group-hover/workspace-row:opacity-100 " +
  "group-focus-within/workspace-row:pointer-events-auto group-focus-within/workspace-row:opacity-100 " +
  "max-sm:pointer-events-auto max-sm:opacity-100";

/** Drop-before/after insertion line. Color reads `--uw-tree-drop-color` (§12.3)
 * rather than the raw `ring` token, so the drop indication has one variable
 * indirection point distinct from focus-ring usage elsewhere in the row. */
export const UW_TREE_DROP_LINE_CLASS =
  "pointer-events-none absolute inset-x-1 h-px bg-[var(--uw-tree-drop-color)] " +
  "before:absolute before:-left-0.5 before:-top-0.5 before:size-1 " +
  "before:rounded-full before:bg-[var(--uw-tree-drop-color)]";

export const UW_TREE_DROP_INSIDE_CLASS = "bg-accent ring-1 ring-[var(--uw-tree-drop-color)]";

/**
 * Single subtle branch guide (§12.5): a 1px vertical line at the row's own
 * indent slot (roughly the disclosure column one level up), shown only while
 * the row is hovered, keyboard-focused, or active — never a permanent guide
 * for the whole tree. Depth is threaded in per-row via the `--uw-row-depth`
 * custom property (see `unifiedWorkspaceRowIndentStyle`); callers only apply
 * this class when `node.depth > 0` (a root has no ancestor branch to show).
 */
export const UW_TREE_GUIDE_CLASS =
  "before:pointer-events-none before:absolute before:inset-y-0 before:w-px before:content-[''] " +
  "before:bg-[var(--uw-tree-guide-color)] before:opacity-0 before:transition-opacity before:duration-150 " +
  "before:left-[calc(0.375rem+(var(--uw-row-depth)-1)*var(--uw-tree-indent)+0.4375rem)] " +
  "hover:before:opacity-100 focus-visible:before:opacity-100 data-[active=true]:before:opacity-100";

export const UW_TREE_DRAG_OVERLAY_CLASS =
  "flex max-w-64 items-center gap-1.5 rounded-md border border-border/60 " +
  "bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-lg";

/** Root gutter drop strip: a full-width band beneath the tree that accepts root placement. */
export const UW_TREE_ROOT_GUTTER_CLASS =
  "relative h-3 min-w-0 shrink-0 rounded-md transition-colors duration-150 " +
  "data-[drop-active=true]:bg-accent data-[drop-active=true]:ring-1 data-[drop-active=true]:ring-[var(--uw-tree-drop-color)]";
