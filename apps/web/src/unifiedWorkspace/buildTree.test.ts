import {
  ThreadId,
  type ProjectEntry,
  type ProjectScript,
  type ProjectWorkspaceEntry,
  type ProjectWorkspaceItemId,
  type ProjectWorkspaceRank,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildUnifiedWorkspaceTree,
  EMPTY_AMBIENT_ENTRIES,
  EMPTY_EXPANDED_AMBIENT_DIRS,
  type UnifiedWorkspacePreviewTabInput,
  type UnifiedWorkspaceTerminalInput,
  type UnifiedWorkspaceThreadInput,
} from "./buildTree";
import { flattenUnifiedWorkspaceNodes, qualifyUnifiedWorkspaceNodeId } from "./treeOperations";

const ENV = "env-1";
const PROJECT = "proj-1";
const q = (itemId: string) => qualifyUnifiedWorkspaceNodeId(ENV, PROJECT, itemId);

function rank(value: string): ProjectWorkspaceRank {
  return value as ProjectWorkspaceRank;
}

function itemId(value: string): ProjectWorkspaceItemId {
  return value as ProjectWorkspaceItemId;
}

function fileEntry(input: {
  id: string;
  parentId: string | null;
  rank: string;
  relativePath: string;
  label?: string;
}): ProjectWorkspaceEntry {
  return {
    kind: "file",
    id: itemId(input.id),
    parentId: input.parentId ? itemId(input.parentId) : null,
    rank: rank(input.rank),
    relativePath: input.relativePath,
    ...(input.label ? { label: input.label } : {}),
  };
}

function folderEntry(input: {
  id: string;
  parentId: string | null;
  rank: string;
  relativePath: string;
}): ProjectWorkspaceEntry {
  return {
    kind: "folder",
    id: itemId(input.id),
    parentId: input.parentId ? itemId(input.parentId) : null,
    rank: rank(input.rank),
    relativePath: input.relativePath,
  };
}

function threadEntry(input: {
  id: string;
  parentId: string | null;
  rank: string;
  threadId: string;
}): ProjectWorkspaceEntry {
  return {
    kind: "thread",
    id: itemId(input.id),
    parentId: input.parentId ? itemId(input.parentId) : null,
    rank: rank(input.rank),
    threadId: ThreadId.make(input.threadId),
  };
}

function commandEntry(input: {
  id: string;
  parentId: string | null;
  rank: string;
  scriptId: string;
}): ProjectWorkspaceEntry {
  return {
    kind: "command",
    id: itemId(input.id),
    parentId: input.parentId ? itemId(input.parentId) : null,
    rank: rank(input.rank),
    scriptId: input.scriptId,
  };
}

/** Fixture for the flat disk listing `useProjectEntriesQuery` returns. */
function ambientEntry(path: string, kind: "file" | "directory" = "file"): ProjectEntry {
  return { path, kind };
}

function urlEntry(input: {
  id: string;
  parentId: string | null;
  rank: string;
  label: string;
  url: string;
}): ProjectWorkspaceEntry {
  return {
    kind: "url",
    id: itemId(input.id),
    parentId: input.parentId ? itemId(input.parentId) : null,
    rank: rank(input.rank),
    label: input.label,
    url: input.url,
  };
}

function thread(
  input: Partial<UnifiedWorkspaceThreadInput> & { threadId: string },
): UnifiedWorkspaceThreadInput {
  return {
    title: input.threadId,
    archivedAt: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    ...input,
  };
}

function script(input: Partial<ProjectScript> & { id: string }): ProjectScript {
  return {
    name: input.id,
    command: "echo hi",
    icon: "play",
    runOnWorktreeCreate: false,
    ...input,
  };
}

