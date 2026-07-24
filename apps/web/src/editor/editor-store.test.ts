import { afterEach, describe, expect, it } from "vite-plus/test";

import { useEditorStore, type EditorPane } from "./editor-store";

function setPanes(panes: EditorPane[], activePaneId = panes[0]!.id) {
  useEditorStore.setState({ panes, activePaneId, fileCache: new Map(), dirtyKeys: new Set() });
}

describe("editor-store closeFilesUnder", () => {
  afterEach(() => {
    // leave the singleton store clean for any other test in this file/run.
    const paneId = useEditorStore.getState().panes[0]!.id;
    setPanes([{ id: paneId, openPaths: [], activePath: null }]);
  });

  it("closes an exact-path match and reports it was the active tab", () => {
    setPanes([{ id: "pane-a", openPaths: ["/workspace/a.ts"], activePath: "/workspace/a.ts" }]);

    const affected = useEditorStore.getState().closeFilesUnder("/workspace/a.ts");

    expect(affected).toEqual([{ path: "/workspace/a.ts", activeInPaneId: "pane-a" }]);
    expect(useEditorStore.getState().panes.flatMap((p) => p.openPaths)).toEqual([]);
  });

  it("closes every file nested under a directory, across every pane, and leaves siblings alone", () => {
    setPanes(
      [
        {
          id: "pane-a",
          openPaths: ["/workspace/dir/a.ts", "/workspace/unrelated.ts"],
          activePath: "/workspace/unrelated.ts",
        },
        {
          id: "pane-b",
          openPaths: ["/workspace/dir/nested/b.ts", "/workspace/dir-other/c.ts"],
          activePath: "/workspace/dir/nested/b.ts",
        },
      ],
      "pane-a",
    );

    const affected = useEditorStore.getState().closeFilesUnder("/workspace/dir");

    expect(affected.map((e) => e.path).toSorted()).toEqual([
      "/workspace/dir/a.ts",
      "/workspace/dir/nested/b.ts",
    ]);
    expect(affected.find((e) => e.path === "/workspace/dir/nested/b.ts")?.activeInPaneId).toBe(
      "pane-b",
    );
    expect(affected.find((e) => e.path === "/workspace/dir/a.ts")?.activeInPaneId).toBeNull();

    // "/workspace/dir-other/c.ts" shares a text prefix but is NOT nested
    // under "/workspace/dir" (no path-separator boundary) — must survive,
    // same as the untouched "/workspace/unrelated.ts".
    const remaining = useEditorStore
      .getState()
      .panes.flatMap((p) => p.openPaths)
      .toSorted();
    expect(remaining).toEqual(["/workspace/dir-other/c.ts", "/workspace/unrelated.ts"]);
  });

  it("closes the same open file in every pane that has it, not just the first", () => {
    setPanes([
      { id: "pane-a", openPaths: ["/workspace/shared.ts"], activePath: "/workspace/shared.ts" },
      { id: "pane-b", openPaths: ["/workspace/shared.ts"], activePath: "/workspace/shared.ts" },
    ]);

    const affected = useEditorStore.getState().closeFilesUnder("/workspace/shared.ts");

    expect(affected).toHaveLength(1); // one distinct path, even though two panes had it open
    expect(
      useEditorStore.getState().panes.every((p) => !p.openPaths.includes("/workspace/shared.ts")),
    ).toBe(true);
  });

  it("is a no-op when nothing matches", () => {
    setPanes([
      { id: "pane-a", openPaths: ["/workspace/keep.ts"], activePath: "/workspace/keep.ts" },
    ]);

    const affected = useEditorStore.getState().closeFilesUnder("/workspace/gone.ts");

    expect(affected).toEqual([]);
    expect(useEditorStore.getState().panes[0]!.openPaths).toEqual(["/workspace/keep.ts"]);
  });
});
