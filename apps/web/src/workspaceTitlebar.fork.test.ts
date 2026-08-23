import { describe, expect, it } from "vite-plus/test";

import headerSource from "./components/WorkspacePageHeader.tsx?raw";
import usageSource from "./components/usage/UsagePage.tsx?raw";
import settingsSource from "./routes/settings.tsx?raw";
import {
  COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
  SIDEBARLESS_TITLEBAR_INSET_CLASS,
} from "./workspaceTitlebar";

/**
 * Marcode renders no sidebar on settings and usage — `FloatingPillNav` owns
 * that navigation. Upstream's only titlebar inset keys off a
 * `data-sidebar-state` ancestor and reads a variable declared on the sidebar
 * wrapper, so on those routes the selector never matches and the variable never
 * resolves. The visible failure is the breadcrumb sitting under the macOS
 * traffic lights.
 *
 * Both halves have to hold, and each regresses on its own: an upstream sync can
 * move the variable back onto the wrapper, or swap a call site back to the
 * collapsed-only class. `pingdotgg/t3code@07f8027d` folded both page headers
 * into `WorkspacePageHeader`, which carries the drag region and the
 * collapsed-only inset — so the sidebarless class now has to arrive as an
 * override from each sidebarless call site.
 */

describe("sidebarless titlebar inset", () => {
  it("applies unconditionally, unlike the collapsed-sidebar variant", () => {
    expect(COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS).toContain("data-sidebar-state=collapsed");
    expect(SIDEBARLESS_TITLEBAR_INSET_CLASS).not.toContain("data-sidebar-state");
    expect(SIDEBARLESS_TITLEBAR_INSET_CLASS).toContain("--workspace-titlebar-content-left");
  });

  it("puts the Electron drag region — and only the collapsed inset — in the shared header", () => {
    // The drag region is the Electron titlebar; the traffic lights sit on it.
    expect(headerSource).toContain('electron && "drag-region"');
    expect(headerSource).toContain("COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS");
    expect(headerSource).not.toContain("SIDEBARLESS_TITLEBAR_INSET_CLASS");
  });

  for (const [name, source] of [
    ["settings", settingsSource],
    ["usage", usageSource],
  ] as const) {
    it(`insets the ${name} desktop titlebar past the native window controls`, () => {
      const lines = source.split("\n");
      const header = lines.findIndex((line) => line.includes("<WorkspacePageHeader"));
      expect(header).toBeGreaterThan(-1);

      const opening = lines.slice(header, header + 5).join("\n");
      // Electron-aware, so the header actually renders the drag region there...
      expect(opening).toContain("electron={isElectron}");
      // ...and inset unconditionally, because no sidebar mounts on this route.
      expect(opening).toContain("SIDEBARLESS_TITLEBAR_INSET_CLASS");
    });
  }
});