function baseInput(overrides: {
  layout?: ProjectWorkspaceEntry[];
  scripts?: ProjectScript[];
  threads?: UnifiedWorkspaceThreadInput[];
  terminals?: UnifiedWorkspaceTerminalInput[];
  previewTabs?: UnifiedWorkspacePreviewTabInput[];
  knownPaths?: ReadonlySet<string> | null;
  ambientEntries?: ProjectEntry[];
  ambientEntriesTruncated?: boolean;
  expandedAmbientDirs?: ReadonlySet<string>;
}) {
  return {
    environmentId: ENV,
    projectId: PROJECT,
    layout: overrides.layout ?? [],
    scripts: overrides.scripts ?? [],
    threads: overrides.threads ?? [],
    terminals: overrides.terminals ?? [],
    previewTabs: overrides.previewTabs ?? [],
    threadSortOrder: "updated_at" as const,
    knownPaths: overrides.knownPaths ?? null,
    ambientEntries: overrides.ambientEntries ?? EMPTY_AMBIENT_ENTRIES,
    ambientEntriesTruncated: overrides.ambientEntriesTruncated ?? false,
    expandedAmbientDirs: overrides.expandedAmbientDirs ?? EMPTY_EXPANDED_AMBIENT_DIRS,
  };
}

describe("buildUnifiedWorkspaceTree — basic shape", () => {
  it("renders a ranked root file with a qualified id and file activation", () => {
    const { roots, diagnostics } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [fileEntry({ id: "f1", parentId: null, rank: "a0", relativePath: "src/a.ts" })],
      }),
    );
    expect(diagnostics).toEqual([]);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({
      id: q("f1"),
      kind: "file",
      label: "a.ts",
      parentId: null,
      depth: 0,
      canHaveChildren: true,
      canMove: true,
      canRename: true,
      canRemove: true,
      activation: { kind: "file", relativePath: "src/a.ts" },
    });
  });

  it("orders siblings by rank, lexically", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [
          fileEntry({ id: "f-b", parentId: null, rank: "b0", relativePath: "b.ts" }),
          fileEntry({ id: "f-a", parentId: null, rank: "a0", relativePath: "a.ts" }),
        ],
      }),
    );
    expect(roots.map((n) => n.id)).toEqual([q("f-a"), q("f-b")]);
  });

  it("nests a thread under a folder and preserves depth", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [
          folderEntry({ id: "folder-1", parentId: null, rank: "a0", relativePath: "src" }),
          threadEntry({ id: "thread:t1", parentId: "folder-1", rank: "a0", threadId: "t1" }),
        ],
        threads: [thread({ threadId: "t1", title: "Fix bug" })],
      }),
    );
    expect(roots).toHaveLength(1);
    const folder = roots[0]!;
    expect(folder.depth).toBe(0);
    expect(folder.children).toHaveLength(1);
    expect(folder.children[0]).toMatchObject({
      id: q("thread:t1"),
      kind: "thread",
      label: "Fix bug",
      parentId: q("folder-1"),
      depth: 1,
      activation: { kind: "thread", threadId: "t1" },
    });
  });
});

describe("buildUnifiedWorkspaceTree — invalid persisted relationships", () => {
  it("falls back a missing parent to root and emits a diagnostic, staying visible", () => {
    const { roots, diagnostics } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [fileEntry({ id: "f1", parentId: "ghost", rank: "a0", relativePath: "a.ts" })],
      }),
    );
    expect(roots.map((n) => n.id)).toEqual([q("f1")]);
    expect(diagnostics).toEqual([
      { code: "missing-parent", nodeId: q("f1"), detail: expect.any(String) },
    ]);
  });

  it("falls back a parent pointing at a leaf (command) to root with invalid-target", () => {
    const { roots, diagnostics } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [
          commandEntry({ id: "cmd-1", parentId: null, rank: "a0", scriptId: "s1" }),
          fileEntry({ id: "f1", parentId: "cmd-1", rank: "a0", relativePath: "a.ts" }),
        ],
        scripts: [script({ id: "s1" })],
      }),
    );
    expect(roots.map((n) => n.id).toSorted()).toEqual([q("cmd-1"), q("f1")].toSorted());
    expect(diagnostics).toEqual([
      { code: "invalid-target", nodeId: q("f1"), detail: expect.any(String) },
    ]);
  });

  it("breaks a 2-cycle by rooting the first offender and leaves the tree otherwise intact", () => {
    const { roots, diagnostics } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [
          folderEntry({ id: "a", parentId: "b", rank: "a0", relativePath: "a" }),
          folderEntry({ id: "b", parentId: "a", rank: "a0", relativePath: "b" }),
        ],
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "cycle", nodeId: q("a") });
    // "a" rooted; "b" now nests correctly under the fixed "a".
    expect(roots.map((n) => n.id)).toEqual([q("a")]);
    expect(roots[0]!.children.map((n) => n.id)).toEqual([q("b")]);
  });

  it("dedupes duplicate entry ids, keeping the first and flagging the rest", () => {
    const { roots, diagnostics } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [
          fileEntry({ id: "f1", parentId: null, rank: "a0", relativePath: "first.ts" }),
          fileEntry({ id: "f1", parentId: null, rank: "b0", relativePath: "second.ts" }),
        ],
      }),
    );
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ activation: { kind: "file", relativePath: "first.ts" } });
    expect(diagnostics).toEqual([
      { code: "duplicate-id", nodeId: q("f1"), detail: expect.any(String) },
    ]);
  });
});

