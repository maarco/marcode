/**
 * Pure tree-shape helpers for the unified workspace sidebar: node-id
 * qualification, flattening, ancestry/descendant/cycle checks, drag-and-drop
 * target resolution, and keyboard-navigation selection helpers.
 *
 * Consumed by `buildTree.ts` (diagnostics: duplicate-id/cycle detection over
 * raw layout entries) and by Agent 2's `UnifiedWorkspaceTree.logic.ts` (drag,
 * drop, and keyboard math over the built `UnifiedWorkspaceNode[]` tree).
 *
 * No React import. No I/O. Every export is a pure function.
 */
import type { UnifiedWorkspaceMoveTarget, UnifiedWorkspaceNode } from "./types";

const NODE_ID_PREFIX = "node";

export interface ParsedUnifiedWorkspaceNodeId {
  readonly environmentId: string;
  readonly projectId: string;
  /** Raw `ProjectWorkspaceItemId` — may itself contain colons (e.g. `thread:<id>`). */
  readonly itemId: string;
}

/** `node:<environmentId>:<projectId>:<projectWorkspaceItemId>` — see spec §7. */
export function qualifyUnifiedWorkspaceNodeId(
  environmentId: string,
  projectId: string,
  itemId: string,
): string {
  return `${NODE_ID_PREFIX}:${environmentId}:${projectId}:${itemId}`;
}

/**
 * Inverse of `qualifyUnifiedWorkspaceNodeId`. Only the first two colons are
 * treated as separators — `itemId` (e.g. `thread:<uuid>`) may contain more,
 * mirroring how `environmentId`/`projectId` are always assumed colon-free
 * (the same assumption `scopedThreadKey`/`parseScopedThreadKey` make).
 */
export function parseUnifiedWorkspaceNodeId(nodeId: string): ParsedUnifiedWorkspaceNodeId | null {
  const firstColon = nodeId.indexOf(":");
  if (firstColon <= 0) return null;
  if (nodeId.slice(0, firstColon) !== NODE_ID_PREFIX) return null;
  const secondColon = nodeId.indexOf(":", firstColon + 1);
  if (secondColon < 0) return null;
  const thirdColon = nodeId.indexOf(":", secondColon + 1);
  if (thirdColon < 0) return null;
  const environmentId = nodeId.slice(firstColon + 1, secondColon);
  const projectId = nodeId.slice(secondColon + 1, thirdColon);
  const itemId = nodeId.slice(thirdColon + 1);
  if (!environmentId || !projectId || !itemId) return null;
  return { environmentId, projectId, itemId };
}

/** `<environmentId>:<projectId>` — used to reject cross-project drag targets. */
export function unifiedWorkspaceNodeProjectScopeKey(nodeId: string): string | null {
  const parsed = parseUnifiedWorkspaceNodeId(nodeId);
  return parsed ? `${parsed.environmentId}:${parsed.projectId}` : null;
}

/** Ordinal (byte-order) comparison — fractional ranks must NOT use locale collation. */
export function compareUnifiedWorkspaceRanks(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Pre-order (parent before children) flatten of the built tree. */
export function flattenUnifiedWorkspaceNodes(
  roots: readonly UnifiedWorkspaceNode[],
): UnifiedWorkspaceNode[] {
  const result: UnifiedWorkspaceNode[] = [];
  const visit = (node: UnifiedWorkspaceNode): void => {
    result.push(node);
    for (const child of node.children) visit(child);
  };
  for (const root of roots) visit(root);
  return result;
}

export function indexUnifiedWorkspaceNodesById(
  roots: readonly UnifiedWorkspaceNode[],
): Map<string, UnifiedWorkspaceNode> {
  const byId = new Map<string, UnifiedWorkspaceNode>();
  for (const node of flattenUnifiedWorkspaceNodes(roots)) byId.set(node.id, node);
  return byId;
}

/** Nearest parent first, root last. Excludes `nodeId` itself. Cycle-safe. */
export function getUnifiedWorkspaceAncestorIds(
  nodeId: string,
  byId: ReadonlyMap<string, UnifiedWorkspaceNode>,
): string[] {
  const ancestors: string[] = [];
  const seen = new Set<string>([nodeId]);
  let current = byId.get(nodeId)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    ancestors.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return ancestors;
}

/** Every descendant id, depth-first. Excludes `nodeId` itself. */
export function getUnifiedWorkspaceDescendantIds(
  nodeId: string,
  byId: ReadonlyMap<string, UnifiedWorkspaceNode>,
): string[] {
  const node = byId.get(nodeId);
  if (!node) return [];
  const descendants: string[] = [];
  const visit = (current: UnifiedWorkspaceNode): void => {
    for (const child of current.children) {
      descendants.push(child.id);
      visit(child);
    }
  };
  visit(node);
  return descendants;
}

export function isUnifiedWorkspaceDescendant(
  candidateId: string,
  ofId: string,
  byId: ReadonlyMap<string, UnifiedWorkspaceNode>,
): boolean {
  return getUnifiedWorkspaceAncestorIds(candidateId, byId).includes(ofId);
}

/** True when re-parenting `draggedId` under `newParentId` would create a cycle (or is a no-op self-parent). */
export function wouldCreateUnifiedWorkspaceCycle(
  draggedId: string,
  newParentId: string | null,
  byId: ReadonlyMap<string, UnifiedWorkspaceNode>,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === draggedId) return true;
  return isUnifiedWorkspaceDescendant(newParentId, draggedId, byId);
}

export type UnifiedWorkspaceDropZone = "before" | "inside" | "after";

