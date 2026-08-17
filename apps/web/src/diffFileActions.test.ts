import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { openDiffFilePrimaryAction, resolveDiffPathForWorkspace } from "./diffFileActions";
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

  it("opens repository-relative diff files from a nested project", () => {
    const openInEditor = vi.fn();

    openDiffFilePrimaryAction({
      threadRef: THREAD_REF,
      filePath: "frontend/Dockerfile",
      activeCwd: "/repo/frontend",
      repositoryRoot: "/repo",
      openInEditor,
    });

    // Upstream asserts the right panel's `file:Dockerfile` surface here. Marcode
    // retired that surface, so the same rebased path must land in the floating
    // editor instead.
    const key = fileKey(THREAD_REF.environmentId, "/repo/frontend/Dockerfile");
    const state = useEditorStore.getState();
    expect(state.panes[0]!.openPaths).toEqual([key]);
    expect(state.fileCache.get(key)).toMatchObject({
      environmentId: THREAD_REF.environmentId,
      cwd: "/repo/frontend",
      relativePath: "Dockerfile",
    });
    expect(openInEditor).not.toHaveBeenCalled();
  });

  it("preserves repository-relative paths in a separate worktree", () => {
    expect(
      resolveDiffPathForWorkspace({
        filePath: "frontend/Dockerfile",
        workspaceRoot: "/worktrees/feature",
        repositoryRoot: "/repo",
      }),
    ).toBe("frontend/Dockerfile");
  });

  it("handles Windows roots and mixed diff separators", () => {
    expect(
      resolveDiffPathForWorkspace({
        filePath: "Frontend/src\\index.ts",
        workspaceRoot: "C:\\repo\\frontend",
        repositoryRoot: "C:\\repo",
      }),
    ).toBe("src/index.ts");
  });

  it.each([
    { workspaceRoot: "/frontend", repositoryRoot: "/" },
    { workspaceRoot: "C:\\frontend", repositoryRoot: "C:\\" },
  ])("handles filesystem roots: $repositoryRoot", ({ workspaceRoot, repositoryRoot }) => {
    expect(
      resolveDiffPathForWorkspace({
        filePath: "frontend/index.ts",
        workspaceRoot,
        repositoryRoot,
      }),
    ).toBe("index.ts");
  });

  it.each(["backend/server.ts", "frontend2/app.ts", "frontend/../secret.ts", "C:secret.ts"])(
    "does not open an out-of-project diff path: %s",
    (filePath) => {
      const openInEditor = vi.fn();

      openDiffFilePrimaryAction({
        threadRef: THREAD_REF,
        filePath,
        activeCwd: "/repo/frontend",
        repositoryRoot: "/repo",
        openInEditor,
      });

      expect(useEditorStore.getState().panes[0]!.openPaths).toEqual([]);
      expect(openInEditor).not.toHaveBeenCalled();
    },
  );
});
