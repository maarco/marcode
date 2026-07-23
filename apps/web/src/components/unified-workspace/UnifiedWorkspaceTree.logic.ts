import type { ContextMenuItem } from "@t3tools/contracts";
import type { UnifiedWorkspaceNode } from "../../unifiedWorkspace/types";

/**
 * Pure presentation logic for the unified workspace tree: visibility
 * flattening, keyboard navigation targets, and pointer-position-based drop
 * zone resolution. Nothing here imports React or touches a store — it is
 * driven entirely by the frozen `UnifiedWorkspaceNode` shape handed down from
 * the controller, so it is directly unit-testable with plain fixtures.
 *
 * Cycle/ancestry checks live here too (not imported from
 * `unifiedWorkspace/treeOperations.ts`): that module's exact exports were not
 * frozen at implementation time, and this component's handoff contract
 * requires it to work from `UnifiedWorkspaceNode[]` alone. The checks here
 * are only used for optimistic drag-over UI (which drop zones to visually
 * allow) — `controller.moveNode` and the server remain the source of truth
 * for whether a move is actually legal.
 */

export interface FlatUnifiedWorkspaceRow {
  readonly node: UnifiedWorkspaceNode;
  /** Index within the flattened, currently-visible row list. */
  readonly index: number;
}

/**
 * Depth-first flatten of every node currently visible given a set of
 * collapsed container ids. A node's own row is always visible; only its
 * children are hidden while it is collapsed. New/unknown ids default to
 * expanded (nothing is in `collapsedIds`), matching the old flat thread list
 * where every thread was always visible.
 */
export function flattenVisibleUnifiedWorkspaceNodes(
  roots: readonly UnifiedWorkspaceNode[],
  collapsedIds: ReadonlySet<string>,
): FlatUnifiedWorkspaceRow[] {
  const rows: FlatUnifiedWorkspaceRow[] = [];

  const walk = (nodes: readonly UnifiedWorkspaceNode[]) => {
    for (const node of nodes) {
      rows.push({ node, index: rows.length });
      if (node.canHaveChildren && node.children.length > 0 && !collapsedIds.has(node.id)) {
        walk(node.children);
      }
    }
  };

  walk(roots);
  return rows;
}

export function isUnifiedWorkspaceNodeCollapsed(
  node: Pick<UnifiedWorkspaceNode, "id" | "canHaveChildren">,
  collapsedIds: ReadonlySet<string>,
): boolean {
  return node.canHaveChildren && collapsedIds.has(node.id);
}

// ── Node index (id → node, parent → ordered children) ──────────────────────

export interface UnifiedWorkspaceNodeIndex {
  readonly byId: ReadonlyMap<string, UnifiedWorkspaceNode>;
  readonly siblingsByParentId: ReadonlyMap<string | null, readonly UnifiedWorkspaceNode[]>;
}

export function buildUnifiedWorkspaceNodeIndex(
  roots: readonly UnifiedWorkspaceNode[],
): UnifiedWorkspaceNodeIndex {
  const byId = new Map<string, UnifiedWorkspaceNode>();
  const siblingsByParentId = new Map<string | null, UnifiedWorkspaceNode[]>();
  siblingsByParentId.set(null, [...roots]);

  const walk = (nodes: readonly UnifiedWorkspaceNode[]) => {
    for (const node of nodes) {
      byId.set(node.id, node);
      if (node.children.length > 0) {
        siblingsByParentId.set(node.id, [...node.children]);
        walk(node.children);
      }
    }
  };
  walk(roots);

  return { byId, siblingsByParentId };
}

/** True when `nodeId` is `ancestorId` itself or a descendant of it. */
export function isNodeSelfOrDescendant(
  index: UnifiedWorkspaceNodeIndex,
  ancestorId: string,
  nodeId: string,
): boolean {
  let current: UnifiedWorkspaceNode | undefined = index.byId.get(nodeId);
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parentId !== null ? index.byId.get(current.parentId) : undefined;
  }
  return false;
}

// ── Keyboard navigation ─────────────────────────────────────────────────────

export type UnifiedWorkspaceVerticalDirection = "next" | "previous";