describe("buildUnifiedWorkspaceTree — stale and archived entries", () => {
  it("hides a thread entry whose thread was deleted, reparents its children to root, and flags it", () => {
    const { roots, diagnostics } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [
          threadEntry({ id: "thread:gone", parentId: null, rank: "a0", threadId: "gone" }),
          fileEntry({ id: "f1", parentId: "thread:gone", rank: "a0", relativePath: "a.ts" }),
        ],
        threads: [],
      }),
    );
    expect(roots.map((n) => n.id)).toEqual([q("f1")]);
    expect(diagnostics).toEqual([
      { code: "stale-entry", nodeId: q("thread:gone"), detail: expect.any(String) },
    ]);
  });

  it("hides an archived thread silently and reparents its children without a diagnostic", () => {
    const { roots, diagnostics } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [
          threadEntry({ id: "thread:t1", parentId: null, rank: "a0", threadId: "t1" }),
          fileEntry({ id: "f1", parentId: "thread:t1", rank: "a0", relativePath: "a.ts" }),
        ],
        threads: [thread({ threadId: "t1", archivedAt: "2026-01-01T00:00:00.000Z" })],
      }),
    );
    expect(roots.map((n) => n.id)).toEqual([q("f1")]);
    expect(diagnostics).toEqual([]);
  });

  it("hides a command entry whose script was deleted and flags it", () => {
    const { roots, diagnostics } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [commandEntry({ id: "cmd-1", parentId: null, rank: "a0", scriptId: "gone" })],
        scripts: [],
      }),
    );
    expect(roots).toEqual([]);
    expect(diagnostics).toEqual([
      { code: "stale-entry", nodeId: q("cmd-1"), detail: expect.any(String) },
    ]);
  });
});

describe("buildUnifiedWorkspaceTree — synthetic root entries", () => {
  it("every unarchived, non-deleted thread appears exactly once, even unplaced", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        threads: [
          thread({ threadId: "t1", updatedAt: "2026-01-01T00:00:00.000Z" }),
          thread({ threadId: "t2", updatedAt: "2026-01-02T00:00:00.000Z" }),
        ],
      }),
    );
    const threadNodes = flattenUnifiedWorkspaceNodes(roots).filter((n) => n.kind === "thread");
    expect(threadNodes).toHaveLength(2);
    // Most-recently-updated first, matching the existing sidebar sort.
    expect(threadNodes.map((n) => n.activation)).toEqual([
      { kind: "thread", threadId: "t2" },
      { kind: "thread", threadId: "t1" },
    ]);
  });

  it("does not duplicate a thread that is both placed and live", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [threadEntry({ id: "thread:t1", parentId: null, rank: "a0", threadId: "t1" })],
        threads: [thread({ threadId: "t1" })],
      }),
    );
    const threadNodes = flattenUnifiedWorkspaceNodes(roots).filter((n) => n.kind === "thread");
    expect(threadNodes).toHaveLength(1);
  });

  it("synthetic commands render in script-array order, before synthetic threads", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        scripts: [script({ id: "s2", name: "Second" }), script({ id: "s1", name: "First" })],
        threads: [thread({ threadId: "t1" })],
      }),
    );
    expect(roots.map((n) => n.kind)).toEqual(["command", "command", "thread"]);
    expect(roots.map((n) => n.label)).toEqual(["Second", "First", "t1"]);
  });

  it("archived/deleted threads do not produce synthetic root entries", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        threads: [
          thread({ threadId: "archived", archivedAt: "2026-01-01T00:00:00.000Z" }),
          thread({ threadId: "deleted", deletedAt: "2026-01-01T00:00:00.000Z" }),
        ],
      }),
    );
    expect(roots).toEqual([]);
  });
});

