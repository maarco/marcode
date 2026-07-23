import { describe, expect, it } from "vite-plus/test";
import type { UnifiedWorkspaceNode } from "../../unifiedWorkspace/types";
import {
  buildUnifiedWorkspaceContextMenuItems,
  buildUnifiedWorkspaceDragAnnouncement,
  buildUnifiedWorkspaceDropResultAnnouncement,
  buildUnifiedWorkspaceNodeIndex,
  canDropUnifiedWorkspaceNode,
  canDropUnifiedWorkspaceNodeAtRoot,
  flattenVisibleUnifiedWorkspaceNodes,
  isNodeSelfOrDescendant,
  isUnifiedWorkspaceNodeCollapsed,
  resolveEdgeMoveTarget,
  resolveLeftKeyAction,
  resolveMoveTargetForDrop,
  resolveMoveTargetForRootGutterDrop,
  resolveRightKeyAction,
  resolveUnifiedWorkspaceDropZone,
  resolveVerticalMoveTarget,
  unifiedWorkspaceRowIndentStyle,
} from "./UnifiedWorkspaceTree.logic";

function node(input: {
  id: string;
  kind?: UnifiedWorkspaceNode["kind"];
  label?: string;
  parentId?: string | null;
  depth?: number;
  children?: readonly UnifiedWorkspaceNode[];
  canHaveChildren?: boolean;
  canMove?: boolean;
  canRename?: boolean;
  canRemove?: boolean;
  isBroken?: boolean;
}): UnifiedWorkspaceNode {
  return {
    id: input.id,
    kind: input.kind ?? "file",
    label: input.label ?? input.id,
    parentId: input.parentId ?? null,
    depth: input.depth ?? 0,
    children: input.children ?? [],
    isLive: false,
    isBroken: input.isBroken ?? false,
    canHaveChildren: input.canHaveChildren ?? false,
    canMove: input.canMove ?? true,
    canRename: input.canRename ?? true,
    canRemove: input.canRemove ?? true,
    activation: { kind: "none" },
    status: null,
  };
}

// Fixture shape:
// root/
//   folder (folder, canHaveChildren)
//     child-file (file)
//     child-thread (thread, canHaveChildren)
//       terminal (terminal, leaf)
//   sibling-file (file)
//   broken (file, isBroken)
//   immovable (file, canMove=false)
function buildFixtureTree(): readonly UnifiedWorkspaceNode[] {
  const terminal = node({ id: "terminal", kind: "terminal", parentId: "child-thread", depth: 2 });
  const childThread = node({
    id: "child-thread",
    kind: "thread",
    parentId: "folder",
    depth: 1,
    canHaveChildren: true,
    children: [terminal],
  });
  const childFile = node({ id: "child-file", kind: "file", parentId: "folder", depth: 1 });
  const folder = node({
    id: "folder",
    kind: "folder",
    depth: 0,
    canHaveChildren: true,
    children: [childFile, childThread],
  });
  const siblingFile = node({ id: "sibling-file", kind: "file", depth: 0 });
  const broken = node({ id: "broken", kind: "file", depth: 0, isBroken: true });
  const immovable = node({ id: "immovable", kind: "file", depth: 0, canMove: false });
  return [folder, siblingFile, broken, immovable];
}

describe("flattenVisibleUnifiedWorkspaceNodes", () => {
  it("includes every node when nothing is collapsed", () => {
    const rows = flattenVisibleUnifiedWorkspaceNodes(buildFixtureTree(), new Set());
    expect(rows.map((row) => row.node.id)).toEqual([
      "folder",
      "child-file",
      "child-thread",
      "terminal",
      "sibling-file",
      "broken",
      "immovable",
    ]);
  });

  it("hides descendants of a collapsed container but keeps the container itself", () => {
    const rows = flattenVisibleUnifiedWorkspaceNodes(buildFixtureTree(), new Set(["folder"]));
    expect(rows.map((row) => row.node.id)).toEqual([
      "folder",
      "sibling-file",
      "broken",
      "immovable",
    ]);
  });

  it("collapsing a nested container only hides its own children", () => {
    const rows = flattenVisibleUnifiedWorkspaceNodes(buildFixtureTree(), new Set(["child-thread"]));
    expect(rows.map((row) => row.node.id)).toEqual([
      "folder",
      "child-file",
      "child-thread",
      "sibling-file",
      "broken",
      "immovable",
    ]);
  });

  it("returns an empty list for an empty tree", () => {
    expect(flattenVisibleUnifiedWorkspaceNodes([], new Set())).toEqual([]);
  });

  it("ignores collapsed ids for leaf nodes (a leaf has no children to hide)", () => {
    const rows = flattenVisibleUnifiedWorkspaceNodes(buildFixtureTree(), new Set(["sibling-file"]));
    expect(rows.map((row) => row.node.id)).toContain("sibling-file");
  });
});