/**
 * Spec §10 drop zones: top quarter before, bottom quarter after, middle half
 * inside when the target can have children — leaf middle falls back to after.
 */
export function resolveUnifiedWorkspaceDropZone(input: {
  readonly pointerFraction: number;
  readonly canHaveChildren: boolean;
}): UnifiedWorkspaceDropZone {
  const fraction = Math.min(1, Math.max(0, input.pointerFraction));
  if (fraction < 0.25) return "before";
  if (fraction > 0.75) return "after";
  return input.canHaveChildren ? "inside" : "after";
}

/**
 * Translates a hovered row + zone into the `{ parentId, beforeId }` the
 * dragged node would land at. Returns `null` when the zone/target combination
 * is structurally meaningless (e.g. "inside" a leaf, or an unknown target).
 * Does not validate cycles/cross-project — call `validateUnifiedWorkspaceMove` next.
 */
export function resolveUnifiedWorkspaceMoveTarget(input: {
  readonly draggedId: string;
  readonly targetId: string | null;
  readonly zone: UnifiedWorkspaceDropZone;
  readonly byId: ReadonlyMap<string, UnifiedWorkspaceNode>;
  readonly rootIds: readonly string[];
}): UnifiedWorkspaceMoveTarget | null {
  if (input.targetId === null) {
    // Root gutter: append at root.
    return { nodeId: input.draggedId, parentId: null, beforeId: null };
  }
  const target = input.byId.get(input.targetId);
  if (!target) return null;

  if (input.zone === "inside") {
    if (!target.canHaveChildren) return null;
    return { nodeId: input.draggedId, parentId: input.targetId, beforeId: null };
  }

  const siblings =
    target.parentId === null
      ? input.rootIds.flatMap((id) => {
          const node = input.byId.get(id);
          return node ? [node] : [];
        })
      : (input.byId.get(target.parentId)?.children ?? []);
  const targetIndex = siblings.findIndex((sibling) => sibling.id === input.targetId);
  if (targetIndex < 0) return null;

  const beforeId =
    input.zone === "before" ? input.targetId : (siblings[targetIndex + 1]?.id ?? null);
  return { nodeId: input.draggedId, parentId: target.parentId, beforeId };
}

export type UnifiedWorkspaceDropRejectionReason =
  | "cycle"
  | "cross-project"
  | "invalid-target"
  | "missing-target";

export type UnifiedWorkspaceDropValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: UnifiedWorkspaceDropRejectionReason };

/**
 * Validates a resolved move target: dragged node must be movable, the parent
 * (when not root) must exist, accept children, and share the dragged node's
 * project scope, the move must not create a cycle, and `beforeId` (when
 * present) must actually be a current child of the resulting parent.
 */
export function validateUnifiedWorkspaceMove(
  target: UnifiedWorkspaceMoveTarget,
  byId: ReadonlyMap<string, UnifiedWorkspaceNode>,
): UnifiedWorkspaceDropValidation {
  const dragged = byId.get(target.nodeId);
  if (!dragged) return { ok: false, reason: "missing-target" };
  if (!dragged.canMove) return { ok: false, reason: "invalid-target" };

  if (target.parentId !== null) {
    const parent = byId.get(target.parentId);
    if (!parent) return { ok: false, reason: "missing-target" };
    if (!parent.canHaveChildren) return { ok: false, reason: "invalid-target" };
    // An ambient (disk-projected) node has no persisted entry to nest under —
    // attach it first (spec override: attachment is now for pinning/nesting,
    // not for gating visibility). The server would reject this as "parent
    // does not exist" anyway; catching it here avoids the round trip.
    if (parent.isAmbient) return { ok: false, reason: "invalid-target" };

    const draggedScope = unifiedWorkspaceNodeProjectScopeKey(target.nodeId);
    const parentScope = unifiedWorkspaceNodeProjectScopeKey(target.parentId);
    if (draggedScope === null || parentScope === null || draggedScope !== parentScope) {
      return { ok: false, reason: "cross-project" };
    }
    if (wouldCreateUnifiedWorkspaceCycle(target.nodeId, target.parentId, byId)) {
      return { ok: false, reason: "cycle" };
    }
  }

  if (target.beforeId !== null) {
    const before = byId.get(target.beforeId);
    if (!before || before.parentId !== target.parentId) {
      return { ok: false, reason: "invalid-target" };
    }
  }

  return { ok: true };
}

/** Flattened, depth-first list of node ids honoring collapsed branches — for Up/Down/Home/End. */
export function getVisibleUnifiedWorkspaceNodeIds(
  roots: readonly UnifiedWorkspaceNode[],
  isExpanded: (nodeId: string) => boolean,
): string[] {
  const visible: string[] = [];
  const visit = (node: UnifiedWorkspaceNode): void => {
    visible.push(node.id);
    if (node.children.length > 0 && isExpanded(node.id)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const root of roots) visit(root);
  return visible;
}

/** Next/previous id in an already-flattened visible list; wraps to the nearest end when `currentId` is unknown. */
export function getAdjacentUnifiedWorkspaceNodeId(
  visibleIds: readonly string[],
  currentId: string | null,
  direction: "next" | "previous",
): string | null {
  if (visibleIds.length === 0) return null;
  if (currentId === null) {
    return direction === "next" ? (visibleIds[0] ?? null) : (visibleIds.at(-1) ?? null);
  }
  const index = visibleIds.indexOf(currentId);
  if (index < 0) {
    return direction === "next" ? (visibleIds[0] ?? null) : (visibleIds.at(-1) ?? null);
  }
  const nextIndex = direction === "next" ? index + 1 : index - 1;
  return visibleIds[nextIndex] ?? null;
}