export function resolveVerticalMoveTarget(
  flatRows: readonly FlatUnifiedWorkspaceRow[],
  currentNodeId: string | null,
  direction: UnifiedWorkspaceVerticalDirection,
): string | null {
  if (flatRows.length === 0) return null;
  const currentIndex = currentNodeId
    ? flatRows.findIndex((row) => row.node.id === currentNodeId)
    : -1;

  if (currentIndex === -1) {
    return direction === "next"
      ? (flatRows[0]?.node.id ?? null)
      : (flatRows.at(-1)?.node.id ?? null);
  }

  const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= flatRows.length) return currentNodeId;
  return flatRows[nextIndex]?.node.id ?? currentNodeId;
}

export function resolveEdgeMoveTarget(
  flatRows: readonly FlatUnifiedWorkspaceRow[],
  edge: "home" | "end",
): string | null {
  if (flatRows.length === 0) return null;
  return edge === "home" ? (flatRows[0]?.node.id ?? null) : (flatRows.at(-1)?.node.id ?? null);
}

export type UnifiedWorkspaceRightKeyAction =
  | { readonly type: "expand"; readonly nodeId: string }
  | { readonly type: "focus-child"; readonly nodeId: string }
  | { readonly type: "none" };

/** Right arrow: expand a collapsed container, else move focus into its first child. */
export function resolveRightKeyAction(
  node: UnifiedWorkspaceNode,
  isCollapsed: boolean,
): UnifiedWorkspaceRightKeyAction {
  if (!node.canHaveChildren || node.children.length === 0) return { type: "none" };
  if (isCollapsed) return { type: "expand", nodeId: node.id };
  const firstChild = node.children[0];
  return firstChild ? { type: "focus-child", nodeId: firstChild.id } : { type: "none" };
}

export type UnifiedWorkspaceLeftKeyAction =
  | { readonly type: "collapse"; readonly nodeId: string }
  | { readonly type: "focus-parent"; readonly nodeId: string }
  | { readonly type: "none" };

/** Left arrow: collapse an expanded container, else move focus to the parent. */
export function resolveLeftKeyAction(
  node: UnifiedWorkspaceNode,
  isCollapsed: boolean,
): UnifiedWorkspaceLeftKeyAction {
  if (node.canHaveChildren && node.children.length > 0 && !isCollapsed) {
    return { type: "collapse", nodeId: node.id };
  }
  if (node.parentId !== null) return { type: "focus-parent", nodeId: node.parentId };
  return { type: "none" };
}

// ── Drop zone resolution (§10) ───────────────────────────────────────────────

export type UnifiedWorkspaceDropZone = "before" | "inside" | "after";

/**
 * top quarter -> before, middle half -> inside (only when the target can have
 * children), bottom quarter -> after, leaf middle falls back to after.
 */
export function resolveUnifiedWorkspaceDropZone(input: {
  readonly pointerOffsetY: number;
  readonly rowHeight: number;
  readonly canHaveChildren: boolean;
}): UnifiedWorkspaceDropZone {
  const { pointerOffsetY, rowHeight, canHaveChildren } = input;
  if (rowHeight <= 0) return canHaveChildren ? "inside" : "after";
  const ratio = Math.min(Math.max(pointerOffsetY, 0), rowHeight) / rowHeight;
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return canHaveChildren ? "inside" : "after";
}

// ── Drop legality (client-side optimistic check; server is authoritative) ──

export function computeEffectiveNewParentId(
  target: UnifiedWorkspaceNode,
  zone: UnifiedWorkspaceDropZone,
): string | null {
  return zone === "inside" ? target.id : target.parentId;
}

export function canDropUnifiedWorkspaceNode(input: {
  readonly index: UnifiedWorkspaceNodeIndex;
  readonly draggedNodeId: string;
  readonly targetNodeId: string;
  readonly zone: UnifiedWorkspaceDropZone;
}): boolean {
  const { index, draggedNodeId, targetNodeId, zone } = input;
  if (draggedNodeId === targetNodeId) return false;

  const dragged = index.byId.get(draggedNodeId);
  const target = index.byId.get(targetNodeId);
  if (!dragged || !target) return false;
  if (!dragged.canMove) return false;
  if (target.isBroken && zone === "inside") return false;
  if (zone === "inside" && !target.canHaveChildren) return false;

  // Can't drop into/around the dragged node's own subtree.
  if (isNodeSelfOrDescendant(index, draggedNodeId, targetNodeId)) return false;

  const newParentId = computeEffectiveNewParentId(target, zone);
  if (newParentId === draggedNodeId) return false;
  if (newParentId !== null && isNodeSelfOrDescendant(index, draggedNodeId, newParentId))
    return false;

  return true;
}

