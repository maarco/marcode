import { describe, expect, it, vi } from "vite-plus/test";

import { activateUnifiedWorkspaceNode, type UnifiedWorkspaceActivationOps } from "./activateNode";
import { indexUnifiedWorkspaceNodesById } from "./treeOperations";
import type { UnifiedWorkspaceNode } from "./types";

function node(
  overrides: Partial<UnifiedWorkspaceNode> & Pick<UnifiedWorkspaceNode, "id" | "activation">,
): UnifiedWorkspaceNode {
  return {
    kind: "file",
    label: overrides.id,
    parentId: null,
    depth: 0,
    children: [],
    isLive: false,
    isAmbient: false,
    isBroken: false,
    canHaveChildren: false,
    canMove: true,
    canRename: false,
    canRemove: false,
    status: null,
    ...overrides,
  };
}

function makeOps(): UnifiedWorkspaceActivationOps &
  Record<keyof UnifiedWorkspaceActivationOps, ReturnType<typeof vi.fn>> {
  return {
    navigateToThread: vi.fn(),
    ensureDraftThread: vi.fn(() => ({ draftId: "draft-new", threadId: "thread-new" })),
    openFile: vi.fn(),
    openFilesSurface: vi.fn(),
    openTerminal: vi.fn(),
    openBrowser: vi.fn(),
    runCommand: vi.fn(),
    openUrlInPreview: vi.fn(),
    openUrlExternally: vi.fn(),
  } as unknown as UnifiedWorkspaceActivationOps &
    Record<keyof UnifiedWorkspaceActivationOps, ReturnType<typeof vi.fn>>;
}

const EMPTY_CONTEXT = {
  nodesById: new Map<string, UnifiedWorkspaceNode>(),
  projectId: "proj-1",
  activeThreadId: null,
  activeThreadProjectId: null,
  threadRecencyById: new Map<string, string>(),
  validThreadIds: new Set<string>(),
  runtimeSupportsEmbeddedPreview: false,
};

