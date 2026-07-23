import { describe, expect, it } from "vite-plus/test";

import {
  compareUnifiedWorkspaceRanks,
  flattenUnifiedWorkspaceNodes,
  getAdjacentUnifiedWorkspaceNodeId,
  getUnifiedWorkspaceAncestorIds,
  getUnifiedWorkspaceDescendantIds,
  getVisibleUnifiedWorkspaceNodeIds,
  indexUnifiedWorkspaceNodesById,
  isUnifiedWorkspaceDescendant,
  parseUnifiedWorkspaceNodeId,
  qualifyUnifiedWorkspaceNodeId,
  resolveUnifiedWorkspaceDropZone,
  resolveUnifiedWorkspaceMoveTarget,
  unifiedWorkspaceNodeProjectScopeKey,
  validateUnifiedWorkspaceMove,
  wouldCreateUnifiedWorkspaceCycle,
} from "./treeOperations";
import type { UnifiedWorkspaceNode } from "./types";

function node(input: {
  id: string;
  parentId: string | null;
  children?: UnifiedWorkspaceNode[];
  kind?: UnifiedWorkspaceNode["kind"];
  canHaveChildren?: boolean;
  canMove?: boolean;
}): UnifiedWorkspaceNode {
  return {
    id: input.id,
    kind: input.kind ?? "thread",
    label: input.id,
    parentId: input.parentId,
    depth: 0,
    children: input.children ?? [],
    isLive: false,
    isBroken: false,
    canHaveChildren: input.canHaveChildren ?? true,
    canMove: input.canMove ?? true,
    canRename: false,
    canRemove: false,
    activation: { kind: "none" },
    status: null,
  };
}

describe("node id qualification", () => {
  it("round-trips environmentId/projectId/itemId", () => {
    const id = qualifyUnifiedWorkspaceNodeId("env-1", "proj-1", "thread:abc");
    expect(id).toBe("node:env-1:proj-1:thread:abc");
    expect(parseUnifiedWorkspaceNodeId(id)).toEqual({
      environmentId: "env-1",
      projectId: "proj-1",
      itemId: "thread:abc",
    });
  });

  it("returns null for malformed ids", () => {
    expect(parseUnifiedWorkspaceNodeId("not-a-node-id")).toBeNull();
    expect(parseUnifiedWorkspaceNodeId("node:only-env")).toBeNull();
    expect(parseUnifiedWorkspaceNodeId("node:env:proj:")).toBeNull();
  });

  it("derives a project scope key for cross-project comparisons", () => {
    const a = qualifyUnifiedWorkspaceNodeId("env-1", "proj-1", "file:src/a.ts");
    const b = qualifyUnifiedWorkspaceNodeId("env-1", "proj-2", "file:src/a.ts");
    expect(unifiedWorkspaceNodeProjectScopeKey(a)).toBe("env-1:proj-1");
    expect(unifiedWorkspaceNodeProjectScopeKey(a)).not.toBe(unifiedWorkspaceNodeProjectScopeKey(b));
  });
});

describe("compareUnifiedWorkspaceRanks", () => {
  it("compares ordinally, not via locale collation", () => {
    expect(compareUnifiedWorkspaceRanks("a", "b")).toBeLessThan(0);
    expect(compareUnifiedWorkspaceRanks("b", "a")).toBeGreaterThan(0);
    expect(compareUnifiedWorkspaceRanks("a", "a")).toBe(0);
    // Ordinal: uppercase sorts before lowercase (unlike most locale collations).
    expect(compareUnifiedWorkspaceRanks("A", "a")).toBeLessThan(0);
  });
});

