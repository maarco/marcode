import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  FolderFilled,
  FolderOpenFilled,
  ArrowDown1Filled,
  LocationCrossFilled,
  AddFilled,
  FolderAddFilled,
} from "@aliimam/icons";
import { useEditorStore, makeFileRef, fileKey, barePathForEnv } from "./editor-store";
import { FileTypeIcon, getFolderColor } from "./file-tree-visuals";
import { FLOATING_SURFACE_Z } from "./floating-surface-z";
import { WaveSpinner } from "./wave-spinner";
import { showToast } from "./toast";
import { cn } from "~/lib/utils";
import { useProjectEntriesQuery } from "~/components/files/projectFilesQueryState";
import { cancelProjectFile, clearProjectFileQueryData } from "~/state/projectFileState";
import { useAtomCommand } from "~/state/use-atom-command";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { vcsEnvironment } from "~/state/vcs";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { ProjectEntry } from "@t3tools/contracts";

/** Extract a user-facing message from a settled atom command result. */
function resultErrorMessage(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag === "Success") return null;
  if (isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.length > 0 ? error.message : "Operation failed";
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
  ext?: string;
}

interface FileTreeProps {
  workspacePath: string;
  filterOpen?: boolean;
  onFileSelect?: () => void;
}

export { getFileAccentColor, getFolderColor } from "./file-tree-visuals";

/**
 * Build the nested {@link FileNode} tree the floating editor renders from the
 * flat, recursive `ProjectEntry[]` list returned by the environment-scoped
 * `projects.listEntries` RPC. Paths are absolute (rooted at `cwd`) to match the
 * editor's identity model.
 */
export function entriesToTree(entries: readonly ProjectEntry[], cwd: string): FileNode[] {
  const root: FileNode[] = [];
  const dirs = new Map<string, FileNode>();

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of sorted) {
    const segments = entry.path.split("/");
    let siblings = root;
    let acc = cwd;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const isLast = i === segments.length - 1;
      acc = acc.endsWith("/") ? `${acc}${seg}` : `${acc}/${seg}`;

      if (!isLast) {
        let dir = dirs.get(acc);
        if (!dir) {
          dir = { name: seg, path: acc, type: "dir", children: [] };
          dirs.set(acc, dir);
          siblings.push(dir);
        }
        siblings = dir.children!;
        continue;
      }

      if (entry.kind === "directory") {
        if (!dirs.has(acc)) {
          dirs.set(acc, { name: seg, path: acc, type: "dir", children: [] });
          siblings.push(dirs.get(acc)!);
        }
      } else {
        const dot = seg.lastIndexOf(".");
        const ext = dot > 0 ? seg.slice(dot) : "";
        siblings.push({ name: seg, path: acc, type: "file", ext });
      }
    }
  }
  return root;
}

const EXPANDED_KEY = "editor-expanded-folders";

function loadExpanded(workspace: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const saved = localStorage.getItem(`${EXPANDED_KEY}-${workspace}`);
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set();
}

function saveExpanded(workspace: string, expanded: Set<string>) {
  try {
    localStorage.setItem(`${EXPANDED_KEY}-${workspace}`, JSON.stringify([...expanded]));
  } catch {}
}

// collect all ancestor folder paths for a file path within a tree
export function getAncestorPaths(filePath: string, tree: FileNode[]): string[] {
  const result: string[] = [];
  function walk(nodes: FileNode[], path: string[]): boolean {
    for (const node of nodes) {
      if (node.path === filePath) {
        result.push(...path);
        return true;
      }
      if (node.type === "dir" && node.children) {
        if (walk(node.children, [...path, node.path])) return true;
      }
    }
    return false;
  }
  walk(tree, []);
  return result;
}