describe("activateUnifiedWorkspaceNode — self-describing kinds", () => {
  it("thread: navigates only", () => {
    const ops = makeOps();
    const threadNode = node({
      id: "n1",
      kind: "thread",
      activation: { kind: "thread", threadId: "t1" },
    });
    activateUnifiedWorkspaceNode({ ...EMPTY_CONTEXT, node: threadNode, ops });
    expect(ops.navigateToThread).toHaveBeenCalledWith("t1");
    expect(ops.ensureDraftThread).not.toHaveBeenCalled();
  });

  it("terminal: navigates to the owning thread then opens the terminal", () => {
    const ops = makeOps();
    const terminalNode = node({
      id: "n1",
      kind: "terminal",
      activation: { kind: "terminal", threadId: "t1", terminalId: "term-1" },
    });
    activateUnifiedWorkspaceNode({ ...EMPTY_CONTEXT, node: terminalNode, ops });
    expect(ops.navigateToThread).toHaveBeenCalledWith("t1");
    expect(ops.openTerminal).toHaveBeenCalledWith("t1", "term-1");
  });

  it("browser: navigates to the owning thread then opens the tab", () => {
    const ops = makeOps();
    const browserNode = node({
      id: "n1",
      kind: "browser",
      activation: { kind: "browser", threadId: "t1", tabId: "tab-1" },
    });
    activateUnifiedWorkspaceNode({ ...EMPTY_CONTEXT, node: browserNode, ops });
    expect(ops.navigateToThread).toHaveBeenCalledWith("t1");
    expect(ops.openBrowser).toHaveBeenCalledWith("t1", "tab-1");
  });

  it("none: calls nothing", () => {
    const ops = makeOps();
    activateUnifiedWorkspaceNode({
      ...EMPTY_CONTEXT,
      node: node({ id: "n1", activation: { kind: "none" } }),
      ops,
    });
    for (const fn of Object.values(ops)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("activateUnifiedWorkspaceNode — file thread-context resolution (spec §8)", () => {
  const fileNode = node({
    id: "node:env-1:proj-1:file-a",
    activation: { kind: "file", relativePath: "src/a.ts" },
  });

  it("step 1: uses the active thread when it belongs to the same physical project", () => {
    const ops = makeOps();
    activateUnifiedWorkspaceNode({
      ...EMPTY_CONTEXT,
      node: fileNode,
      activeThreadId: "active-thread",
      activeThreadProjectId: "proj-1",
      ops,
    });
    expect(ops.navigateToThread).toHaveBeenCalledWith("active-thread");
    expect(ops.openFile).toHaveBeenCalledWith("active-thread", "src/a.ts");
    expect(ops.ensureDraftThread).not.toHaveBeenCalled();
  });

  it("ignores an active thread that belongs to a different physical project", () => {
    const ops = makeOps();
    activateUnifiedWorkspaceNode({
      ...EMPTY_CONTEXT,
      node: fileNode,
      activeThreadId: "active-thread",
      activeThreadProjectId: "some-other-project",
      ops,
    });
    expect(ops.navigateToThread).not.toHaveBeenCalledWith("active-thread");
    expect(ops.ensureDraftThread).toHaveBeenCalled();
  });

  it("step 2: falls back to the most recently active descendant thread", () => {
    const ops = makeOps();
    const descendantOld = node({
      id: "node:env-1:proj-1:thread-old",
      parentId: fileNode.id,
      activation: { kind: "thread", threadId: "t-old" },
    });
    const descendantNew = node({
      id: "node:env-1:proj-1:thread-new",
      parentId: fileNode.id,
      activation: { kind: "thread", threadId: "t-new" },
    });
    const fileWithChildren = { ...fileNode, children: [descendantOld, descendantNew] };
    const nodesById = indexUnifiedWorkspaceNodesById([fileWithChildren]);

    activateUnifiedWorkspaceNode({
      ...EMPTY_CONTEXT,
      node: fileWithChildren,
      nodesById,
      validThreadIds: new Set(["t-old", "t-new"]),
      threadRecencyById: new Map([
        ["t-old", "2026-01-01T00:00:00.000Z"],
        ["t-new", "2026-01-05T00:00:00.000Z"],
      ]),
      ops,
    });
    expect(ops.navigateToThread).toHaveBeenCalledWith("t-new");
    expect(ops.openFile).toHaveBeenCalledWith("t-new", "src/a.ts");
    expect(ops.ensureDraftThread).not.toHaveBeenCalled();
  });

  it("excludes descendant threads that are archived/deleted (not in validThreadIds)", () => {
    const ops = makeOps();
    const archivedDescendant = node({
      id: "node:env-1:proj-1:thread-archived",
      parentId: fileNode.id,
      activation: { kind: "thread", threadId: "t-archived" },
    });
    const fileWithChildren = { ...fileNode, children: [archivedDescendant] };
    const nodesById = indexUnifiedWorkspaceNodesById([fileWithChildren]);

    activateUnifiedWorkspaceNode({
      ...EMPTY_CONTEXT,
      node: fileWithChildren,
      nodesById,
      validThreadIds: new Set(), // archived thread excluded
      ops,
    });
    expect(ops.navigateToThread).not.toHaveBeenCalled();
    expect(ops.ensureDraftThread).toHaveBeenCalledWith({ parentId: fileNode.id });
  });

  it("step 3/4: falls back to ensureDraftThread, seeded with the file's own node id as placement", () => {
    const ops = makeOps();
    activateUnifiedWorkspaceNode({ ...EMPTY_CONTEXT, node: fileNode, ops });
    expect(ops.ensureDraftThread).toHaveBeenCalledWith({ parentId: fileNode.id });
    expect(ops.openFile).toHaveBeenCalledWith("thread-new", "src/a.ts");
  });

  it("an ambient file has no persisted entry to nest under, so its draft placement is null, not its own id", () => {
    const ops = makeOps();
    const ambientFileNode = node({
      id: "node:env-1:proj-1:ambient:src/a.ts",
      isAmbient: true,
      activation: { kind: "file", relativePath: "src/a.ts" },
    });
    activateUnifiedWorkspaceNode({ ...EMPTY_CONTEXT, node: ambientFileNode, ops });
    expect(ops.ensureDraftThread).toHaveBeenCalledWith({ parentId: null });
    expect(ops.openFile).toHaveBeenCalledWith("thread-new", "src/a.ts");
  });
});

describe("activateUnifiedWorkspaceNode — folder", () => {
  it("resolves thread context using the file rule and opens the files surface", () => {
    const ops = makeOps();
    const folderNode = node({
      id: "node:env-1:proj-1:folder-a",
      kind: "folder",
      activation: { kind: "folder", relativePath: "src" },
      canHaveChildren: true,
    });
    activateUnifiedWorkspaceNode({
      ...EMPTY_CONTEXT,
      node: folderNode,
      activeThreadId: "t1",
      activeThreadProjectId: "proj-1",
      ops,
    });
    expect(ops.openFilesSurface).toHaveBeenCalledWith("t1");
    expect(ops.openFile).not.toHaveBeenCalled();
  });

  it("an ambient folder has no persisted entry to nest under, so its draft placement is null, not its own id", () => {
    const ops = makeOps();
    const ambientFolderNode = node({
      id: "node:env-1:proj-1:ambient:src",
      kind: "folder",
      isAmbient: true,
      activation: { kind: "folder", relativePath: "src" },
      canHaveChildren: true,
    });
    activateUnifiedWorkspaceNode({ ...EMPTY_CONTEXT, node: ambientFolderNode, ops });
    expect(ops.ensureDraftThread).toHaveBeenCalledWith({ parentId: null });
    expect(ops.openFilesSurface).toHaveBeenCalledWith("thread-new");
  });
});

describe("activateUnifiedWorkspaceNode — command", () => {
  it("resolves thread context with no nesting placement and reuses runProjectScript via ops.runCommand", () => {
    const ops = makeOps();
    const commandNode = node({
      id: "node:env-1:proj-1:command-1",
      kind: "command",
      activation: { kind: "command", scriptId: "s1" },
    });
    activateUnifiedWorkspaceNode({ ...EMPTY_CONTEXT, node: commandNode, ops });
    expect(ops.ensureDraftThread).toHaveBeenCalledWith({ parentId: null });
    expect(ops.runCommand).toHaveBeenCalledWith("thread-new", "s1");
  });
});

describe("activateUnifiedWorkspaceNode — url", () => {
  const urlNode = node({
    id: "node:env-1:proj-1:url-1",
    kind: "url",
    activation: { kind: "url", url: "http://localhost:3000" },
  });

  it("opens embedded preview when the runtime supports it", () => {
    const ops = makeOps();
    activateUnifiedWorkspaceNode({
      ...EMPTY_CONTEXT,
      node: urlNode,
      activeThreadId: "t1",
      activeThreadProjectId: "proj-1",
      runtimeSupportsEmbeddedPreview: true,
      ops,
    });
    expect(ops.openUrlInPreview).toHaveBeenCalledWith("t1", "http://localhost:3000");
    expect(ops.openUrlExternally).not.toHaveBeenCalled();
  });

  it("falls back to opening externally on web", () => {
    const ops = makeOps();
    activateUnifiedWorkspaceNode({
      ...EMPTY_CONTEXT,
      node: urlNode,
      activeThreadId: "t1",
      activeThreadProjectId: "proj-1",
      runtimeSupportsEmbeddedPreview: false,
      ops,
    });
    expect(ops.openUrlExternally).toHaveBeenCalledWith("http://localhost:3000");
    expect(ops.openUrlInPreview).not.toHaveBeenCalled();
  });
});
