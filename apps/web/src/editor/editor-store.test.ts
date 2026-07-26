import { afterEach, describe, expect, it } from "vite-plus/test";
import type { EnvironmentId } from "@t3tools/contracts";

import { fileKey, useEditorStore, type EditorPane } from "./editor-store";

const ENV = "env-1" as EnvironmentId;
const OTHER_ENV = "env-2" as EnvironmentId;

/** Composite tab key in the default test environment — see `fileKey`. */
const k = (path: string) => fileKey(ENV, path);

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
    setPanes([
      { id: "pane-a", openPaths: [k("/workspace/a.ts")], activePath: k("/workspace/a.ts") },
    ]);

    const affected = useEditorStore.getState().closeFilesUnder(ENV, "/workspace/a.ts");

    expect(affected).toEqual([{ path: "/workspace/a.ts", activeInPaneId: "pane-a" }]);
    expect(useEditorStore.getState().panes.flatMap((p) => p.openPaths)).toEqual([]);
  });

  it("closes every file nested under a directory, across every pane, and leaves siblings alone", () => {
    setPanes(
      [
        {
          id: "pane-a",
          openPaths: [k("/workspace/dir/a.ts"), k("/workspace/unrelated.ts")],
          activePath: k("/workspace/unrelated.ts"),
        },
        {
          id: "pane-b",
          openPaths: [k("/workspace/dir/nested/b.ts"), k("/workspace/dir-other/c.ts")],
          activePath: k("/workspace/dir/nested/b.ts"),
        },
      ],
      "pane-a",
    );

    const affected = useEditorStore.getState().closeFilesUnder(ENV, "/workspace/dir");

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
    expect(remaining).toEqual([k("/workspace/dir-other/c.ts"), k("/workspace/unrelated.ts")]);
  });

  it("closes the same open file in every pane that has it, not just the first", () => {
    setPanes([
      {
        id: "pane-a",
        openPaths: [k("/workspace/shared.ts")],
        activePath: k("/workspace/shared.ts"),
      },
      {
        id: "pane-b",
        openPaths: [k("/workspace/shared.ts")],
        activePath: k("/workspace/shared.ts"),
      },
    ]);

    const affected = useEditorStore.getState().closeFilesUnder(ENV, "/workspace/shared.ts");

    expect(affected).toHaveLength(1); // one distinct path, even though two panes had it open
    expect(
      useEditorStore
        .getState()
        .panes.every((p) => !p.openPaths.includes(k("/workspace/shared.ts"))),
    ).toBe(true);
  });

  it("leaves another environment's identical path open", () => {
    // the reason tabs are keyed by fileKey(environmentId, path): two
    // environments routinely mount at the same absolute workspace path, and
    // deleting a file in one must not close the other's tab.
    const otherKey = fileKey(OTHER_ENV, "/workspace/a.ts");
    setPanes([
      {
        id: "pane-a",
        openPaths: [k("/workspace/a.ts"), otherKey],
        activePath: k("/workspace/a.ts"),
      },
    ]);

    const affected = useEditorStore.getState().closeFilesUnder(ENV, "/workspace/a.ts");

    expect(affected).toEqual([{ path: "/workspace/a.ts", activeInPaneId: "pane-a" }]);
    expect(useEditorStore.getState().panes.flatMap((p) => p.openPaths)).toEqual([otherKey]);
  });

  it("is a no-op when nothing matches", () => {
    setPanes([
      { id: "pane-a", openPaths: [k("/workspace/keep.ts")], activePath: k("/workspace/keep.ts") },
    ]);

    const affected = useEditorStore.getState().closeFilesUnder(ENV, "/workspace/gone.ts");

    expect(affected).toEqual([]);
    expect(useEditorStore.getState().panes[0]!.openPaths).toEqual([k("/workspace/keep.ts")]);
  });
});