describe("flatten / ancestry / descendants", () => {
  const grandchild = node({ id: "gc", parentId: "child" });
  const child = node({ id: "child", parentId: "root", children: [grandchild] });
  const root = node({ id: "root", parentId: null, children: [child] });
  const roots = [root];
  const byId = indexUnifiedWorkspaceNodesById(roots);

  it("flattens depth-first, parent before children", () => {
    expect(flattenUnifiedWorkspaceNodes(roots).map((n) => n.id)).toEqual(["root", "child", "gc"]);
  });

  it("collects ancestors nearest-first excluding self", () => {
    expect(getUnifiedWorkspaceAncestorIds("gc", byId)).toEqual(["child", "root"]);
    expect(getUnifiedWorkspaceAncestorIds("root", byId)).toEqual([]);
  });

  it("collects descendants excluding self", () => {
    expect(getUnifiedWorkspaceDescendantIds("root", byId)).toEqual(["child", "gc"]);
    expect(getUnifiedWorkspaceDescendantIds("gc", byId)).toEqual([]);
  });

  it("isUnifiedWorkspaceDescendant answers both directions correctly", () => {
    expect(isUnifiedWorkspaceDescendant("gc", "root", byId)).toBe(true);
    expect(isUnifiedWorkspaceDescendant("root", "gc", byId)).toBe(false);
  });
});

describe("wouldCreateUnifiedWorkspaceCycle", () => {
  const child = node({ id: "child", parentId: "root" });
  const root = node({ id: "root", parentId: null, children: [child] });
  const byId = indexUnifiedWorkspaceNodesById([root]);

  it("rejects self-parenting", () => {
    expect(wouldCreateUnifiedWorkspaceCycle("root", "root", byId)).toBe(true);
  });

  it("rejects re-parenting under one's own descendant", () => {
    expect(wouldCreateUnifiedWorkspaceCycle("root", "child", byId)).toBe(true);
  });

  it("allows re-parenting under an unrelated node", () => {
    expect(wouldCreateUnifiedWorkspaceCycle("child", null, byId)).toBe(false);
  });
});

describe("resolveUnifiedWorkspaceDropZone", () => {
  it("splits top/bottom quarters as before/after", () => {
    expect(resolveUnifiedWorkspaceDropZone({ pointerFraction: 0.1, canHaveChildren: true })).toBe(
      "before",
    );
    expect(resolveUnifiedWorkspaceDropZone({ pointerFraction: 0.9, canHaveChildren: true })).toBe(
      "after",
    );
  });

  it("middle half is inside when the target can have children", () => {
    expect(resolveUnifiedWorkspaceDropZone({ pointerFraction: 0.5, canHaveChildren: true })).toBe(
      "inside",
    );
  });

  it("leaf middle falls back to after", () => {
    expect(resolveUnifiedWorkspaceDropZone({ pointerFraction: 0.5, canHaveChildren: false })).toBe(
      "after",
    );
  });
});