export function FileTree({
  workspacePath,
  filterOpen: externalFilterOpen,
  onFileSelect,
}: FileTreeProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [panelHeights, setPanelHeights] = useState<Map<string, number>>(new Map());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const filterOpen = externalFilterOpen ?? false;

  const activePaneId = useEditorStore((s) => s.activePaneId);
  const panes = useEditorStore((s) => s.panes);
  const openFile = useEditorStore((s) => s.openFile);
  const closeFilesUnder = useEditorStore((s) => s.closeFilesUnder);
  const pinFile = useEditorStore((s) => s.pinFile);
  const setActiveFile = useEditorStore((s) => s.setActiveFile);
  const environmentId = useEditorStore((s) => s.environmentId);

  const createFileCmd = useAtomCommand(projectEnvironment.createFile);
  const renameFileCmd = useAtomCommand(projectEnvironment.renameFile);
  const deleteFileCmd = useAtomCommand(projectEnvironment.deleteFile);

  // env RPCs take workspace-relative paths; the tree works in absolute paths
  const toRelative = useCallback(
    (abs: string) =>
      abs.startsWith(workspacePath) ? abs.slice(workspacePath.length).replace(/^\/+/, "") : abs,
    [workspacePath],
  );

  const entriesQuery = useProjectEntriesQuery(environmentId, workspacePath);
  const refreshTree = entriesQuery.refresh;
  const loading = entriesQuery.isPending && tree.length === 0;
  const error = entriesQuery.error ?? "";

  // derive the nested tree from the flat entries list whenever it changes
  useEffect(() => {
    const entries = entriesQuery.data?.entries ?? [];
    setTree(entriesToTree(entries, workspacePath));
    if (entriesQuery.data) setInitialized(true);
  }, [entriesQuery.data, workspacePath]);

  const activePane = panes.find((p) => p.id === activePaneId);
  // composite key (env + path) of the pane's active tab, if any.
  const activeFilePath = activePane?.activePath ?? null;
  // ...and its BARE path, but only if that active tab belongs to THIS tree's
  // environment — this tree only ever shows one environment's files, so an
  // active tab from a different environment has nothing to match here.
  const activeBarePath =
    activeFilePath !== null ? barePathForEnv(activeFilePath, environmentId) : null;

  // hydrate expanded state from localStorage
  useEffect(() => {
    const saved = loadExpanded(workspacePath);
    if (saved.size > 0) setExpanded(saved);
  }, [workspacePath]);

  // persist expanded state
  useEffect(() => {
    if (initialized) saveExpanded(workspacePath, expanded);
  }, [expanded, workspacePath, initialized]);

  const fetchTree = useCallback(() => {
    refreshTree();
  }, [refreshTree]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const revealActiveFile = useCallback(() => {
    if (!activeBarePath || tree.length === 0) return;
    const ancestors = getAncestorPaths(activeBarePath, tree);
    if (ancestors.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const p of ancestors) next.add(p);
        return next;
      });
    }
    // scroll to active file after state update
    requestAnimationFrame(() => {
      const el = treeRef.current?.querySelector('[data-active="true"]');
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [activeBarePath, tree]);

  // Opening a file from a chat link, the workspace tree, quick open, or a
  // diff changes the editor tab outside this component. Mirror the manual
  // Reveal action for every such activation so the Files sidebar expands the
  // real ancestor folders and brings the opened file into view.
  useEffect(() => {
    revealActiveFile();
  }, [revealActiveFile]);

  const handleFileClick = useCallback(
    (node: FileNode) => {
      setSelectedPath(node.path);

      if (node.type === "dir") {
        toggleExpand(node.path);
        return;
      }

      if (!activePaneId || !environmentId) return;

      const key = fileKey(environmentId, node.path);
      const alreadyInPane = activePane?.openPaths.includes(key);
      if (alreadyInPane) {
        setActiveFile(activePaneId, key);
        onFileSelect?.();
        return;
      }

      // content loads lazily from the shared atom layer when the pane renders
      openFile(
        activePaneId,
        makeFileRef(environmentId, workspacePath, node.path, node.name, node.ext || ""),
      );
      onFileSelect?.();
    },
    [
      activePaneId,
      activePane,
      openFile,
      onFileSelect,
      setActiveFile,
      environmentId,
      workspacePath,
      toggleExpand,
    ],
  );

  const handleFileDoubleClick = useCallback(
    (node: FileNode) => {
      if (node.type === "file" && environmentId) pinFile(fileKey(environmentId, node.path));
    },
    [pinFile, environmentId],
  );

  // flattened, keyboard-navigable order of everything currently visible
  const flatRows = useMemo(() => {
    const dirs = tree.filter((n) => n.type === "dir");
    const files = tree.filter((n) => n.type === "file");
    return flattenVisibleFileRows(dirs, files, expanded, searchQuery);
  }, [tree, expanded, searchQuery]);

  // path -> node lookup, so keyboard nav can re-check expand/search state
  // the same way the render path does (via isDirExpanded), without duplicating it
  const nodesByPath = useMemo(() => {
    const map = new Map<string, FileNode>();
    function walk(nodes: FileNode[]) {
      for (const node of nodes) {
        map.set(node.path, node);
        if (node.children) walk(node.children);
      }
    }
    walk(tree);
    return map;
  }, [tree]);

  // keyboard nav: up/down move selection, left/right collapse/expand or step to parent/child
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      if (flatRows.length === 0) return;

      const currentIndex = flatRows.findIndex((r) => r.path === selectedPath);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, flatRows.length - 1);
        setSelectedPath(flatRows[nextIndex]!.path);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        setSelectedPath(flatRows[prevIndex]!.path);
      } else if (e.key === "ArrowRight") {
        if (currentIndex === -1) return;
        const row = flatRows[currentIndex]!;
        if (row.type !== "dir" || !row.hasChildren) return;
        e.preventDefault();
        const node = nodesByPath.get(row.path);
        const isOpen = node ? isDirExpanded(node, expanded, searchQuery) : false;
        if (!isOpen) {
          toggleExpand(row.path);
        } else {
          const child = flatRows[currentIndex + 1];
          if (child?.parentPath === row.path) setSelectedPath(child.path);
        }
      } else if (e.key === "ArrowLeft") {
        if (currentIndex === -1) return;
        const row = flatRows[currentIndex]!;
        const node = row.type === "dir" ? nodesByPath.get(row.path) : undefined;
        const isOpen = node ? isDirExpanded(node, expanded, searchQuery) : false;
        if (row.type === "dir" && row.hasChildren && isOpen) {
          e.preventDefault();
          toggleExpand(row.path);
        } else if (row.parentPath) {
          e.preventDefault();
          setSelectedPath(row.parentPath);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flatRows, selectedPath, expanded, searchQuery, toggleExpand, nodesByPath]);

  // keep the selected row scrolled into view (keyboard nav can move selection off-screen)
  useEffect(() => {
    if (!selectedPath) return;
    const el = treeRef.current?.querySelector(`[data-file-row-id="${CSS.escape(selectedPath)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedPath]);

  // follow the active file so keyboard nav starts from wherever the editor is
  // (e.g. a file opened via quick-open or a tab click, not just this tree).
  // selectedPath is compared against bare tree-node paths elsewhere, so this
  // must use activeBarePath (and only fires when the active tab is actually
  // in this tree's environment).
  useEffect(() => {
    if (activeBarePath) setSelectedPath(activeBarePath);
  }, [activeBarePath]);

  // context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileNode;
    parentPath: string;
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent, node: FileNode, parentPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, node, parentPath });
    },
    [],
  );

  // close context menu on click elsewhere or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const onClick = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  // inline create state
  const [inlineCreate, setInlineCreate] = useState<{
    parentDir: string;
    type: "file" | "dir";
  } | null>(null);
  const inlineRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inlineCreate) {
      // focus on next tick after render
      requestAnimationFrame(() => inlineRef.current?.focus());
    }
  }, [inlineCreate]);

  const refreshVcsStatus = useAtomCommand(vcsEnvironment.refreshStatus, { reportFailure: false });
  const statusQuery = useEnvironmentQuery(
    environmentId ? vcsEnvironment.status({ environmentId, input: { cwd: workspacePath } }) : null,
  );
  // VCS status carries working-tree files without a per-file M/A/D kind (see
  // docs/specs/editor-file-state-unification.md), so changed files get a
  // neutral "changed" badge rather than a specific (and potentially
  // misleading — e.g. "M" on a deleted or newly-added file) letter. Keyed by
  // absolute path to match tree node paths.
  const gitStatus = useMemo(() => {
    const files = statusQuery.data?.workingTree.files ?? [];
    const out: Record<string, string> = {};
    for (const file of files) {
      const abs = workspacePath.endsWith("/")
        ? `${workspacePath}${file.path}`
        : `${workspacePath}/${file.path}`;
      out[abs] = GIT_STATUS_CHANGED;
    }
    return out;
  }, [statusQuery.data, workspacePath]);
  const refreshGitStatus = useCallback(() => {
    if (environmentId) void refreshVcsStatus({ environmentId, input: { cwd: workspacePath } });
  }, [environmentId, workspacePath, refreshVcsStatus]);

  const commitInlineCreate = useCallback(
    async (name: string) => {
      if (!inlineCreate || !name.trim() || !environmentId) {
        setInlineCreate(null);
        return;
      }
      const parentRel = toRelative(inlineCreate.parentDir);
      const relativePath = parentRel ? `${parentRel}/${name.trim()}` : name.trim();
      const result = await createFileCmd({
        environmentId,
        input: {
          cwd: workspacePath,
          relativePath,
          kind: inlineCreate.type === "dir" ? "directory" : "file",
        },
      });
      const failure = resultErrorMessage(result);
      if (failure) {
        showToast({
          type: "error",
          title: `Failed to create ${inlineCreate.type === "dir" ? "folder" : "file"}`,
          message: failure,
        });
      } else {
        fetchTree();
        refreshGitStatus();
      }
      setInlineCreate(null);
    },
    [
      inlineCreate,
      environmentId,
      workspacePath,
      toRelative,
      createFileCmd,
      fetchTree,
      refreshGitStatus,
    ],
  );

  const handleCreateFile = useCallback(
    (parentDir: string) => {
      setInlineCreate({ parentDir, type: "file" });
      setContextMenu(null);
      // expand parent so the input is visible
      if (parentDir !== workspacePath) {
        setExpanded((prev) => new Set([...prev, parentDir]));
      }
    },
    [workspacePath],
  );

  const handleCreateFolder = useCallback(
    (parentDir: string) => {
      setInlineCreate({ parentDir, type: "dir" });
      setContextMenu(null);
      if (parentDir !== workspacePath) {
        setExpanded((prev) => new Set([...prev, parentDir]));
      }
    },
    [workspacePath],
  );

  // inline rename state
  const [inlineRename, setInlineRename] = useState<{ path: string; name: string } | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inlineRename)
      requestAnimationFrame(() => {
        renameRef.current?.focus();
        // select the name without extension for convenience
        const dot = inlineRename.name.lastIndexOf(".");
        renameRef.current?.setSelectionRange(0, dot > 0 ? dot : inlineRename.name.length);
      });
  }, [inlineRename]);

  const commitRename = useCallback(
    async (newName: string) => {
      if (
        !inlineRename ||
        !newName.trim() ||
        newName.trim() === inlineRename.name ||
        !environmentId
      ) {
        setInlineRename(null);
        return;
      }
      const trimmedNewName = newName.trim();
      const dir = inlineRename.path.slice(0, inlineRename.path.length - inlineRename.name.length);
      const newAbs = `${dir}${trimmedNewName}`;
      const oldPath = inlineRename.path;
      const result = await renameFileCmd({
        environmentId,
        input: {
          cwd: workspacePath,
          fromRelativePath: toRelative(oldPath),
          toRelativePath: toRelative(newAbs),
        },
      });
      const failure = resultErrorMessage(result);
      if (failure) {
        showToast({ type: "error", title: "Failed to rename", message: failure });
      } else {
        // Stop the pending autosave for every open tab at the old location —
        // the renamed node itself, or anything nested under it if it was a
        // directory — before closing. Otherwise a still-armed debounce, or
        // dispose() on unmount, can silently recreate content at the old
        // path. Reopen at the new path only if the renamed node itself
        // (not a nested sibling) was the active tab somewhere.
        const affected = closeFilesUnder(environmentId, oldPath);
        for (const entry of affected) {
          const relativePath = toRelative(entry.path);
          cancelProjectFile(environmentId, workspacePath, relativePath);
          clearProjectFileQueryData(environmentId, workspacePath, relativePath);
        }
        const renamedEntry = affected.find((entry) => entry.path === oldPath);
        if (renamedEntry?.activeInPaneId) {
          const dot = trimmedNewName.lastIndexOf(".");
          const ext = dot > 0 ? trimmedNewName.slice(dot) : "";
          openFile(
            renamedEntry.activeInPaneId,
            makeFileRef(environmentId, workspacePath, newAbs, trimmedNewName, ext),
          );
        }
        fetchTree();
        refreshGitStatus();
      }
      setInlineRename(null);
    },
    [
      inlineRename,
      environmentId,
      workspacePath,
      toRelative,
      renameFileCmd,
      fetchTree,
      refreshGitStatus,
      closeFilesUnder,
      openFile,
    ],
  );

  const handleRename = useCallback((oldPath: string, currentName: string) => {
    setInlineRename({ path: oldPath, name: currentName });
    setContextMenu(null);
  }, []);

  // inline delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ path: string; name: string } | null>(null);

  const handleDelete = useCallback((path: string, name: string) => {
    setDeleteConfirm({ path, name });
    setContextMenu(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm || !environmentId) return;
    const result = await deleteFileCmd({
      environmentId,
      input: { cwd: workspacePath, relativePath: toRelative(deleteConfirm.path) },
    });
    const failure = resultErrorMessage(result);
    if (failure) {
      showToast({ type: "error", title: "Failed to delete", message: failure });
    } else {
      // Stop the pending autosave for every open tab at (or nested under)
      // the deleted path before closing — otherwise a still-armed debounce,
      // or dispose() on unmount, can silently recreate the file. `writeFile`
      // has no existence check, so an unstopped coordinator resurrects
      // whatever was last in its buffer at the old path.
      const affected = closeFilesUnder(environmentId, deleteConfirm.path);
      for (const entry of affected) {
        const relativePath = toRelative(entry.path);
        cancelProjectFile(environmentId, workspacePath, relativePath);
        clearProjectFileQueryData(environmentId, workspacePath, relativePath);
      }
      fetchTree();
      refreshGitStatus();
    }
    setDeleteConfirm(null);
  }, [
    deleteConfirm,
    environmentId,
    workspacePath,
    toRelative,
    deleteFileCmd,
    fetchTree,
    refreshGitStatus,
    closeFilesUnder,
  ]);

  // focus filter input when opened
  useEffect(() => {
    if (filterOpen) filterRef.current?.focus();
  }, [filterOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <WaveSpinner size="sm" color="primary" animation="ripple" />
      </div>
    );
  }

  if (error) {
    return <div className="px-3 py-3 text-xs text-white/30">{error}</div>;
  }

  // separate dirs and files at root level
  const dirs = tree.filter((n) => n.type === "dir");
  const files = tree.filter((n) => n.type === "file");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* filter input - controlled by icon strip */}
      {filterOpen && (
        <div className="px-2 pt-1 pb-1 shrink-0 animate-in slide-in-from-top-1 duration-150">
          <input
            ref={filterRef}
            type="text"
            placeholder="filter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchQuery("");
            }}
            className="w-full h-5 px-2 text-[10px] font-mono bg-white/[0.03] rounded-md text-white/70 placeholder:text-white/20 outline-none shadow-[0_0_0_1px_rgba(255,255,255,0.06)] focus:shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-shadow"
          />
        </div>
      )}

      {/* tree toolbar */}
      <div className="flex items-center gap-1 px-2 py-0.5 shrink-0">
        <button
          onClick={() => handleCreateFile(workspacePath)}
          className="flex items-center justify-center w-5 h-5 rounded-sm text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
          title="New file"
        >
          <AddFilled className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleCreateFolder(workspacePath)}
          className="flex items-center justify-center w-5 h-5 rounded-sm text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
          title="New folder"
        >
          <FolderAddFilled className="h-3 w-3" />
        </button>
        <button
          onClick={collapseAll}
          className="flex items-center justify-center w-5 h-5 rounded-sm text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
          title="Collapse all"
        >
          <ArrowDown1Filled className="h-3 w-3 rotate-90" />
        </button>
        {activeBarePath && (
          <button
            onClick={revealActiveFile}
            className="flex items-center justify-center w-5 h-5 rounded-sm text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
            title="Reveal active file"
          >
            <LocationCrossFilled className="h-3 w-3" />
          </button>
        )}
        {/* the index itself can be truncated (more entries than were listed),
            distinct from a single file's 1MB read cap. A silently-partial
            tree looks like a complete listing — this is the only signal for
            it, since the pill is the only file surface now. */}
        {entriesQuery.data?.truncated && (
          <span
            className="ml-auto shrink-0 px-1 text-[10px] font-mono text-amber-400/70"
            title="This workspace has more files than the tree is showing."
          >
            partial
          </span>
        )}
      </div>

      {/* accordion folders */}
      <div ref={treeRef} className="flex-1 overflow-y-auto px-1 pb-1">
        {/* inline delete confirmation */}
        {deleteConfirm && (
          <div className="flex items-center gap-1.5 px-2 py-1 mb-0.5 bg-red-500/10 rounded">
            <span className="text-[10px] text-red-400/80 truncate flex-1">
              delete {deleteConfirm.name}?
            </span>
            <button
              onClick={confirmDelete}
              className="px-2 py-0.5 text-[10px] font-mono bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
              autoFocus
            >
              yes
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-2 py-0.5 text-[10px] font-mono text-white/40 rounded hover:bg-white/5 transition-colors"
            >
              no
            </button>
          </div>
        )}

        {/* inline rename input */}
        {inlineRename && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 mb-0.5">
            <span className="text-[10px] text-white/30 shrink-0">rename</span>
            <input
              ref={renameRef}
              type="text"
              defaultValue={inlineRename.name}
              className="flex-1 h-5 px-1.5 text-[11px] font-mono bg-white/[0.06] rounded text-white/80 placeholder:text-white/25 outline-none shadow-[0_0_0_1px_rgba(56,189,248,0.4)] focus:shadow-[0_0_0_1px_rgba(56,189,248,0.6)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitRename((e.target as HTMLInputElement).value);
                } else if (e.key === "Escape") {
                  setInlineRename(null);
                }
              }}
              onBlur={(e) => commitRename(e.target.value)}
            />
          </div>
        )}

        {/* inline create input */}
        {inlineCreate && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 mb-0.5">
            {inlineCreate.type === "dir" ? (
              <FolderFilled className="h-3 w-3 shrink-0 text-white/40" />
            ) : (
              <span className="w-3 h-3 shrink-0 flex items-center justify-center text-[9px] text-white/40">
                F
              </span>
            )}
            <input
              ref={inlineRef}
              type="text"
              placeholder={inlineCreate.type === "dir" ? "folder name..." : "file name..."}
              className="flex-1 h-5 px-1.5 text-[11px] font-mono bg-white/[0.06] rounded text-white/80 placeholder:text-white/25 outline-none shadow-[0_0_0_1px_rgba(56,189,248,0.4)] focus:shadow-[0_0_0_1px_rgba(56,189,248,0.6)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitInlineCreate((e.target as HTMLInputElement).value);
                } else if (e.key === "Escape") {
                  setInlineCreate(null);
                }
              }}
              onBlur={(e) => {
                // commit on blur if there's a value, otherwise cancel
                const val = e.target.value.trim();
                if (val) {
                  commitInlineCreate(val);
                } else {
                  setInlineCreate(null);
                }
              }}
            />
          </div>
        )}

        {dirs.map((dir) => (
          <AccordionFolder
            key={dir.path}
            node={dir}
            depth={0}
            expanded={expanded}
            activeFilePath={activeBarePath}
            selectedPath={selectedPath}
            searchQuery={searchQuery}
            panelHeights={panelHeights}
            setPanelHeights={setPanelHeights}
            gitStatus={gitStatus}
            workspacePath={workspacePath}
            onClick={handleFileClick}
            onDoubleClick={handleFileDoubleClick}
            onContextMenu={handleContextMenu}
          />
        ))}

        {/* root-level files */}
        {files.length > 0 && (
          <div className="mt-1">
            {files
              .filter((f) => matchesSearch(f, searchQuery))
              .map((file) => (
                <FileItem
                  key={file.path}
                  node={file}
                  isActive={activeBarePath === file.path}
                  isSelected={selectedPath === file.path}
                  gitIndicator={
                    gitStatus[
                      file.path.startsWith(workspacePath)
                        ? file.path.slice(workspacePath.length + 1)
                        : file.path
                    ]
                  }
                  onClick={handleFileClick}
                  onDoubleClick={handleFileDoubleClick}
                  onContextMenu={(e) => handleContextMenu(e, file, workspacePath)}
                />
              ))}
          </div>
        )}
      </div>

      {/* context menu - portal to body to avoid transform offset */}
      {contextMenu &&
        createPortal(
          <div
            data-editor-overlay
            role="menu"
            className="fixed min-w-[140px] py-1 rounded-md bg-[#1a1a1a] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.5)]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: FLOATING_SURFACE_Z.pillNavMenu,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.node.type === "dir" && (
              <>
                <ContextMenuItem
                  label="New file"
                  onClick={() => handleCreateFile(contextMenu.node.path)}
                />
                <ContextMenuItem
                  label="New folder"
                  onClick={() => handleCreateFolder(contextMenu.node.path)}
                />
                <div className="h-px mx-2 my-1 bg-white/[0.06]" />
              </>
            )}
            <ContextMenuItem
              label="Rename"
              onClick={() => handleRename(contextMenu.node.path, contextMenu.node.name)}
            />
            <ContextMenuItem
              label="Delete"
              onClick={() => handleDelete(contextMenu.node.path, contextMenu.node.name)}
              danger
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function ContextMenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1 text-[11px] font-mono transition-colors ${
        danger
          ? "text-red-400/70 hover:text-red-400 hover:bg-red-400/10"
          : "text-white/60 hover:text-white/80 hover:bg-white/[0.06]"
      }`}
    >
      {label}
    </button>
  );
}