export function canDropUnifiedWorkspaceNodeAtRoot(input: {
  readonly index: UnifiedWorkspaceNodeIndex;
  readonly draggedNodeId: string;
}): boolean {
  const dragged = input.index.byId.get(input.draggedNodeId);
  return dragged !== undefined && dragged.canMove && dragged.parentId !== null;
}

// ── Move target construction ────────────────────────────────────────────────

export interface UnifiedWorkspaceResolvedMoveTarget {
  readonly nodeId: string;
  readonly parentId: string | null;
  readonly beforeId: string | null;
}

/** Translate a resolved (target node, zone) hover into a persisted move target. */
export function resolveMoveTargetForDrop(input: {
  readonly index: UnifiedWorkspaceNodeIndex;
  readonly draggedNodeId: string;
  readonly targetNodeId: string;
  readonly zone: UnifiedWorkspaceDropZone;
}): UnifiedWorkspaceResolvedMoveTarget | null {
  const { index, draggedNodeId, targetNodeId, zone } = input;
  const target = index.byId.get(targetNodeId);
  if (!target) return null;

  if (zone === "inside") {
    return { nodeId: draggedNodeId, parentId: target.id, beforeId: null };
  }

  if (zone === "before") {
    return { nodeId: draggedNodeId, parentId: target.parentId, beforeId: target.id };
  }

  // zone === "after": find the sibling right after `target`, excluding the
  // dragged node itself from the list first — otherwise dragging a node that
  // already sits directly next to `target` miscomputes its own old slot as
  // the "next" sibling instead of skipping past it.
  const siblings = (index.siblingsByParentId.get(target.parentId) ?? []).filter(
    (sibling) => sibling.id !== draggedNodeId,
  );
  const targetIndex = siblings.findIndex((sibling) => sibling.id === target.id);
  const nextSibling = targetIndex >= 0 ? siblings[targetIndex + 1] : undefined;
  return { nodeId: draggedNodeId, parentId: target.parentId, beforeId: nextSibling?.id ?? null };
}

/** Root gutter always appends the dragged node at the end of the root list. */
export function resolveMoveTargetForRootGutterDrop(
  draggedNodeId: string,
): UnifiedWorkspaceResolvedMoveTarget {
  return { nodeId: draggedNodeId, parentId: null, beforeId: null };
}

// ── Geometry ─────────────────────────────────────────────────────────────

/** `paddingInlineStart = calc(0.375rem + depth * var(--uw-tree-indent))` per §12.4. */
export function unifiedWorkspaceRowIndentStyle(depth: number): { paddingInlineStart: string } {
  return { paddingInlineStart: `calc(0.375rem + ${depth} * var(--uw-tree-indent))` };
}

// ── ARIA live-region announcements (§10: source, target, result) ───────────

export function describeUnifiedWorkspaceDropZone(zone: UnifiedWorkspaceDropZone): string {
  switch (zone) {
    case "before":
      return "before";
    case "after":
      return "after";
    case "inside":
      return "into";
  }
}

export function buildUnifiedWorkspaceDragAnnouncement(input: {
  readonly phase: "start" | "over" | "cancel";
  readonly draggedLabel: string;
  readonly targetLabel?: string | null;
  readonly zone?: UnifiedWorkspaceDropZone | null;
}): string {
  const { phase, draggedLabel, targetLabel, zone } = input;
  if (phase === "start") return `Picked up ${draggedLabel}.`;
  if (phase === "cancel") return `Move cancelled for ${draggedLabel}.`;
  if (!targetLabel) return `${draggedLabel} is over the root of the tree.`;
  const zoneLabel = zone ? describeUnifiedWorkspaceDropZone(zone) : "near";
  return `${draggedLabel} will drop ${zoneLabel} ${targetLabel}.`;
}