describe("isUnifiedWorkspaceNodeCollapsed", () => {
  it("is false for a leaf even if its id is in the collapsed set", () => {
    expect(
      isUnifiedWorkspaceNodeCollapsed({ id: "leaf", canHaveChildren: false }, new Set(["leaf"])),
    ).toBe(false);
  });

  it("is true only when a container's id is present", () => {
    expect(
      isUnifiedWorkspaceNodeCollapsed({ id: "folder", canHaveChildren: true }, new Set(["folder"])),
    ).toBe(true);
    expect(
      isUnifiedWorkspaceNodeCollapsed({ id: "folder", canHaveChildren: true }, new Set()),
    ).toBe(false);
  });
});

describe("buildUnifiedWorkspaceNodeIndex / isNodeSelfOrDescendant", () => {
  it("indexes every node by id and groups siblings by parent", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(index.byId.size).toBe(7);
    expect(index.siblingsByParentId.get(null)?.map((n) => n.id)).toEqual([
      "folder",
      "sibling-file",
      "broken",
      "immovable",
    ]);
    expect(index.siblingsByParentId.get("folder")?.map((n) => n.id)).toEqual([
      "child-file",
      "child-thread",
    ]);
  });

  it("treats a node as a self-or-descendant of itself", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(isNodeSelfOrDescendant(index, "folder", "folder")).toBe(true);
  });

  it("finds a deep descendant", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(isNodeSelfOrDescendant(index, "folder", "terminal")).toBe(true);
  });

  it("is false for unrelated nodes", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(isNodeSelfOrDescendant(index, "folder", "sibling-file")).toBe(false);
  });
});

describe("keyboard navigation", () => {
  const flat = flattenVisibleUnifiedWorkspaceNodes(buildFixtureTree(), new Set());

  it("moves to the next/previous row", () => {
    expect(resolveVerticalMoveTarget(flat, "folder", "next")).toBe("child-file");
    expect(resolveVerticalMoveTarget(flat, "child-file", "previous")).toBe("folder");
  });

  it("clamps at the first and last row", () => {
    expect(resolveVerticalMoveTarget(flat, "folder", "previous")).toBe("folder");
    expect(resolveVerticalMoveTarget(flat, "immovable", "next")).toBe("immovable");
  });

  it("starts from the first/last row when nothing is focused", () => {
    expect(resolveVerticalMoveTarget(flat, null, "next")).toBe("folder");
    expect(resolveVerticalMoveTarget(flat, null, "previous")).toBe("immovable");
  });

  it("home/end jump to the first/last visible row", () => {
    expect(resolveEdgeMoveTarget(flat, "home")).toBe("folder");
    expect(resolveEdgeMoveTarget(flat, "end")).toBe("immovable");
  });

  it("returns null for home/end on an empty tree", () => {
    expect(resolveEdgeMoveTarget([], "home")).toBeNull();
  });

  it("right-arrow expands a collapsed container", () => {
    const folder = buildFixtureTree()[0]!;
    expect(resolveRightKeyAction(folder, true)).toEqual({ type: "expand", nodeId: "folder" });
  });

  it("right-arrow focuses the first child of an already-expanded container", () => {
    const folder = buildFixtureTree()[0]!;
    expect(resolveRightKeyAction(folder, false)).toEqual({
      type: "focus-child",
      nodeId: "child-file",
    });
  });

  it("right-arrow does nothing on a leaf", () => {
    const leaf = node({ id: "leaf" });
    expect(resolveRightKeyAction(leaf, false)).toEqual({ type: "none" });
  });

  it("left-arrow collapses an expanded container", () => {
    const folder = buildFixtureTree()[0]!;
    expect(resolveLeftKeyAction(folder, false)).toEqual({ type: "collapse", nodeId: "folder" });
  });

  it("left-arrow moves focus to the parent when already collapsed", () => {
    const childFile = node({ id: "child-file", parentId: "folder" });
    expect(resolveLeftKeyAction(childFile, false)).toEqual({
      type: "focus-parent",
      nodeId: "folder",
    });
  });

  it("left-arrow does nothing at a collapsed root leaf", () => {
    const rootLeaf = node({ id: "root-leaf" });
    expect(resolveLeftKeyAction(rootLeaf, false)).toEqual({ type: "none" });
  });
});

