/**
 * Pins the fork seam that mounts Marcode's unified workspace tree inside
 * upstream's `Sidebar.tsx`.
 *
 * Upstream rewrites that file wholesale (they replaced its entire
 * implementation in the `ba9c9ae8` sync). A rewrite that drops the mount
 * merges perfectly cleanly and silently removes the workspace tree from the
 * product — exactly the class of break a conflict never reports. Asserting on
 * the source keeps that failure loud and cheap to diagnose, without needing a
 * DOM or a rendered sidebar.
 *
 * If you are here because this test failed after an upstream sync: the seam
 * moved or was dropped. Re-mount `SidebarProjectWorkspaceSection` in the new
 * sidebar structure rather than deleting these assertions.
 */
import { describe, expect, it } from "vite-plus/test";

import sidebarSource from "../Sidebar.tsx?raw";

describe("unified workspace sidebar fork seam", () => {
  it("imports the Marcode-owned workspace section", () => {
    expect(sidebarSource).toContain('from "./unified-workspace/SidebarProjectWorkspaceSection"');
  });

  it("mounts the workspace section", () => {
    expect(sidebarSource).toContain("<SidebarProjectWorkspaceSection");
  });

  it("gates the mount on the unifiedWorkspaceSidebar setting", () => {
    expect(sidebarSource).toContain("isUnifiedWorkspaceSidebarEnabled");
  });

  it("marks the seam so the next merge conflict is obvious", () => {
    expect(sidebarSource).toContain("Marcode fork seam");
  });

  /**
   * The seam's whole point is that it stays small. If this grows, the tree is
   * creeping back into upstream's file and the next sync gets expensive —
   * move the new logic into the section component instead of raising this
   * number.
   */
  it("keeps the seam small", () => {
    const seamLines = sidebarSource
      .split("\n")
      .filter((line) => line.includes("SidebarProjectWorkspaceSection"));
    expect(seamLines.length).toBeLessThanOrEqual(4);
  });
});