export function buildUnifiedWorkspaceDropResultAnnouncement(input: {
  readonly draggedLabel: string;
  readonly result: "success" | "rejected";
  readonly reason?: string | null;
}): string {
  if (input.result === "success") return `Moved ${input.draggedLabel}.`;
  return input.reason
    ? `Could not move ${input.draggedLabel}: ${input.reason}`
    : `Could not move ${input.draggedLabel}.`;
}

// ── Context menus (§11) ──────────────────────────────────────────────────

/**
 * Every action id a unified-workspace row context menu can produce. The
 * caller (UnifiedWorkspaceTree) maps the clicked id back to a controller
 * call or a thread-extras callback — this module only decides which ids are
 * offered, per node kind, per §11.
 */
export type UnifiedWorkspaceContextMenuActionId =
  | "open"
  | "open-in-files"
  | "copy-relative-path"
  | "add-to-chat"
  | "move-to"
  | "new-child-thread"
  | "rename"
  | "remove"
  | "run"
  | "pin-shortcut"
  | "copy-url"
  | "open-externally"
  | "close-live"
  | "mark-unread"
  | "archive-thread"
  | "delete-thread"
  | "copy-thread-id";

/**
 * Builds the row context-menu items for one node, per §11. `isWeb` controls
 * "Open externally" copy for URL/browser nodes (web has no embedded preview).
 *
 * Two §11 items are intentionally never emitted, because the controller has
 * no backing call for them (see Agent 2's handoff report):
 *  - "Reveal in system file manager" — `LocalApi` only exposes
 *    `shell.openInEditor`/`shell.openExternal`, no reveal-in-Finder call.
 *  - "Edit command" / "Delete command" — the controller can `runCommand` and
 *    `removeNode` (unplace) a command, but has no call to open the script
 *    editor or delete the underlying `ProjectScript`.
 *  - "Edit shortcut" (URL) covers only the label via the generic `rename`
 *    item — there is no controller call to change a shortcut's URL value.
 */
export function buildUnifiedWorkspaceContextMenuItems(input: {
  readonly node: UnifiedWorkspaceNode;
}): ContextMenuItem<UnifiedWorkspaceContextMenuActionId>[] {
  const { node } = input;
  const items: ContextMenuItem<UnifiedWorkspaceContextMenuActionId>[] = [];

  switch (node.kind) {
    case "file":
      items.push({ id: "open", label: "Open" });
      items.push({ id: "copy-relative-path", label: "Copy relative path" });
      items.push({ id: "add-to-chat", label: "Add to chat" });
      break;
    case "folder":
      items.push({ id: "open-in-files", label: "Open in Files" });
      items.push({ id: "copy-relative-path", label: "Copy relative path" });
      items.push({ id: "add-to-chat", label: "Add to chat" });
      break;
    case "thread":
      items.push({ id: "open", label: "Open" });
      items.push({ id: "mark-unread", label: "Mark unread" });
      break;
    case "terminal":
      items.push({ id: "open", label: "Open" });
      break;
    case "browser":
      items.push({ id: "open", label: "Open" });
      items.push({ id: "pin-shortcut", label: "Pin shortcut" });
      items.push({ id: "copy-url", label: "Copy URL" });
      items.push({ id: "open-externally", label: "Open externally" });
      break;
    case "command":
      items.push({ id: "run", label: "Run" });
      break;
    case "url":
      items.push({ id: "open", label: "Open" });
      items.push({ id: "copy-url", label: "Copy URL" });
      items.push({ id: "open-externally", label: "Open externally" });
      break;
  }

  if (node.canMove) {
    items.push({ id: "move-to", label: "Move to…" });
  }
  if (node.canHaveChildren) {
    items.push({ id: "new-child-thread", label: "New child thread" });
  }
  if (node.canRename) {
    items.push({ id: "rename", label: "Rename" });
  }

  if (node.kind === "thread") {
    items.push({ id: "archive-thread", label: "Archive" });
  }

  if (node.kind === "terminal" || node.kind === "browser") {
    items.push({
      id: "close-live",
      label: node.kind === "terminal" ? "Close terminal" : "Close tab",
    });
  }

  if (node.canRemove) {
    items.push({ id: "remove", label: "Remove from sidebar" });
  }

  if (node.kind === "thread") {
    items.push({ id: "copy-thread-id", label: "Copy Thread ID" });
    items.push({ id: "delete-thread", label: "Delete", destructive: true, icon: "trash" });
  }

  return items;
}
