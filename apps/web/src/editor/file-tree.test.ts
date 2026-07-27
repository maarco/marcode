import { describe, expect, it } from "vite-plus/test";
import type { ProjectEntry } from "@t3tools/contracts";

import { entriesToTree, getAncestorPaths } from "./file-tree";

describe("file tree active-file reveal", () => {
  it("finds every ancestor folder needed to reveal a deeply nested file", () => {
    const entries: readonly ProjectEntry[] = [
      { path: "src", kind: "directory" },
      { path: "src/features", kind: "directory" },
      { path: "src/features/files", kind: "directory" },
      { path: "src/features/files/logo.png", kind: "file" },
    ];
    const tree = entriesToTree(entries, "/workspace");

    expect(getAncestorPaths("/workspace/src/features/files/logo.png", tree)).toEqual([
      "/workspace/src",
      "/workspace/src/features",
      "/workspace/src/features/files",
    ]);
  });

  it("does not expand anything for a root-level active file", () => {
    const tree = entriesToTree([{ path: "README.md", kind: "file" }], "/workspace");

    expect(getAncestorPaths("/workspace/README.md", tree)).toEqual([]);
  });
});