describe("resolveUnifiedWorkspaceDropZone", () => {
  it("resolves top quarter to before", () => {
    expect(
      resolveUnifiedWorkspaceDropZone({ pointerOffsetY: 4, rowHeight: 28, canHaveChildren: true }),
    ).toBe("before");
  });

  it("resolves bottom quarter to after", () => {
    expect(
      resolveUnifiedWorkspaceDropZone({ pointerOffsetY: 24, rowHeight: 28, canHaveChildren: true }),
    ).toBe("after");
  });

  it("resolves the middle half to inside when the target can have children", () => {
    expect(
      resolveUnifiedWorkspaceDropZone({ pointerOffsetY: 14, rowHeight: 28, canHaveChildren: true }),
    ).toBe("inside");
  });

  it("falls back to after in the middle of a leaf", () => {
    expect(
      resolveUnifiedWorkspaceDropZone({
        pointerOffsetY: 14,
        rowHeight: 28,
        canHaveChildren: false,
      }),
    ).toBe("after");
  });

  it("clamps pointer offsets outside the row bounds", () => {
    expect(
      resolveUnifiedWorkspaceDropZone({
        pointerOffsetY: -100,
        rowHeight: 28,
        canHaveChildren: true,
      }),
    ).toBe("before");
    expect(
      resolveUnifiedWorkspaceDropZone({
        pointerOffsetY: 1000,
        rowHeight: 28,
        canHaveChildren: true,
      }),
    ).toBe("after");
  });

  it("treats a zero-height row as fully inside/after by canHaveChildren", () => {
    expect(
      resolveUnifiedWorkspaceDropZone({ pointerOffsetY: 0, rowHeight: 0, canHaveChildren: true }),
    ).toBe("inside");
    expect(
      resolveUnifiedWorkspaceDropZone({ pointerOffsetY: 0, rowHeight: 0, canHaveChildren: false }),
    ).toBe("after");
  });
});

describe("canDropUnifiedWorkspaceNode", () => {
  it("rejects dropping a node onto itself", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "folder",
        targetNodeId: "folder",
        zone: "after",
      }),
    ).toBe(false);
  });

  it("rejects an immovable dragged node", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "immovable",
        targetNodeId: "sibling-file",
        zone: "after",
      }),
    ).toBe(false);
  });

  it("rejects dropping inside a leaf target", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "sibling-file",
        targetNodeId: "child-file",
        zone: "inside",
      }),
    ).toBe(false);
  });

  it("rejects dropping inside a broken reference", () => {
    const index = buildUnifiedWorkspaceNodeIndex([
      ...buildFixtureTree(),
      node({ id: "broken-folder", kind: "folder", canHaveChildren: true, isBroken: true }),
    ]);
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "sibling-file",
        targetNodeId: "broken-folder",
        zone: "inside",
      }),
    ).toBe(false);
  });

  it("rejects a descendant cycle (dropping a container into its own descendant)", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "folder",
        targetNodeId: "child-thread",
        zone: "inside",
      }),
    ).toBe(false);
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "folder",
        targetNodeId: "terminal",
        zone: "after",
      }),
    ).toBe(false);
  });

  it("allows a legal reparent", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "sibling-file",
        targetNodeId: "folder",
        zone: "inside",
      }),
    ).toBe(true);
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "sibling-file",
        targetNodeId: "child-file",
        zone: "before",
      }),
    ).toBe(true);
  });

  it("is false for an unknown dragged or target id", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "ghost",
        targetNodeId: "folder",
        zone: "after",
      }),
    ).toBe(false);
    expect(
      canDropUnifiedWorkspaceNode({
        index,
        draggedNodeId: "folder",
        targetNodeId: "ghost",
        zone: "after",
      }),
    ).toBe(false);
  });
});