function matchesSearch(node: FileNode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (node.name.toLowerCase().includes(q)) return true;
  if (node.type === "dir" && node.children) {
    return node.children.some((child) => matchesSearch(child, q));
  }
  return false;
}

// should this dir's children currently be shown (manually expanded, or
// auto-expanded because a search filter matched something inside it)?
function isDirExpanded(node: FileNode, expanded: Set<string>, searchQuery: string): boolean {
  const manuallyOpen = expanded.has(node.path);
  const autoExpand = searchQuery.length > 0 && matchesSearch(node, searchQuery);
  return manuallyOpen || autoExpand;
}

interface FlatFileRow {
  path: string;
  parentPath: string | null;
  type: "file" | "dir";
  hasChildren: boolean;
}

// flatten the visible tree (respecting collapse + search filter) into
// keyboard-nav order. mirrors the same dirs-then-files, filtered ordering
// the render path uses (dirs.map / childDirs.map / childFiles.map).
function flattenVisibleFileRows(
  dirs: FileNode[],
  files: FileNode[],
  expanded: Set<string>,
  searchQuery: string,
): FlatFileRow[] {
  const rows: FlatFileRow[] = [];

  function walkDir(node: FileNode, parentPath: string | null) {
    if (searchQuery && !matchesSearch(node, searchQuery)) return;
    const childDirs = node.children?.filter((c) => c.type === "dir") ?? [];
    const childFiles = node.children?.filter((c) => c.type === "file") ?? [];
    const hasChildren = childDirs.length > 0 || childFiles.length > 0;
    rows.push({ path: node.path, parentPath, type: "dir", hasChildren });
    if (hasChildren && isDirExpanded(node, expanded, searchQuery)) {
      for (const dir of childDirs) walkDir(dir, node.path);
      for (const file of childFiles) {
        if (matchesSearch(file, searchQuery)) {
          rows.push({ path: file.path, parentPath: node.path, type: "file", hasChildren: false });
        }
      }
    }
  }

  for (const dir of dirs) walkDir(dir, null);
  for (const file of files) {
    if (matchesSearch(file, searchQuery)) {
      rows.push({ path: file.path, parentPath: null, type: "file", hasChildren: false });
    }
  }

  return rows;
}