describe("resolveUnifiedWorkspaceMoveTarget + validateUnifiedWorkspaceMove", () => {
  // Realistic, fully-qualified ids: cross-project rejection is keyed off the
  // `node:<environmentId>:<projectId>:` prefix, so fixtures must use it too.
  const q = (itemId: string) => qualifyUnifiedWorkspaceNodeId("env-1", "proj-1", itemId);
  const fileLeaf = node({
    id: q("file-a"),
    parentId: q("root"),
    kind: "file",
    canHaveChildren: false,
  });
  const threadChild = node({ id: q("thread-a"), parentId: q("root"), kind: "thread" });
  const root = node({
    id: q("root"),
    parentId: null,
    kind: "folder",
    children: [fileLeaf, threadChild],
  });
  const dragged = node({ id: q("dragged"), parentId: null, kind: "thread" });
  const roots = [root, dragged];
  const byId = indexUnifiedWorkspaceNodesById(roots);
  const rootIds = roots.map((n) => n.id);

  it("root gutter always resolves to root append", () => {
    const target = resolveUnifiedWorkspaceMoveTarget({
      draggedId: q("dragged"),
      targetId: null,
      zone: "inside",
      byId,
      rootIds,
    });
    expect(target).toEqual({ nodeId: q("dragged"), parentId: null, beforeId: null });
    expect(validateUnifiedWorkspaceMove(target!, byId)).toEqual({ ok: true });
  });

  it("inside a container places as its child with no beforeId", () => {
    const target = resolveUnifiedWorkspaceMoveTarget({
      draggedId: q("dragged"),
      targetId: q("root"),
      zone: "inside",
      byId,
      rootIds,
    });
    expect(target).toEqual({ nodeId: q("dragged"), parentId: q("root"), beforeId: null });
    expect(validateUnifiedWorkspaceMove(target!, byId)).toEqual({ ok: true });
  });

  it("inside a leaf is structurally invalid", () => {
    const target = resolveUnifiedWorkspaceMoveTarget({
      draggedId: q("dragged"),
      targetId: q("file-a"),
      zone: "inside",
      byId,
      rootIds,
    });
    expect(target).toBeNull();
  });

  it("before/after resolve to a sibling position under the target's parent", () => {
    const before = resolveUnifiedWorkspaceMoveTarget({
      draggedId: q("dragged"),
      targetId: q("thread-a"),
      zone: "before",
      byId,
      rootIds,
    });
    expect(before).toEqual({ nodeId: q("dragged"), parentId: q("root"), beforeId: q("thread-a") });

    const after = resolveUnifiedWorkspaceMoveTarget({
      draggedId: q("dragged"),
      targetId: q("file-a"),
      zone: "after",
      byId,
      rootIds,
    });
    expect(after).toEqual({ nodeId: q("dragged"), parentId: q("root"), beforeId: q("thread-a") });
  });

  it("rejects moving into a node that cannot have children", () => {
    const result = validateUnifiedWorkspaceMove(
      { nodeId: q("dragged"), parentId: q("file-a"), beforeId: null },
      byId,
    );
    expect(result).toEqual({ ok: false, reason: "invalid-target" });
  });

  it("rejects moves that would create a cycle", () => {
    const result = validateUnifiedWorkspaceMove(
      { nodeId: q("root"), parentId: q("thread-a"), beforeId: null },
      byId,
    );
    expect(result).toEqual({ ok: false, reason: "cycle" });
  });

  it("rejects an immovable dragged node", () => {
    const immovable = node({ id: q("term-a"), parentId: null, kind: "terminal", canMove: false });
    const localById = indexUnifiedWorkspaceNodesById([root, immovable]);
    const result = validateUnifiedWorkspaceMove(
      { nodeId: q("term-a"), parentId: q("root"), beforeId: null },
      localById,
    );
    expect(result).toEqual({ ok: false, reason: "invalid-target" });
  });

  it("rejects cross-project moves", () => {
    const otherProjectRoot = node({
      id: qualifyUnifiedWorkspaceNodeId("env-1", "proj-2", "root"),
      parentId: null,
      kind: "folder",
    });
    const thisProjectDragged = node({ id: q("dragged"), parentId: null, kind: "thread" });
    const localById = indexUnifiedWorkspaceNodesById([otherProjectRoot, thisProjectDragged]);
    const result = validateUnifiedWorkspaceMove(
      { nodeId: thisProjectDragged.id, parentId: otherProjectRoot.id, beforeId: null },
      localById,
    );
    expect(result).toEqual({ ok: false, reason: "cross-project" });
  });

  it("rejects a beforeId that is not a child of the resolved parent", () => {
    const result = validateUnifiedWorkspaceMove(
      { nodeId: q("dragged"), parentId: q("root"), beforeId: q("dragged") },
      byId,
    );
    expect(result).toEqual({ ok: false, reason: "invalid-target" });
  });
});

describe("keyboard visibility/adjacency", () => {
  const grandchild = node({ id: "gc", parentId: "child" });
  const child = node({ id: "child", parentId: "root", children: [grandchild] });
  const root = node({ id: "root", parentId: null, children: [child] });
  const sibling = node({ id: "sibling", parentId: null });
  const roots = [root, sibling];

  it("respects collapsed branches", () => {
    expect(getVisibleUnifiedWorkspaceNodeIds(roots, () => false)).toEqual(["root", "sibling"]);
    expect(getVisibleUnifiedWorkspaceNodeIds(roots, () => true)).toEqual([
      "root",
      "child",
      "gc",
      "sibling",
    ]);
  });

  it("walks next/previous and clamps at the ends", () => {
    const visible = ["root", "sibling"];
    expect(getAdjacentUnifiedWorkspaceNodeId(visible, "root", "next")).toBe("sibling");
    expect(getAdjacentUnifiedWorkspaceNodeId(visible, "sibling", "next")).toBeNull();
    expect(getAdjacentUnifiedWorkspaceNodeId(visible, "sibling", "previous")).toBe("root");
    expect(getAdjacentUnifiedWorkspaceNodeId(visible, null, "next")).toBe("root");
    expect(getAdjacentUnifiedWorkspaceNodeId(visible, null, "previous")).toBe("sibling");
  });
});