describe("canDropUnifiedWorkspaceNodeAtRoot", () => {
  it("allows a nested, movable node to drop at root", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(canDropUnifiedWorkspaceNodeAtRoot({ index, draggedNodeId: "child-file" })).toBe(true);
  });

  it("rejects a node that is already at root", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(canDropUnifiedWorkspaceNodeAtRoot({ index, draggedNodeId: "folder" })).toBe(false);
  });

  it("rejects an immovable node", () => {
    const index = buildUnifiedWorkspaceNodeIndex([
      node({
        id: "root",
        canHaveChildren: true,
        children: [node({ id: "pinned", parentId: "root", canMove: false })],
      }),
    ]);
    expect(canDropUnifiedWorkspaceNodeAtRoot({ index, draggedNodeId: "pinned" })).toBe(false);
  });
});

describe("resolveMoveTargetForDrop", () => {
  it("resolves an inside drop to append as a child", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      resolveMoveTargetForDrop({
        index,
        draggedNodeId: "sibling-file",
        targetNodeId: "folder",
        zone: "inside",
      }),
    ).toEqual({ nodeId: "sibling-file", parentId: "folder", beforeId: null });
  });

  it("resolves a before drop to the target's own id", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      resolveMoveTargetForDrop({
        index,
        draggedNodeId: "sibling-file",
        targetNodeId: "child-thread",
        zone: "before",
      }),
    ).toEqual({ nodeId: "sibling-file", parentId: "folder", beforeId: "child-thread" });
  });

  it("resolves an after drop to the next sibling", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      resolveMoveTargetForDrop({
        index,
        draggedNodeId: "broken",
        targetNodeId: "child-file",
        zone: "after",
      }),
    ).toEqual({ nodeId: "broken", parentId: "folder", beforeId: "child-thread" });
  });

  it("resolves an after drop on the last sibling to append at the end", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      resolveMoveTargetForDrop({
        index,
        draggedNodeId: "sibling-file",
        targetNodeId: "child-thread",
        zone: "after",
      }),
    ).toEqual({ nodeId: "sibling-file", parentId: "folder", beforeId: null });
  });

  it("skips the dragged node's own current slot when computing the next sibling", () => {
    // siblings under root: [folder, sibling-file, broken, immovable]. Dragging
    // "sibling-file" to "after folder" must resolve to "broken" (skipping
    // sibling-file's own current position), not to itself.
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      resolveMoveTargetForDrop({
        index,
        draggedNodeId: "sibling-file",
        targetNodeId: "folder",
        zone: "after",
      }),
    ).toEqual({ nodeId: "sibling-file", parentId: null, beforeId: "broken" });
  });

  it("returns null for an unknown target", () => {
    const index = buildUnifiedWorkspaceNodeIndex(buildFixtureTree());
    expect(
      resolveMoveTargetForDrop({
        index,
        draggedNodeId: "sibling-file",
        targetNodeId: "ghost",
        zone: "after",
      }),
    ).toBeNull();
  });

  it("root gutter drop always appends at root with no parent", () => {
    expect(resolveMoveTargetForRootGutterDrop("child-file")).toEqual({
      nodeId: "child-file",
      parentId: null,
      beforeId: null,
    });
  });
});

describe("unifiedWorkspaceRowIndentStyle", () => {
  it("builds the exact calc() formula from §12.4", () => {
    expect(unifiedWorkspaceRowIndentStyle(0)).toEqual({
      paddingInlineStart: "calc(0.375rem + 0 * var(--uw-tree-indent))",
    });
    expect(unifiedWorkspaceRowIndentStyle(3)).toEqual({
      paddingInlineStart: "calc(0.375rem + 3 * var(--uw-tree-indent))",
    });
  });
});