describe("buildUnifiedWorkspaceTree — live resources", () => {
  it("attaches live terminal and browser nodes under their owning thread, ordered by update time", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        threads: [thread({ threadId: "t1" })],
        terminals: [
          {
            threadId: "t1",
            terminalId: "term-2",
            label: "",
            hasRunningSubprocess: true,
            updatedAt: "2026-01-01T00:00:02.000Z",
            discoveredPort: null,
          },
        ],
        previewTabs: [
          {
            threadId: "t1",
            tabId: "tab-1",
            title: "Example",
            url: "https://example.com",
            loading: false,
            updatedAt: "2026-01-01T00:00:01.000Z",
          },
        ],
      }),
    );
    const threadNode = roots[0]!;
    expect(threadNode.children.map((n) => n.kind)).toEqual(["browser", "terminal"]);
    expect(threadNode.children[0]).toMatchObject({
      kind: "browser",
      label: "Example",
      isLive: true,
      canMove: false,
      status: { kind: "browser", tabId: "tab-1", loading: false },
      activation: { kind: "browser", threadId: "t1", tabId: "tab-1" },
    });
    expect(threadNode.children[1]).toMatchObject({
      kind: "terminal",
      label: "Terminal 2",
      isLive: true,
      status: { kind: "terminal", terminalId: "term-2", running: true },
      activation: { kind: "terminal", threadId: "t1", terminalId: "term-2" },
    });
  });

  it("prefers a discovered-port status over the running-terminal status", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        threads: [thread({ threadId: "t1" })],
        terminals: [
          {
            threadId: "t1",
            terminalId: "term-1",
            label: "",
            hasRunningSubprocess: true,
            updatedAt: "2026-01-01T00:00:00.000Z",
            discoveredPort: 5173,
          },
        ],
      }),
    );
    expect(roots[0]!.children[0]).toMatchObject({ status: { kind: "port", port: 5173 } });
  });
});

describe("buildUnifiedWorkspaceTree — broken path references", () => {
  it("flags a file as broken when the path index is loaded and misses it", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [fileEntry({ id: "f1", parentId: null, rank: "a0", relativePath: "missing.ts" })],
        knownPaths: new Set(["present.ts"]),
      }),
    );
    expect(roots[0]).toMatchObject({
      isBroken: true,
      status: { kind: "broken", relativePath: "missing.ts" },
      tooltip: "Path not found: missing.ts",
    });
  });

  it("does not flag anything broken while the path index has not loaded yet", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [fileEntry({ id: "f1", parentId: null, rank: "a0", relativePath: "missing.ts" })],
        knownPaths: null,
      }),
    );
    expect(roots[0]).toMatchObject({ isBroken: false, status: null });
  });

  it("does not flag a present path as broken", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [fileEntry({ id: "f1", parentId: null, rank: "a0", relativePath: "present.ts" })],
        knownPaths: new Set(["present.ts"]),
      }),
    );
    expect(roots[0]).toMatchObject({ isBroken: false, status: null });
  });
});

describe("buildUnifiedWorkspaceTree — leaf capability flags", () => {
  it("commands and urls cannot have children and are not live", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [
          commandEntry({ id: "cmd-1", parentId: null, rank: "a0", scriptId: "s1" }),
          urlEntry({
            id: "url-1",
            parentId: null,
            rank: "b0",
            label: "Local",
            url: "http://localhost:3000",
          }),
        ],
        scripts: [script({ id: "s1", name: "Build" })],
      }),
    );
    for (const node of roots) {
      expect(node.canHaveChildren).toBe(false);
      expect(node.isLive).toBe(false);
      expect(node.canMove).toBe(true);
    }
    const urlNode = roots.find((n) => n.kind === "url")!;
    expect(urlNode.canRename).toBe(true);
    expect(urlNode.iconUrl).toContain("google.com/s2/favicons");
    const commandNode = roots.find((n) => n.kind === "command")!;
    expect(commandNode.canRename).toBe(false);
    expect(commandNode.canRemove).toBe(true);
  });
});

