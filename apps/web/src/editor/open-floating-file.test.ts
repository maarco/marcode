import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { EnvironmentId } from "@t3tools/contracts";

import { fileKey, useEditorStore } from "./editor-store";
import { openFileInFloatingEditor, resolveFloatingFileTarget } from "./open-floating-file";

describe("resolveFloatingFileTarget", () => {
  it("resolves a workspace-relative file into the floating editor target shape", () => {
    expect(resolveFloatingFileTarget("/repo", "src/main.ts")).toEqual({
      absolutePath: "/repo/src/main.ts",
      name: "main.ts",
      ext: ".ts",
    });
  });

  it("handles Windows separators and dotfiles", () => {
    expect(resolveFloatingFileTarget("C:\\repo", "src\\.env")).toEqual({
      absolutePath: "C:\\repo\\src\\.env",
      name: ".env",
      ext: "",
    });
  });
});

describe("openFileInFloatingEditor", () => {
  const ENV_A = "env-a" as EnvironmentId;
  const ENV_B = "env-b" as EnvironmentId;

  beforeEach(() => {
    useEditorStore.setState({
      panes: [{ id: "pane-a", openPaths: [], activePath: null }],
      activePaneId: "pane-a",
      fileCache: new Map(),
      dirtyKeys: new Set(),
      pendingReveal: null,
    });
  });

  afterEach(() => {
    useEditorStore.setState({
      panes: [{ id: "pane-a", openPaths: [], activePath: null }],
      activePaneId: "pane-a",
      fileCache: new Map(),
      dirtyKeys: new Set(),
      pendingReveal: null,
    });
  });

  it("opens a tab carrying the caller's environment ref, with no content in the store", () => {
    openFileInFloatingEditor({
      environmentId: ENV_A,
      workspacePath: "/repo",
      relativePath: "src/main.ts",
    });

    const key = fileKey(ENV_A, "/repo/src/main.ts");
    const state = useEditorStore.getState();
    expect(state.panes[0]!.openPaths).toEqual([key]);
    expect(state.panes[0]!.activePath).toBe(key);
    // content is loaded lazily by the pane from the shared file-state layer;
    // the store only carries the ref.
    expect(state.fileCache.get(key)).toMatchObject({
      environmentId: ENV_A,
      cwd: "/repo",
      relativePath: "src/main.ts",
      path: "/repo/src/main.ts",
      name: "main.ts",
      ext: ".ts",
    });
  });

  it("activates the existing tab instead of opening a duplicate", () => {
    const input = {
      environmentId: ENV_A,
      workspacePath: "/repo",
      relativePath: "src/main.ts",
    } as const;

    openFileInFloatingEditor(input);
    useEditorStore.setState({
      panes: [{ ...useEditorStore.getState().panes[0]!, activePath: null }],
    });
    openFileInFloatingEditor(input);

    const key = fileKey(ENV_A, "/repo/src/main.ts");
    expect(useEditorStore.getState().panes[0]!.openPaths).toEqual([key]);
    expect(useEditorStore.getState().panes[0]!.activePath).toBe(key);
  });

  it("keeps two environments' identical paths as separate tabs", () => {
    openFileInFloatingEditor({
      environmentId: ENV_A,
      workspacePath: "/workspace",
      relativePath: "src/main.ts",
    });
    // pin the first tab so the second open cannot replace it as the preview tab
    useEditorStore.getState().pinFile(fileKey(ENV_A, "/workspace/src/main.ts"));
    openFileInFloatingEditor({
      environmentId: ENV_B,
      workspacePath: "/workspace",
      relativePath: "src/main.ts",
    });

    expect(useEditorStore.getState().panes[0]!.openPaths).toEqual([
      fileKey(ENV_A, "/workspace/src/main.ts"),
      fileKey(ENV_B, "/workspace/src/main.ts"),
    ]);
  });

  it("scopes the pending reveal to the same environment", () => {
    openFileInFloatingEditor({
      environmentId: ENV_A,
      workspacePath: "/repo",
      relativePath: "src/main.ts",
      line: 42,
    });

    expect(useEditorStore.getState().pendingReveal).toEqual({
      environmentId: ENV_A,
      path: "/repo/src/main.ts",
      line: 42,
      column: 1,
    });
  });

  it("does nothing when there is no active pane", () => {
    useEditorStore.setState({ panes: [], activePaneId: "gone" });

    openFileInFloatingEditor({
      environmentId: ENV_A,
      workspacePath: "/repo",
      relativePath: "src/main.ts",
    });

    expect(useEditorStore.getState().pendingReveal).toBeNull();
  });
});