// ── accordion folder ──

interface AccordionFolderProps {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  activeFilePath: string | null;
  selectedPath: string | null;
  searchQuery: string;
  panelHeights: Map<string, number>;
  setPanelHeights: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  gitStatus: Record<string, string>;
  workspacePath: string;
  onClick: (node: FileNode) => void;
  onDoubleClick: (node: FileNode) => void;
  onContextMenu: (e: ReactMouseEvent, node: FileNode, parentPath: string) => void;
}

function AccordionFolder({
  node,
  depth,
  expanded,
  activeFilePath,
  selectedPath,
  searchQuery,
  panelHeights,
  setPanelHeights,
  gitStatus,
  workspacePath,
  onClick,
  onDoubleClick,
  onContextMenu,
}: AccordionFolderProps) {
  const isOpen = isDirExpanded(node, expanded, searchQuery);
  const isSelected = selectedPath === node.path;
  const color = getFolderColor(node.name);
  const childCount = node.children?.length ?? 0;
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  if (searchQuery && !matchesSearch(node, searchQuery)) return null;

  const childDirs = node.children?.filter((c) => c.type === "dir") ?? [];
  const childFiles = node.children?.filter((c) => c.type === "file") ?? [];

  // only constrain height on top-level folders (depth 0)
  // nested folders flow naturally within their parent
  const isTopLevel = depth === 0;
  const defaultMaxH = Math.min(Math.max(childCount * 26, 60), 200);
  const maxH = panelHeights.get(node.path) ?? defaultMaxH;

  const handleResizeStart = (e: ReactMouseEvent) => {
    if (!isTopLevel) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startY: e.clientY, startH: maxH };

    const onMove = (me: globalThis.MouseEvent) => {
      if (!dragRef.current) return;
      const delta = me.clientY - dragRef.current.startY;
      const newH = Math.max(40, dragRef.current.startH + delta);
      setPanelHeights((prev) => {
        const next = new Map(prev);
        next.set(node.path, newH);
        return next;
      });
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div className="mb-0.5">
      {/* folder header */}
      <button
        data-file-row-id={node.path}
        onClick={() => onClick(node)}
        onContextMenu={(e) => onContextMenu(e, node, node.path)}
        className={cn(
          "flex items-center gap-2 w-full px-2 py-0.5 rounded-md transition-all hover:bg-white/[0.04] group",
          isSelected && "bg-white/[0.06]",
        )}
        style={{ paddingLeft: 8 }}
      >
        <span className="shrink-0" style={{ color }}>
          {isOpen ? (
            <FolderOpenFilled className="h-3.5 w-3.5" />
          ) : (
            <FolderFilled className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="text-[11px] font-mono truncate text-white/60 group-hover:text-white/80 transition-colors">
          {node.name}
        </span>
        <span className="text-[9px] font-mono text-white/15 ml-auto shrink-0">{childCount}</span>
      </button>

      {/* expanded content */}
      {isOpen && (
        <div className="mx-1 mt-0.5">
          <div
            ref={contentRef}
            className={
              isTopLevel ? "overflow-y-auto overflow-x-hidden rounded-t-md" : "overflow-x-hidden"
            }
            style={isTopLevel ? { maxHeight: maxH } : undefined}
          >
            {childDirs.map((dir) => (
              <AccordionFolder
                key={dir.path}
                node={dir}
                depth={depth + 1}
                expanded={expanded}
                activeFilePath={activeFilePath}
                selectedPath={selectedPath}
                searchQuery={searchQuery}
                panelHeights={panelHeights}
                setPanelHeights={setPanelHeights}
                gitStatus={gitStatus}
                workspacePath={workspacePath}
                onClick={onClick}
                onDoubleClick={onDoubleClick}
                onContextMenu={onContextMenu}
              />
            ))}
            {childFiles
              .filter((f) => matchesSearch(f, searchQuery))
              .map((file) => (
                <FileItem
                  key={file.path}
                  node={file}
                  isActive={activeFilePath === file.path}
                  isSelected={selectedPath === file.path}
                  gitIndicator={
                    gitStatus[
                      file.path.startsWith(workspacePath)
                        ? file.path.slice(workspacePath.length + 1)
                        : file.path
                    ]
                  }
                  onClick={onClick}
                  onDoubleClick={onDoubleClick}
                  onContextMenu={(e) => onContextMenu(e, file, node.path)}
                />
              ))}
          </div>
          {/* resize handle - only for top-level folders */}
          {isTopLevel && (
            <div
              onMouseDown={handleResizeStart}
              className="h-1.5 cursor-row-resize rounded-b-md flex items-center justify-center hover:bg-white/[0.06] transition-colors"
            >
              <div className="w-8 h-px" style={{ background: "rgba(255,255,255,0.15)" }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── file item ──

// VcsStatusResult carries no per-file kind (see the comment on `gitStatus`
// below) — "•" is a neutral "changed" badge, distinct from "M"/"A"/"D"/"R"
// (which claim a specific kind this data doesn't have) and from "?" (which
// specifically means untracked).
const GIT_STATUS_CHANGED = "•";

const GIT_STATUS_COLORS: Record<string, string> = {
  M: "#e5a50a", // modified - amber
  A: "#22c55e", // added - green
  D: "#ef4444", // deleted - red
  "?": "#6b7280", // untracked - gray
  R: "#3b82f6", // renamed - blue
  [GIT_STATUS_CHANGED]: "#6b7280", // changed, kind unknown - neutral gray
};

interface FileItemProps {
  node: FileNode;
  isActive: boolean;
  isSelected?: boolean;
  gitIndicator?: string | undefined;
  onClick: (node: FileNode) => void;
  onDoubleClick: (node: FileNode) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
}

function FileItem({
  node,
  isActive,
  isSelected,
  gitIndicator,
  onClick,
  onDoubleClick,
  onContextMenu,
}: FileItemProps) {
  const gitColor = gitIndicator ? GIT_STATUS_COLORS[gitIndicator] : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      data-file-row-id={node.path}
      onClick={() => onClick(node)}
      onDoubleClick={() => onDoubleClick(node)}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick(node);
      }}
      data-active={isActive || undefined}
      className={cn(
        "flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-all relative rounded-sm",
        isActive ? "bg-white/[0.06]" : isSelected ? "bg-white/[0.04]" : "hover:bg-white/[0.03]",
      )}
      style={{ paddingLeft: 8 }}
    >
      {isActive && (
        <span className="absolute left-0.5 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[rgba(39,201,63,0.5)]" />
      )}
      <span className="shrink-0">
        <FileTypeIcon ext={node.ext || ""} size="xs" />
      </span>
      <span
        className={`text-[11px] font-mono truncate ${isActive ? "text-white/80" : "text-white/55"}`}
        style={gitColor ? { color: gitColor } : undefined}
      >
        {node.name}
      </span>
      {gitIndicator && (
        <span
          className="text-[8px] font-mono ml-auto shrink-0 font-bold"
          style={{ color: gitColor }}
        >
          {gitIndicator}
        </span>
      )}
    </div>
  );
}
