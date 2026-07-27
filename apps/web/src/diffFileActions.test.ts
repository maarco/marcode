import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { openDiffFilePrimaryAction } from "./diffFileActions";
import { fileKey, useEditorStore } from "./editor/editor-store";

const THREAD_REF = scopeThreadRef(
  EnvironmentId.make("environment-local"),
  ThreadId.make("thread-1"),
);

describe("openDiffFilePrimaryAction", () => {
  beforeEach(() => {
    useEditorStore.setState({
      panes: [{ id: "pane-a", openPaths: [], activePath: null }],
      activePaneId: "pane-a",
      fileCache: new Map(),
      dirtyKeys: new Set(),
      pendingReveal: null,
    });
  });

  it("opens diff files in the floating editor, scoped to the thread's workspace", () => {
    const openInEditor = vi.fn();

    openDiffFilePrimaryAction({
      threadRef: THREAD_REF,
      filePath: "apps/web/src/components/DiffPanel.tsx",
      activeCwd: "/repo/project",
      openInEditor,
    });

    const key = fileKey(
      THREAD_REF.environmentId,
      "/repo/project/apps/web/src/components/DiffPanel.tsx",
    );
    const state = useEditorStore.getState();
    expect(state.panes[0]!.openPaths).toEqual([key]);
    expect(state.panes[0]!.activePath).toBe(key);
    expect(state.fileCache.get(key)).toMatchObject({
      environmentId: THREAD_REF.environmentId,
      cwd: "/repo/project",
      relativePath: "apps/web/src/components/DiffPanel.tsx",
    });
    expect(openInEditor).not.toHaveBeenCalled();
  });

  it("falls back to the editor without thread context", () => {
    const openInEditor = vi.fn();

    openDiffFilePrimaryAction({
      threadRef: null,
      filePath: "apps/web/src/components/DiffPanel.tsx",
      activeCwd: "/repo/project",
      openInEditor,
    });

    expect(openInEditor).toHaveBeenCalledWith(
      "/repo/project/apps/web/src/components/DiffPanel.tsx",
    );
    expect(useEditorStore.getState().panes[0]!.openPaths).toEqual([]);
  });

  it("falls back to the editor when a thread is present but activeCwd is missing", () => {
    const openInEditor = vi.fn();

    openDiffFilePrimaryAction({
      threadRef: THREAD_REF,
      filePath: "apps/web/src/components/DiffPanel.tsx",
      activeCwd: undefined,
      openInEditor,
    });

    expect(openInEditor).toHaveBeenCalledWith("apps/web/src/components/DiffPanel.tsx");
    expect(useEditorStore.getState().panes[0]!.openPaths).toEqual([]);
  });
});
