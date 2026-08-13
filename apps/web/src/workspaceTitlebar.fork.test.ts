import { describe, expect, it } from "vite-plus/test";

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
 * collapsed-only class.
 */

describe("sidebarless titlebar inset", () => {
  it("applies unconditionally, unlike the collapsed-sidebar variant", () => {
    expect(COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS).toContain("data-sidebar-state=collapsed");
    expect(SIDEBARLESS_TITLEBAR_INSET_CLASS).not.toContain("data-sidebar-state");
    expect(SIDEBARLESS_TITLEBAR_INSET_CLASS).toContain("--workspace-titlebar-content-left");
  });

  for (const [name, source] of [
    ["settings", settingsSource],
    ["usage", usageSource],
  ] as const) {
    it(`insets the ${name} desktop titlebar past the native window controls`, () => {
      // The drag region is the Electron titlebar; the traffic lights sit on it.
      const lines = source.split("\n");
      const dragRegion = lines.findIndex((line) => line.includes("drag-region"));
      expect(dragRegion).toBeGreaterThan(-1);

      expect(lines.slice(dragRegion, dragRegion + 4).join("\n")).toContain(
        "SIDEBARLESS_TITLEBAR_INSET_CLASS",
      );
    });
  }
});
