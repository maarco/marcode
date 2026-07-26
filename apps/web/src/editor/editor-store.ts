import { create } from "zustand";
import type { EnvironmentId } from "@t3tools/contracts";

// a non-file editor tab that renders a React view instead of Monaco.
// keeps Git surfaces (peer review, etc.) inside the editor's own stacking
// context so they never portal out behind the floating code pill.
export type EditorView =
  | {
      type: "peer-review";
      workspacePath: string;
      selectedFiles: string[];
      sourceBranch: string;
    }
  | {
      type: "tasks-db";
      mode: "table" | "schema" | "recent" | "graph" | "dependencies" | "diagnostics" | "select";
      table?: string;
    };

// shared file data (content is synced across panes showing same file)
/**
 * Environment-scoped reference to a project file. Identity = absolute `path`.
 * Content is NOT stored here — it lives in the shared atom layer
 * (`projectFileState`) so both the floating editor and the Files panel share
 * one buffer per file.
 */
export interface FileRef {
  /** Absolute path (identity + display). */
  readonly path: string;
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
  readonly name: string;
  readonly ext: string;
}

export interface FileData extends FileRef {
  pinned: boolean;
  view?: EditorView;
  /** HEAD content for diff view (sourced via the VCS subsystem in P4). */
  diffOriginal?: string;
  /**
   * Non-env virtual content for read-only tabs (commit patches). Transitional —
   * removed when the git panel is rewritten against the VCS subsystem in P4.
   */
  virtualContent?: string;
}

/** Build a {@link FileRef} from an absolute path within a workspace. */
export function makeFileRef(
  environmentId: EnvironmentId,
  cwd: string,
  absPath: string,
  name: string,
  ext: string,
): FileRef {
  const relativePath = absPath.startsWith(cwd)
    ? absPath.slice(cwd.length).replace(/^\/+/, "")
    : absPath;
  return { path: absPath, environmentId, cwd, relativePath, name, ext };
}

/**
 * Composite tab-identity key. `fileCache`/`pane.openPaths`/`pane.activePath`/
 * `dirtyKeys` are keyed by this, NOT by bare `path` — two different
 * environments can share the same absolute workspace path (e.g. both mount
 * at `/workspace`), and a bare-path key would silently repoint one
 * environment's open tab (cache entry, coordinator, dirty flag) onto
 * another's file. `FileRef.path`/`FileData.path` stay the bare path — that's
 * the display identity (tab label, breadcrumbs, Monaco/accent-color
 * lookups), not the storage identity.
 */
export function fileKey(environmentId: EnvironmentId, path: string): string {
  return `${environmentId}::${path}`;
}

/**
 * Inverse of {@link fileKey}: the bare path `key` refers to, but only if it
 * belongs to `environmentId` — null otherwise (including when `environmentId`
 * itself is null, e.g. no environment is currently active). Used wherever a
 * composite key from the store needs to be compared against bare paths
 * scoped to "the current environment" (e.g. the file tree, which only ever
 * shows one environment's files at a time).
 */
export function barePathForEnv(key: string, environmentId: EnvironmentId | null): string | null {
  if (environmentId === null) return null;
  const prefix = `${environmentId}::`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

// a single pane's view state (paths only, content from fileCache)
export interface EditorPane {
  id: string;
  openPaths: string[];
  activePath: string | null;
}

// split tree node - either a leaf (pane) or a branch (split)
export type SplitNode =
  | { type: "leaf"; paneId: string }
  | {
      type: "split";
      direction: "horizontal" | "vertical";
      first: SplitNode;
      second: SplitNode;
      sizePercent: number; // % of space given to first child
    };

export interface EditorConfig {
  fontSize: number;
  tabSize: number;
  wordWrap: "off" | "on" | "wordWrapColumn";
  minimap: boolean;
  lineNumbers: "on" | "off" | "relative";
  renderWhitespace: "none" | "boundary" | "all";
}

const EDITOR_CONFIG_KEY = "editor-config";
const OVERLAY_OPEN_KEY = "editor-overlay-open";
const DEFAULT_CONFIG: EditorConfig = {
  fontSize: 11,
  tabSize: 2,
  wordWrap: "on",
  minimap: false,
  lineNumbers: "on",
  renderWhitespace: "boundary",
};

function loadEditorConfig(): EditorConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const saved = localStorage.getItem(EDITOR_CONFIG_KEY);
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_CONFIG;
}