describe("buildUnifiedWorkspaceTree — ambient disk nodes (spec override of §4)", () => {
  it("projects the workspace root's immediate children with no layout entries at all", () => {
    const { roots, diagnostics } = buildUnifiedWorkspaceTree(
      baseInput({
        ambientEntries: [ambientEntry("b-folder", "directory"), ambientEntry("a-file.ts")],
      }),
    );
    expect(diagnostics).toEqual([]);
    expect(roots.map((n) => n.activation)).toEqual([
      { kind: "folder", relativePath: "b-folder" },
      { kind: "file", relativePath: "a-file.ts" },
    ]);
    for (const n of roots) {
      expect(n).toMatchObject({
        isAmbient: true,
        isLive: true,
        isBroken: false,
        canMove: false,
        canRename: false,
        canRemove: false,
        status: null,
      });
    }
  });

  it("sorts ambient roots folders-before-files, alphabetically within each kind", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        ambientEntries: [
          ambientEntry("z.ts"),
          ambientEntry("b-dir", "directory"),
          ambientEntry("a.ts"),
          ambientEntry("a-dir", "directory"),
        ],
      }),
    );
    expect(roots.map((n) => n.label)).toEqual(["a-dir", "b-dir", "a.ts", "z.ts"]);
  });

  it("renders ambient roots after ranked/persisted roots and before synthetic commands/threads", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [fileEntry({ id: "f1", parentId: null, rank: "a0", relativePath: "attached.ts" })],
        scripts: [script({ id: "s1" })],
        threads: [thread({ threadId: "t1" })],
        ambientEntries: [ambientEntry("ambient.ts")],
      }),
    );
    expect(roots.map((n) => n.kind)).toEqual(["file", "file", "command", "thread"]);
    expect(roots.map((n) => n.isAmbient)).toEqual([false, true, false, false]);
  });

  it("a directory whose only disk child is attached elsewhere has nothing left to ambiently show", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({ ambientEntries: [ambientEntry("empty-dir", "directory")] }),
    );
    expect(roots[0]).toMatchObject({ canHaveChildren: false, children: [] });
  });

  it("an ambient file/folder's activation reuses the exact persisted shapes — no new activation kind", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({ ambientEntries: [ambientEntry("dir", "directory"), ambientEntry("file.ts")] }),
    );
    const folderNode = roots.find((n) => n.kind === "folder")!;
    const fileNode = roots.find((n) => n.kind === "file")!;
    expect(folderNode.activation).toEqual({ kind: "folder", relativePath: "dir" });
    expect(fileNode.activation).toEqual({ kind: "file", relativePath: "file.ts" });
  });
});

describe("buildUnifiedWorkspaceTree — ambient nodes are lazy, one directory level per expansion", () => {
  const nestedAmbientEntries = [
    ambientEntry("a", "directory"),
    ambientEntry("a/b.txt"),
    ambientEntry("a/c", "directory"),
    ambientEntry("a/c/d.txt"),
  ];

  it("does not materialize a directory's children until its own path is expanded", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({ ambientEntries: nestedAmbientEntries }),
    );
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({
      activation: { kind: "folder", relativePath: "a" },
      children: [],
      // Known (from the flat index) to have content, even though nothing is
      // materialized yet — the disclosure affordance is honest, not a lie.
      canHaveChildren: true,
    });
  });

  it("expanding a directory reveals only its own immediate children, not its grandchildren", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({ ambientEntries: nestedAmbientEntries, expandedAmbientDirs: new Set(["a"]) }),
    );
    const dirA = roots[0]!;
    expect(dirA.children.map((n) => n.activation)).toEqual([
      { kind: "folder", relativePath: "a/c" },
      { kind: "file", relativePath: "a/b.txt" },
    ]);
    const dirC = dirA.children[0]!;
    expect(dirC.canHaveChildren).toBe(true); // known non-empty...
    expect(dirC.children).toEqual([]); // ...but not itself expanded — no cascade
  });

  it("expanding a nested directory too reveals its own children, still one level at a time", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        ambientEntries: nestedAmbientEntries,
        expandedAmbientDirs: new Set(["a", "a/c"]),
      }),
    );
    const dirC = roots[0]!.children[0]!;
    expect(dirC.children.map((n) => n.activation)).toEqual([
      { kind: "file", relativePath: "a/c/d.txt" },
    ]);
  });
});

