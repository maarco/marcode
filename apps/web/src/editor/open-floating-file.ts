import type { EnvironmentId } from "@t3tools/contracts";

import { resolvePathLinkTarget } from "~/terminal-links";

import { fileKey, makeFileRef, useEditorStore } from "./editor-store";

export interface OpenFloatingFileInput {
  /**
   * Environment the file belongs to — supplied by the caller, NOT read from the
   * editor store. A workspace-tree node or a chat file link belongs to its own
   * project/thread's environment, which is not necessarily the environment the
   * editor is currently pointed at; reading the store here would open a
   * same-path file from the wrong environment.
   */
  readonly environmentId: EnvironmentId;
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
 * uses that store instead of opening another right-panel file surface.
 *
 * No content is fetched here. The tab carries an environment-scoped ref and the
 * pane loads it lazily from the shared file-state layer, exactly like the file
 * tree, quick open, and the search panel — one buffer per file, one transport.
 */
export function openFileInFloatingEditor(input: OpenFloatingFileInput): void {
  const { environmentId } = input;
  const target = resolveFloatingFileTarget(input.workspacePath, input.relativePath);
  const store = useEditorStore.getState();
  const pane = store.panes.find((candidate) => candidate.id === store.activePaneId);

  if (!pane) return;

  store.openOverlay();

  const key = fileKey(environmentId, target.absolutePath);
  if (pane.openPaths.includes(key)) {
    store.setActiveFile(pane.id, key);
  } else {
    store.openFile(
      pane.id,
      makeFileRef(environmentId, input.workspacePath, target.absolutePath, target.name, target.ext),
    );
  }

  if (input.line !== undefined) {
    store.setPendingReveal({
      environmentId,
      path: target.absolutePath,
      line: Math.max(1, Math.trunc(input.line)),
      column: Math.max(1, Math.trunc(input.column ?? 1)),
    });
  }
}