describe("ARIA live-region announcements", () => {
  it("announces pickup", () => {
    expect(buildUnifiedWorkspaceDragAnnouncement({ phase: "start", draggedLabel: "auth.ts" })).toBe(
      "Picked up auth.ts.",
    );
  });

  it("announces a hover target and zone", () => {
    expect(
      buildUnifiedWorkspaceDragAnnouncement({
        phase: "over",
        draggedLabel: "auth.ts",
        targetLabel: "src",
        zone: "inside",
      }),
    ).toBe("auth.ts will drop into src.");
    expect(
      buildUnifiedWorkspaceDragAnnouncement({
        phase: "over",
        draggedLabel: "auth.ts",
        targetLabel: "Fix bug",
        zone: "before",
      }),
    ).toBe("auth.ts will drop before Fix bug.");
  });

  it("announces hovering the root gutter", () => {
    expect(
      buildUnifiedWorkspaceDragAnnouncement({
        phase: "over",
        draggedLabel: "auth.ts",
        targetLabel: null,
      }),
    ).toBe("auth.ts is over the root of the tree.");
  });

  it("announces cancellation", () => {
    expect(
      buildUnifiedWorkspaceDragAnnouncement({ phase: "cancel", draggedLabel: "auth.ts" }),
    ).toBe("Move cancelled for auth.ts.");
  });

  it("announces a successful drop result", () => {
    expect(
      buildUnifiedWorkspaceDropResultAnnouncement({ draggedLabel: "auth.ts", result: "success" }),
    ).toBe("Moved auth.ts.");
  });

  it("announces a rejected drop result with a reason when given one", () => {
    expect(
      buildUnifiedWorkspaceDropResultAnnouncement({
        draggedLabel: "auth.ts",
        result: "rejected",
        reason: "cross-project moves are not supported",
      }),
    ).toBe("Could not move auth.ts: cross-project moves are not supported");
    expect(
      buildUnifiedWorkspaceDropResultAnnouncement({ draggedLabel: "auth.ts", result: "rejected" }),
    ).toBe("Could not move auth.ts.");
  });
});

describe("buildUnifiedWorkspaceContextMenuItems", () => {
  const ids = (node: UnifiedWorkspaceNode) =>
    buildUnifiedWorkspaceContextMenuItems({ node }).map((item) => item.id);

  it("file: open, copy path, add to chat, plus common items", () => {
    const file = node({ id: "f", kind: "file" });
    expect(ids(file)).toEqual([
      "open",
      "copy-relative-path",
      "add-to-chat",
      "move-to",
      "rename",
      "remove",
    ]);
  });

  it("folder: open-in-files instead of open, and new-child-thread since it can have children", () => {
    const folder = node({ id: "d", kind: "folder", canHaveChildren: true });
    expect(ids(folder)).toEqual([
      "open-in-files",
      "copy-relative-path",
      "add-to-chat",
      "move-to",
      "new-child-thread",
      "rename",
      "remove",
    ]);
  });

  it("thread: preserves mark-unread/archive/copy-id/delete and adds move-to/new-child-thread", () => {
    const thread = node({ id: "t", kind: "thread", canHaveChildren: true });
    expect(ids(thread)).toEqual([
      "open",
      "mark-unread",
      "move-to",
      "new-child-thread",
      "rename",
      "archive-thread",
      "remove",
      "copy-thread-id",
      "delete-thread",
    ]);
  });

  it("terminal: open + close-live, no move-to/remove for a non-persistent live node", () => {
    const terminal = node({
      id: "term",
      kind: "terminal",
      canMove: false,
      canRename: false,
      canRemove: false,
    });
    expect(ids(terminal)).toEqual(["open", "close-live"]);
  });

  it("browser: open, pin, copy url, open externally, close tab", () => {
    const browser = node({
      id: "b",
      kind: "browser",
      canMove: false,
      canRename: false,
      canRemove: false,
    });
    expect(ids(browser)).toEqual([
      "open",
      "pin-shortcut",
      "copy-url",
      "open-externally",
      "close-live",
    ]);
  });

  it("command: run, plus move-to/remove when allowed", () => {
    const command = node({ id: "c", kind: "command", canRename: false });
    expect(ids(command)).toEqual(["run", "move-to", "remove"]);
  });

  it("url: open, copy url, open externally, plus common items", () => {
    const url = node({ id: "u", kind: "url" });
    expect(ids(url)).toEqual([
      "open",
      "copy-url",
      "open-externally",
      "move-to",
      "rename",
      "remove",
    ]);
  });

  it("omits move-to/rename/remove when the node forbids them", () => {
    const locked = node({ id: "locked", kind: "file", canMove: false, canRename: false });
    const items = buildUnifiedWorkspaceContextMenuItems({
      node: { ...locked, canRemove: false },
    });
    expect(items.map((item) => item.id)).toEqual(["open", "copy-relative-path", "add-to-chat"]);
  });

  it("marks thread delete as destructive with a trash icon", () => {
    const thread = node({ id: "t", kind: "thread" });
    const deleteItem = buildUnifiedWorkspaceContextMenuItems({ node: thread }).find(
      (item) => item.id === "delete-thread",
    );
    expect(deleteItem).toMatchObject({ destructive: true, icon: "trash" });
  });
});