describe("buildUnifiedWorkspaceTree — attached path wins over its ambient projection", () => {
  it("renders a path exactly once when it is both attached and ambient", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [fileEntry({ id: "f1", parentId: null, rank: "a0", relativePath: "a.ts" })],
        ambientEntries: [ambientEntry("a.ts")],
      }),
    );
    const matches = flattenUnifiedWorkspaceNodes(roots).filter(
      (n) => n.activation.kind === "file" && n.activation.relativePath === "a.ts",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ id: q("f1"), isAmbient: false });
  });

  it("still ambiently projects an attached folder's other, un-attached disk children once expanded", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [folderEntry({ id: "folder-1", parentId: null, rank: "a0", relativePath: "src" })],
        ambientEntries: [ambientEntry("src/extra.ts")],
        expandedAmbientDirs: new Set(["src"]),
      }),
    );
    const folder = roots[0]!;
    expect(folder.id).toBe(q("folder-1"));
    expect(folder.children).toHaveLength(1);
    expect(folder.children[0]).toMatchObject({
      isAmbient: true,
      activation: { kind: "file", relativePath: "src/extra.ts" },
    });
  });

  it("an attached folder shows no ambient children until its own path is expanded", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [folderEntry({ id: "folder-1", parentId: null, rank: "a0", relativePath: "src" })],
        ambientEntries: [ambientEntry("src/extra.ts")],
      }),
    );
    expect(roots[0]!.children).toEqual([]);
  });

  it("a broken attached folder (path no longer on disk) projects nothing ambiently", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [folderEntry({ id: "folder-1", parentId: null, rank: "a0", relativePath: "src" })],
        ambientEntries: [ambientEntry("src/extra.ts")],
        knownPaths: new Set(["src/extra.ts"]), // "src" itself is absent => broken
        expandedAmbientDirs: new Set(["src"]),
      }),
    );
    expect(roots[0]).toMatchObject({ isBroken: true, children: [] });
  });
});

describe("buildUnifiedWorkspaceTree — regression: threads still appear exactly once alongside ambient nodes", () => {
  it("an unplaced thread appears exactly once even when ambient nodes are present", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        threads: [thread({ threadId: "t1" })],
        ambientEntries: [ambientEntry("a.ts"), ambientEntry("b-dir", "directory")],
      }),
    );
    const threadNodes = flattenUnifiedWorkspaceNodes(roots).filter((n) => n.kind === "thread");
    expect(threadNodes).toHaveLength(1);
  });

  it("a placed (attached) thread still appears exactly once when ambient nodes share the tree", () => {
    const { roots } = buildUnifiedWorkspaceTree(
      baseInput({
        layout: [threadEntry({ id: "thread:t1", parentId: null, rank: "a0", threadId: "t1" })],
        threads: [thread({ threadId: "t1" })],
        ambientEntries: [ambientEntry("a.ts")],
      }),
    );
    const threadNodes = flattenUnifiedWorkspaceNodes(roots).filter((n) => n.kind === "thread");
    expect(threadNodes).toHaveLength(1);
  });
});

describe("buildUnifiedWorkspaceTree — ambient index truncation", () => {
  it("emits a diagnostic (not a silent gap) when the disk index hit its cap", () => {
    const { diagnostics } = buildUnifiedWorkspaceTree(baseInput({ ambientEntriesTruncated: true }));
    expect(diagnostics).toEqual([
      { code: "index-truncated", nodeId: expect.any(String), detail: expect.any(String) },
    ]);
  });

  it("emits nothing when the index is not truncated", () => {
    const { diagnostics } = buildUnifiedWorkspaceTree(baseInput({}));
    expect(diagnostics).toEqual([]);
  });
});