interface EditorStore {
  // shared file cache
  fileCache: Map<string, FileData>;

  // panes
  panes: EditorPane[];
  activePaneId: string;
  splitTree: SplitNode;

  // tree workspace path
  treeWorkspacePath: string | null;

  // sidebar view
  sidebarView: "files" | "search" | "config" | "git" | "db";
  setSidebarView: (view: "files" | "search" | "config" | "git" | "db") => void;
  searchPanelVisible: boolean;
  toggleSearchPanel: () => void;
  pendingReveal: {
    environmentId: EnvironmentId;
    path: string;
    line: number;
    column: number;
  } | null;
  setPendingReveal: (
    reveal: { environmentId: EnvironmentId; path: string; line: number; column: number } | null,
  ) => void;

  // cross-panel signal: bumped when a peer review is created/changed so the
  // Git panel can refresh its reviewer tracker even though the review UI now
  // lives in a detached editor tab (not a child of the panel).
  reviewsRevision: number;
  notifyReviewsChanged: () => void;

  // editor config
  editorConfig: EditorConfig;
  updateEditorConfig: (partial: Partial<EditorConfig>) => void;

  // pane-scoped actions. `key`/`path` params below are composite
  // fileKey(environmentId, path) identities, NOT bare paths — see fileKey.
  openFile: (paneId: string, ref: FileRef) => void;
  closeFile: (paneId: string, key: string) => void;
  /**
   * Close every open tab equal to, or nested under, `path` within
   * `environmentId` — across every pane, not just one. Used when a
   * file-tree mutation (delete/rename) removes a file or directory out from
   * under the editor: a stale tab left open in ANY pane can still trigger
   * FileSaveCoordinator's dispose()-flush and resurrect the old location.
   * Returns each closed tab's bare path paired with the pane it was the
   * ACTIVE tab in (if any), so a rename can reopen the corresponding new
   * path there.
   */
  closeFilesUnder: (
    environmentId: EnvironmentId,
    path: string,
  ) => Array<{ path: string; activeInPaneId: string | null }>;
  setActiveFile: (paneId: string, key: string) => void;
  pinFile: (key: string) => void;

  // diff view (HEAD original; working content comes from the atom layer)
  openDiffFile: (paneId: string, ref: FileRef, original: string) => void;
  // read-only virtual tab carrying its own content (commit patches); transitional
  openVirtualFile: (paneId: string, path: string, name: string, content: string) => void;

  // non-file view tab (peer review, etc.) — keyed by a synthetic path so it
  // participates in the normal tab lifecycle (activate/close/reorder).
  openView: (paneId: string, key: string, name: string, view: EditorView) => void;

  // reorder tabs
  reorderFiles: (paneId: string, fromIndex: number, toIndex: number) => void;

  // pane management
  splitRight: (paneId: string) => void;
  splitDown: (paneId: string) => void;
  setActivePane: (paneId: string) => void;
  closePane: (paneId: string) => void;

  // workspace
  setTreeWorkspacePath: (path: string) => void;
  environmentId: EnvironmentId | null;
  setEnvironmentId: (id: EnvironmentId | null) => void;

  // dirty tracking — driven by the shared file-state layer's onPendingChange.
  // keyed by the composite fileKey (matches pane.openPaths / fileCache keys).
  dirtyKeys: Set<string>;
  setFileDirty: (key: string, dirty: boolean) => void;

  // floating overlay
  isOverlayOpen: boolean;
  openOverlay: () => void;
  closeOverlay: () => void;
  toggleOverlay: () => void;
}

// helper to replace a pane with a split in the tree
function replacePaneInTree(node: SplitNode, paneId: string, replacement: SplitNode): SplitNode {
  if (node.type === "leaf") {
    return node.paneId === paneId ? replacement : node;
  }
  return {
    ...node,
    first: replacePaneInTree(node.first, paneId, replacement),
    second: replacePaneInTree(node.second, paneId, replacement),
  };
}

// helper to remove a pane from the tree
function removePaneFromTree(node: SplitNode, paneId: string): SplitNode | null {
  if (node.type === "leaf") {
    return node.paneId === paneId ? null : node;
  }
  const newFirst = removePaneFromTree(node.first, paneId);
  const newSecond = removePaneFromTree(node.second, paneId);

  if (!newFirst && !newSecond) return null;
  if (!newFirst) return newSecond;
  if (!newSecond) return newFirst;
  return { ...node, first: newFirst, second: newSecond };
}

