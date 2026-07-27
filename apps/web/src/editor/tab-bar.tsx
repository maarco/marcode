import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { CloseCircleFilled, ArrowRight1Filled, PeopleFilled } from "@aliimam/icons";
import { useEditorStore, usePane, fileKey, type FileData } from "./editor-store";
import { getFileAccentColor } from "./file-tree";
import { FLOATING_SURFACE_Z } from "./floating-surface-z";
import { flushProjectFile, flushProjectFileRef } from "~/state/projectFileState";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { showToast } from "./toast";

/** Last path segment, for the cross-workspace badge (see `isCrossWorkspace` below). */
function lastPathSegment(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.at(-1) ?? path;
}

interface TabBarProps {
  paneId: string;
  rootPath: string;
}

export function TabBar({ paneId, rootPath }: TabBarProps) {
  const { openFiles, activeFile, pane } = usePane(paneId);
  const setActiveFile = useEditorStore((s) => s.setActiveFile);
  const pinFile = useEditorStore((s) => s.pinFile);
  const closeFile = useEditorStore((s) => s.closeFile);
  const reorderFiles = useEditorStore((s) => s.reorderFiles);
  const dirtyKeys = useEditorStore((s) => s.dirtyKeys);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const tabRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragIndex === null || dragIndex === index) {
        setDropTarget(null);
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const insertAt = e.clientX < midX ? index : index + 1;
      setDropTarget(insertAt);
    },
    [dragIndex],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      e.preventDefault();
      if (dragIndex === null) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      let toIndex = e.clientX < midX ? index : index + 1;

      // adjust for removal shift
      if (dragIndex < toIndex) toIndex--;

      if (dragIndex !== toIndex) {
        reorderFiles(paneId, dragIndex, toIndex);
      }

      setDragIndex(null);
      setDropTarget(null);
    },
    [dragIndex, paneId, reorderFiles],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  // right-click "Copy path" — portal-based context menu, same pattern as
  // file-tree.tsx's tree-row menu (dismiss on outside click / Escape).
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileData } | null>(
    null,
  );

  const handleTabContextMenu = useCallback((e: React.MouseEvent, file: FileData) => {
    if (file.view) return; // no real path to copy for a view tab (peer review, etc.)
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

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

  const handleCopyPath = useCallback((file: FileData) => {
    setContextMenu(null);
    void writeTextToClipboard(file.relativePath, "file path").then(
      () => showToast({ type: "success", title: "Path copied", message: file.relativePath }),
      (error) =>
        showToast({
          type: "error",
          title: "Failed to copy path",
          message: error instanceof Error ? error.message : "An error occurred.",
        }),
    );
  }, []);

  if (!pane || openFiles.length === 0) return null;

  return (
    <>
      <div
        className="flex items-center gap-0 overflow-x-auto flex-1 min-w-0 scrollbar-hide"
        onDragOver={(e) => e.preventDefault()}
      >
        {openFiles.map((file, index) => {
          // reference equality: activeFile and each `file` here are both
          // fileCache.get(key) lookups against the SAME map within this
          // render, so this is correct (and env-collision-proof) regardless
          // of the underlying key format — unlike comparing .path, which two
          // different environments' same-path files would both share.
          const isActive = activeFile === file;
          const isView = !!file.view;
          // composite identity: two open tabs can share `file.path` if they
          // belong to different environments, so bare path alone can't be a
          // React list key or an identity passed back into the store.
          const key = fileKey(file.environmentId, file.path);
          const dirty = dirtyKeys.has(key);
          const accent = isView ? "#22d3ee" : getFileAccentColor(file.path, rootPath);
          const isDragging = dragIndex === index;
          const showDropBefore = dropTarget === index;
          const showDropAfter = dropTarget === index + 1 && index === openFiles.length - 1;

          // full breadcrumb path
          const rel = file.path.startsWith(rootPath)
            ? file.path.slice(rootPath.length + 1)
            : file.path;
          const display = rel;

          // A tab opened from a different worktree than the pill's current
          // root is otherwise visually indistinguishable from a local one —
          // see docs/specs/single-editing-surface.md, "Scope mismatch". The
          // tab's own content/save target are already correctly scoped
          // (fileKey is env+path); this only makes the divergence visible.
          const isCrossWorkspace = !isView && file.cwd !== rootPath;
          const workspaceLabel = isCrossWorkspace ? lastPathSegment(file.cwd) : null;

          return (
            <div
              key={key}
              ref={(el) => {
                if (el) tabRefs.current.set(index, el);
                else tabRefs.current.delete(index);
              }}
              role="button"
              tabIndex={0}
              draggable
              title={isCrossWorkspace ? file.path : undefined}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveFile(paneId, key)}
              onDoubleClick={() => pinFile(key)}
              onContextMenu={(e) => handleTabContextMenu(e, file)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setActiveFile(paneId, key);
              }}
              className={`relative flex items-center gap-1 px-2 py-0.5 text-[9px] shrink-0 cursor-pointer transition-all rounded-md group ${
                isDragging ? "opacity-40" : ""
              } ${isActive ? "text-white/80" : "text-white/30 hover:text-white/50 hover:bg-white/4"}`}
              style={
                isActive
                  ? {
                      background: `${accent}0a`,
                      boxShadow: `0 0 0 1px ${accent}15`,
                    }
                  : undefined
              }
            >
              {showDropBefore && (
                <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-white/40 rounded-full" />
              )}
              {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />}
              {isView ? (
                <span className="flex items-center gap-1 font-mono shrink-0">
                  <PeopleFilled className="h-2.5 w-2.5 shrink-0" style={{ color: accent }} />
                  <span className="text-white/70">{file.name}</span>
                </span>
              ) : (
                <>
                  <span
                    className={`flex items-center gap-0.5 font-mono ${!file.pinned ? "italic" : ""}`}
                  >
                    {display.split("/").map((seg, si, arr) => (
                      <span key={si} className="flex items-center gap-0.5 shrink-0">
                        {si > 0 && <ArrowRight1Filled className="h-2 w-2 text-white/15 shrink-0" />}
                        <span className={si === arr.length - 1 ? "text-white/70" : "text-white/30"}>
                          {seg}
                        </span>
                      </span>
                    ))}
                  </span>
                  {isCrossWorkspace && workspaceLabel && (
                    <span
                      className="shrink-0 px-1 py-px rounded-sm bg-white/[0.06] text-[8px] font-mono text-white/35"
                      title={file.cwd}
                    >
                      {workspaceLabel}
                    </span>
                  )}
                </>
              )}
              {dirty && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (file.environmentId && file.cwd && file.relativePath) {
                      void flushProjectFile(file.environmentId, file.cwd, file.relativePath);
                    }
                  }}
                  className="shrink-0 opacity-0 group-hover:opacity-80 hover:opacity-100 transition-all text-amber-400/70 hover:text-amber-400"
                  title="Save (Cmd+S)"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M3 3h7l3 3v7H3V3z" />
                    <path d="M5 3v3h5V3" />
                    <path d="M5 9h6v4H5V9z" />
                  </svg>
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // commit pending edits rather than prompting to discard them —
                  // see `flushProjectFileRef`. Same behaviour as editor-pane's
                  // Cmd+W.
                  if (dirty) flushProjectFileRef(file);
                  closeFile(paneId, key);
                }}
                className="shrink-0 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-all"
              >
                <CloseCircleFilled className="h-3 w-3" />
              </button>
              {showDropAfter && (
                <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-white/40 rounded-full" />
              )}
            </div>
          );
        })}
      </div>

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
            <ContextMenuItem label="Copy path" onClick={() => handleCopyPath(contextMenu.file)} />
          </div>,
          document.body,
        )}
    </>
  );
}

function ContextMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1 text-[11px] font-mono text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
    >
      {label}
    </button>
  );
}
