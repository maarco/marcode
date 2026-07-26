import { resolvePathLinkTarget } from "~/terminal-links";

import { getApiErrorMessage, unwrapApiData } from "./api";
import { useEditorStore } from "./editor-store";

export interface OpenFloatingFileInput {
  readonly workspacePath: string;
  readonly relativePath: string;
  readonly line?: number | undefined;
  readonly column?: number | undefined;
}

export interface FloatingFileTarget {
  readonly absolutePath: string;
  readonly name: string;
  readonly ext: string;
}

export function resolveFloatingFileTarget(
  workspacePath: string,
  relativePath: string,
): FloatingFileTarget {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const name = normalizedPath.split("/").filter(Boolean).at(-1) ?? normalizedPath;
  const dot = name.lastIndexOf(".");

  return {
    absolutePath: resolvePathLinkTarget(normalizedPath, workspacePath),
    name,
    ext: dot > 0 ? name.slice(dot) : "",
  };
}

/**
 * Open a workspace file in Marco's existing Monaco tab surface.
 *
 * The floating editor owns its tabs in `editor-store`; this bridge deliberately
 * uses that store instead of opening another right-panel file surface. The
 * existing floating editor's loader/save path remains the source of truth for
 * this short-term integration.
 */
export async function openFileInFloatingEditor(input: OpenFloatingFileInput): Promise<void> {
  const target = resolveFloatingFileTarget(input.workspacePath, input.relativePath);
  const store = useEditorStore.getState();
  const pane = store.panes.find((candidate) => candidate.id === store.activePaneId);

  if (!pane) return;

  store.setTreeWorkspacePath(input.workspacePath);
  store.openOverlay();

  if (pane.openPaths.includes(target.absolutePath)) {
    store.setActiveFile(pane.id, target.absolutePath);
    if (input.line !== undefined) {
      store.setPendingReveal({
        path: target.absolutePath,
        line: Math.max(1, Math.trunc(input.line)),
        column: Math.max(1, Math.trunc(input.column ?? 1)),
      });
    }
    return;
  }

  store.openFile(pane.id, target.absolutePath, target.name, target.ext, "");
  store.setFileLoading(target.absolutePath, true);
  if (input.line !== undefined) {
    store.setPendingReveal({
      path: target.absolutePath,
      line: Math.max(1, Math.trunc(input.line)),
      column: Math.max(1, Math.trunc(input.column ?? 1)),
    });
  }

  try {
    const response = await fetch(
      `/api/editor/fs/file?path=${encodeURIComponent(target.absolutePath)}`,
    );
    const raw = await response.json();
    if (!response.ok) {
      throw new Error(getApiErrorMessage(raw, "Failed to load file"));
    }
    const data = unwrapApiData<{ content?: string }>(raw);
    useEditorStore
      .getState()
      .openFile(pane.id, target.absolutePath, target.name, target.ext, data.content ?? "");
  } catch {
    // Keep the tab visible with the same empty-state behavior as FileTree. The
    // editor remains available for retrying through the floating explorer.
  } finally {
    useEditorStore.getState().setFileLoading(target.absolutePath, false);
  }
}