let paneIdCounter = 0;
function generatePaneId(): string {
  return `pane-${++paneIdCounter}`;
}

export const useEditorStore = create<EditorStore>((set, get) => {
  const initialPane: EditorPane = {
    id: generatePaneId(),
    openPaths: [],
    activePath: null,
  };

  return {
    fileCache: new Map(),
    panes: [initialPane],
    activePaneId: initialPane.id,
    splitTree: { type: "leaf", paneId: initialPane.id },
    treeWorkspacePath: null,
    environmentId: null,
    dirtyKeys: new Set<string>(),
    setEnvironmentId: (id) => set({ environmentId: id }),
    setFileDirty: (path, dirty) =>
      set((s) => {
        if (dirty) {
          if (s.dirtyKeys.has(path)) return s;
          const next = new Set(s.dirtyKeys);
          next.add(path);
          return { dirtyKeys: next };
        }
        if (!s.dirtyKeys.has(path)) return s;
        const next = new Set(s.dirtyKeys);
        next.delete(path);
        return { dirtyKeys: next };
      }),
    sidebarView: "files" as const,
    setSidebarView: (view) => set({ sidebarView: view }),
    searchPanelVisible: false,
    pendingReveal: null,
    toggleSearchPanel: () =>
      set((s) => {
        const isSearch = s.sidebarView === "search";
        return {
          searchPanelVisible: !isSearch,
          sidebarView: isSearch ? "files" : "search",
        };
      }),
    setPendingReveal: (reveal) => set({ pendingReveal: reveal }),
    reviewsRevision: 0,
    notifyReviewsChanged: () => set((s) => ({ reviewsRevision: s.reviewsRevision + 1 })),
    editorConfig: loadEditorConfig(),
    updateEditorConfig: (partial) =>
      set((s) => {
        const next = { ...s.editorConfig, ...partial };
        try {
          localStorage.setItem(EDITOR_CONFIG_KEY, JSON.stringify(next));
        } catch {}
        return { editorConfig: next };
      }),

    openFile: (paneId, ref) => {
      const store = get();
      const pane = store.panes.find((p) => p.id === paneId);
      if (!pane) return;

      const key = fileKey(ref.environmentId, ref.path);

      // add or update file cache (content lives in the atom layer, not here)
      const existing = store.fileCache.get(key);
      const fileData: FileData = existing ? { ...existing, ...ref } : { ...ref, pinned: false };

      const newCache = new Map(store.fileCache);
      newCache.set(key, fileData);

      // update pane
      const newPanes = store.panes.map((p) => {
        if (p.id !== paneId) return p;
        if (p.openPaths.includes(key)) {
          // already open in this pane - just activate
          return { ...p, activePath: key };
        }
        // replace preview tab if exists, else add
        const previewIdx = p.openPaths.findIndex((k) => {
          const fd = store.fileCache.get(k);
          return fd && !fd.pinned;
        });
        const newOpenPaths = [...p.openPaths];
        if (previewIdx >= 0) {
          newOpenPaths[previewIdx] = key;
        } else {
          newOpenPaths.push(key);
        }
        return { ...p, openPaths: newOpenPaths, activePath: key };
      });

      set({ fileCache: newCache, panes: newPanes });
    },

    openDiffFile: (paneId, ref, original) => {
      const store = get();
      const pane = store.panes.find((p) => p.id === paneId);
      if (!pane) return;

      const key = fileKey(ref.environmentId, ref.path);

      // working/modified content is sourced from the atom layer; only the HEAD
      // original is carried here for the diff view.
      const fileData: FileData = { ...ref, pinned: false, diffOriginal: original };

      const newCache = new Map(store.fileCache);
      newCache.set(key, fileData);

      const newPanes = store.panes.map((p) => {
        if (p.id !== paneId) return p;
        if (p.openPaths.includes(key)) {
          return { ...p, activePath: key };
        }
        const previewIdx = p.openPaths.findIndex((k) => {
          const fd = store.fileCache.get(k);
          return fd && !fd.pinned;
        });
        const newOpenPaths = [...p.openPaths];
        if (previewIdx >= 0) {
          newOpenPaths[previewIdx] = key;
        } else {
          newOpenPaths.push(key);
        }
        return { ...p, openPaths: newOpenPaths, activePath: key };
      });

      set({ fileCache: newCache, panes: newPanes });
    },

    openVirtualFile: (paneId, path, name, content) => {
      const store = get();
      const pane = store.panes.find((p) => p.id === paneId);
      if (!pane) return;

      // read-only virtual tab (e.g. a commit patch) carrying its own content.
      // scoped to the current environment so two environments viewing
      // (e.g.) the same stash index don't collide on the same synthetic path.
      const environmentId = store.environmentId ?? ("" as EnvironmentId);
      const fileData: FileData = {
        path,
        environmentId,
        cwd: store.treeWorkspacePath ?? "",
        relativePath: name,
        name,
        ext: "diff",
        pinned: true,
        virtualContent: content,
      };
      const key = fileKey(environmentId, path);
      const newCache = new Map(store.fileCache);
      newCache.set(key, fileData);

      const newPanes = store.panes.map((p) => {
        if (p.id !== paneId) return p;
        if (p.openPaths.includes(key)) return { ...p, activePath: key };
        return { ...p, openPaths: [...p.openPaths, key], activePath: key };
      });

      set({ fileCache: newCache, panes: newPanes });
    },

    openView: (paneId, key, name, view) => {
      const store = get();
      const pane = store.panes.find((p) => p.id === paneId);
      if (!pane) return;

      // upsert the view tab (refreshes its payload if already open). pinned so
      // opening files never replaces it as a preview tab.
      const environmentId = store.environmentId ?? ("" as EnvironmentId);
      const fileData: FileData = {
        path: key,
        environmentId,
        cwd: store.treeWorkspacePath ?? "",
        relativePath: name,
        name,
        ext: "",
        pinned: true,
        view,
      };
      const cacheKey = fileKey(environmentId, key);
      const newCache = new Map(store.fileCache);
      newCache.set(cacheKey, fileData);

      const newPanes = store.panes.map((p) => {
        if (p.id !== paneId) return p;
        if (p.openPaths.includes(cacheKey)) return { ...p, activePath: cacheKey };
        return { ...p, openPaths: [...p.openPaths, cacheKey], activePath: cacheKey };
      });

      set({ fileCache: newCache, panes: newPanes });
    },

    closeFile: (paneId, key) => {
      const store = get();
      const pane = store.panes.find((p) => p.id === paneId);
      if (!pane) return;

      const newOpenPaths = pane.openPaths.filter((k) => k !== key);
      let newActivePath = pane.activePath;
      if (pane.activePath === key) {
        const idx = pane.openPaths.indexOf(key);
        newActivePath = newOpenPaths[Math.max(0, idx - 1)] ?? null;
      }

      const newPanes = store.panes.map((p) =>
        p.id === paneId ? { ...p, openPaths: newOpenPaths, activePath: newActivePath } : p,
      );

      // evict from cache if no pane holds this file anymore; clear its dirty flag too
      const stillOpen = newPanes.some((p) => p.openPaths.includes(key));
      const newCache = new Map(store.fileCache);
      let newDirtyKeys = store.dirtyKeys;
      if (!stillOpen) {
        newCache.delete(key);
        if (store.dirtyKeys.has(key)) {
          newDirtyKeys = new Set(store.dirtyKeys);
          newDirtyKeys.delete(key);
        }
      }

      // check if pane should be auto-closed (no files left and not the only pane)
      if (newOpenPaths.length === 0 && store.panes.length > 1) {
        set({ fileCache: newCache, dirtyKeys: newDirtyKeys });
        get().closePane(paneId);
      } else {
        set({ panes: newPanes, fileCache: newCache, dirtyKeys: newDirtyKeys });
      }
    },

    closeFilesUnder: (environmentId, path) => {
      const store = get();
      const targetKey = fileKey(environmentId, path);
      const prefix = `${targetKey}/`;
      const affected: Array<{ path: string; activeInPaneId: string | null }> = [];
      const seen = new Set<string>();
      for (const pane of store.panes) {
        for (const openKey of pane.openPaths) {
          if (openKey !== targetKey && !openKey.startsWith(prefix)) continue;
          if (seen.has(openKey)) continue;
          seen.add(openKey);
          const barePath = barePathForEnv(openKey, environmentId);
          if (barePath === null) continue; // unreachable given the prefix match above
          affected.push({ path: barePath, activeInPaneId: null });
        }
      }
      for (const entry of affected) {
        const entryKey = fileKey(environmentId, entry.path);
        for (const pane of store.panes) {
          if (!pane.openPaths.includes(entryKey)) continue;
          if (pane.activePath === entryKey) entry.activeInPaneId = pane.id;
          get().closeFile(pane.id, entryKey);
        }
      }
      return affected;
    },

    setActiveFile: (paneId, key) => {
      set((s) => ({
        panes: s.panes.map((p) => (p.id === paneId ? { ...p, activePath: key } : p)),
      }));
    },

    pinFile: (key) => {
      set((s) => {
        const newCache = new Map(s.fileCache);
        const existing = newCache.get(key);
        if (existing) {
          newCache.set(key, { ...existing, pinned: true });
        }
        return { fileCache: newCache };
      });
    },

    reorderFiles: (paneId, fromIndex, toIndex) => {
      set((s) => ({
        panes: s.panes.map((p) => {
          if (p.id !== paneId) return p;
          const newPaths = [...p.openPaths];
          const [moved] = newPaths.splice(fromIndex, 1);
          newPaths.splice(toIndex, 0, moved!);
          return { ...p, openPaths: newPaths };
        }),
      }));
    },

    splitRight: (paneId) => {
      const store = get();
      const currentPane = store.panes.find((p) => p.id === paneId);
      if (!currentPane) return;

      // create new pane with same file
      const newPane: EditorPane = {
        id: generatePaneId(),
        openPaths: [...currentPane.openPaths],
        activePath: currentPane.activePath,
      };

      const replacement: SplitNode = {
        type: "split",
        direction: "horizontal",
        first: { type: "leaf", paneId },
        second: { type: "leaf", paneId: newPane.id },
        sizePercent: 50,
      };

      set((s) => ({
        panes: [...s.panes, newPane],
        splitTree: replacePaneInTree(s.splitTree, paneId, replacement),
        activePaneId: newPane.id,
      }));
    },

    splitDown: (paneId) => {
      const store = get();
      const currentPane = store.panes.find((p) => p.id === paneId);
      if (!currentPane) return;

      const newPane: EditorPane = {
        id: generatePaneId(),
        openPaths: [...currentPane.openPaths],
        activePath: currentPane.activePath,
      };

      const replacement: SplitNode = {
        type: "split",
        direction: "vertical",
        first: { type: "leaf", paneId },
        second: { type: "leaf", paneId: newPane.id },
        sizePercent: 50,
      };

      set((s) => ({
        panes: [...s.panes, newPane],
        splitTree: replacePaneInTree(s.splitTree, paneId, replacement),
        activePaneId: newPane.id,
      }));
    },

    setActivePane: (paneId) => {
      set({ activePaneId: paneId });
    },

    closePane: (paneId) => {
      const store = get();
      if (store.panes.length === 1) return; // never close last pane

      const newTree = removePaneFromTree(store.splitTree, paneId);
      if (!newTree) return;

      const newPanes = store.panes.filter((p) => p.id !== paneId);
      const newActiveId = store.activePaneId === paneId ? newPanes[0]!.id : store.activePaneId;

      set({
        panes: newPanes,
        splitTree: newTree,
        activePaneId: newActiveId,
      });
    },

    setTreeWorkspacePath: (path) => set({ treeWorkspacePath: path }),

    // floating overlay
    isOverlayOpen: false,
    openOverlay: () => {
      try {
        localStorage.setItem(OVERLAY_OPEN_KEY, "true");
      } catch {}
      set({ isOverlayOpen: true });
    },
    closeOverlay: () => {
      try {
        localStorage.setItem(OVERLAY_OPEN_KEY, "false");
      } catch {}
      set({ isOverlayOpen: false });
    },
    toggleOverlay: () => {
      const next = !get().isOverlayOpen;
      try {
        localStorage.setItem(OVERLAY_OPEN_KEY, String(next));
      } catch {}
      set({ isOverlayOpen: next });
    },
  };
});

// selectors
// dirty state now lives in the shared atom layer; use `dirtyKeys` via the store
// (or `useProjectFile(...).isDirty` for a single file) instead.

// get pane data helper
export function usePane(paneId: string) {
  const panes = useEditorStore((s) => s.panes);
  const fileCache = useEditorStore((s) => s.fileCache);
  const pane = panes.find((p) => p.id === paneId);

  if (!pane) return { pane: null, openFiles: [], activeFile: null };

  const openFiles = pane.openPaths
    .map((path) => fileCache.get(path))
    .filter((f): f is FileData => f !== undefined);

  const activeFile = pane.activePath ? (fileCache.get(pane.activePath) ?? null) : null;

  return { pane, openFiles, activeFile };
}
