import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FileSaveCoordinator } from "~/components/files/fileSaveCoordinator";
import {
  clearProjectFileQueryData,
  confirmProjectFileQueryData,
  setProjectFileQueryData,
  useProjectFileQuery,
} from "~/components/files/projectFilesQueryState";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

/**
 * Shared file-state layer for project files.
 *
 * One reactive buffer per `{environmentId, cwd, relativePath}`, consumed by
 * both the floating code editor and the Files panel. Reads come from the
 * `projectEnvironment.readFile` atom family plus the optimistic overlay;
 * writes go through `projectEnvironment.writeFile` via a debounced
 * `FileSaveCoordinator` (autosave) with an immediate `flush()` for Cmd+S.
 *
 * Because both surfaces edit the same optimistic atom, there is literally one
 * buffer per file across the app — edits in one surface are visible (as dirty
 * state) in the other on the same keystroke.
 */

const FILE_AUTOSAVE_DEBOUNCE_MS = 500;

/** Composite key for a file's coordinators, stable across hook instances. */
export function fileKey(environmentId: EnvironmentId, cwd: string, relativePath: string): string {
  return `${environmentId}::${cwd}::${relativePath}`;
}

/**
 * Active coordinators by file key. Lets any component force-flush a file
 * (e.g. a tab-bar save button) without owning the editor hook.
 */
const coordinators = new Map<string, FileSaveCoordinator>();

/**
 * Force-persist a file's latest contents immediately (Cmd+S / save button).
 * No-op if no editor for that file is mounted.
 */
export function flushProjectFile(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string,
): Promise<void> {
  const coordinator = coordinators.get(fileKey(environmentId, cwd, relativePath));
  return coordinator ? coordinator.flush() : Promise.resolve();
}

/**
 * Persist a closing tab's pending edits, given a possibly-incomplete file ref.
 *
 * Closing a tab used to prompt "Discard unsaved changes to X?" and then cancel
 * the pending write. With a {@link FILE_AUTOSAVE_DEBOUNCE_MS}ms autosave that
 * prompt was both misleading and nearly unreachable: the dirty flag it was
 * gated on is cleared as soon as autosave lands, so the only way to see it was
 * to click close within half a second of typing — and answering "discard" threw
 * away work the user had every reason to believe was saved, since every other
 * edit that session had been.
 *
 * Closing now commits instead of discarding. Virtual/diff tabs carry no
 * environment ref and no-op here.
 */
export function flushProjectFileRef(ref: {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
  readonly relativePath: string | null;
}): void {
  if (!ref.environmentId || !ref.cwd || !ref.relativePath) return;
  void flushProjectFile(ref.environmentId, ref.cwd, ref.relativePath);
}

/**
 * Forget a file's pending autosave buffer without persisting it (discard /
 * revert). No-op if no editor for that file is mounted.
 */
export function cancelProjectFile(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string,
): void {
  const coordinator = coordinators.get(fileKey(environmentId, cwd, relativePath));
  coordinator?.cancel();
}

export interface ProjectFileState {
  /** Merged contents (server-confirmed + optimistic overlay), or null while loading. */
  readonly contents: string | null;
  readonly byteLength: number;
  readonly truncated: boolean;
  /** Initial read is in flight. */
  readonly isPending: boolean;
  /** Unsaved edits exist (optimistic overlay is present). */
  readonly isDirty: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
}

/**
 * Read a project file reactively. `environmentId`/`cwd` must be non-null; pass
 * `relativePath: null` to signal "no file selected" (returns an empty state).
 */
export function useProjectFile(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string | null,
): ProjectFileState {
  const query = useProjectFileQuery(environmentId, cwd, relativePath);

  // the optimistic overlay's presence is the source of truth for "dirty"
  const optimistic = useAtomValue(
    projectEnvironment.optimisticFile({ environmentId, cwd, relativePath: relativePath ?? "" }),
  );

  return {
    contents: query.data?.contents ?? null,
    byteLength: query.data?.byteLength ?? 0,
    truncated: query.data?.truncated ?? false,
    isPending: query.isPending && query.data === null,
    isDirty: optimistic != null,
    error: query.error,
    refresh: query.refresh,
  };
}

export interface ProjectFileEditorOptions {
  /** Optional callback fired when pending (unsaved) state changes. */
  readonly onPendingChange?: (pending: boolean) => void;
}

export interface ProjectFileEditor {
  /** Apply new contents: optimistic overlay + debounced autosave. */
  readonly update: (contents: string) => void;
  /** Persist the latest contents now (Cmd+S). Cancels the debounce timer. */
  readonly flush: () => Promise<void>;
  /** Drop the optimistic overlay and revert to the server-confirmed contents. */
  readonly revert: () => void;
  /** A write is currently in flight. */
  readonly isSaving: boolean;
}

/**
 * Edit handle for a project file. Pairs with {@link useProjectFile}.
 * `environmentId`/`cwd`/`relativePath` must all be non-null.
 */
export function useProjectFileEditor(
  environmentId: EnvironmentId,
  cwd: string,
  relativePath: string,
  options?: ProjectFileEditorOptions,
): ProjectFileEditor {
  const writeFile = useAtomCommand(projectEnvironment.writeFile);
  const onPendingChange = options?.onPendingChange;
  const [isSaving, setIsSaving] = useState(false);

  const coordinator = useMemo(
    () =>
      new FileSaveCoordinator({
        debounceMs: FILE_AUTOSAVE_DEBOUNCE_MS,
        persist: async (contents) => {
          setIsSaving(true);
          try {
            return await writeFile({ environmentId, input: { cwd, relativePath, contents } });
          } finally {
            setIsSaving(false);
          }
        },
        onPendingChange: (pending) => onPendingChange?.(pending),
        onConfirmed: (confirmed) =>
          confirmProjectFileQueryData(environmentId, cwd, relativePath, confirmed),
        // minimal hook so autosave failures are at least visible per-file
        // (vs. the generic atom-command console warning); a future toast can
        // replace/augment this without touching the coordinator itself.
        onError: (error) => {
          console.error(`[autosave] failed to save ${cwd}/${relativePath}`, error);
        },
      }),
    [cwd, environmentId, onPendingChange, relativePath, writeFile],
  );

  useEffect(() => () => coordinator.dispose(), [coordinator]);

  // register/unregister with the global registry for flushProjectFile()
  useEffect(() => {
    const key = fileKey(environmentId, cwd, relativePath);
    coordinators.set(key, coordinator);
    return () => {
      const current = coordinators.get(key);
      if (current === coordinator) coordinators.delete(key);
    };
  }, [coordinator, environmentId, cwd, relativePath]);

  const update = useCallback(
    (contents: string) => {
      setProjectFileQueryData(environmentId, cwd, relativePath, contents);
      coordinator.change(contents);
    },
    [coordinator, cwd, environmentId, relativePath],
  );

  const flush = useCallback(() => coordinator.flush(), [coordinator]);

  const revert = useCallback(() => {
    // stop writes → drop overlay (mirrors the discard flow in editor-pane.tsx)
    coordinator.cancel();
    clearProjectFileQueryData(environmentId, cwd, relativePath);
  }, [coordinator, cwd, environmentId, relativePath]);

  return { update, flush, revert, isSaving };
}

// re-exported so consumers can read the optimistic overlay without re-deriving
export {
  getOptimisticProjectFileQueryData,
  setProjectFileQueryData,
  clearProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";
