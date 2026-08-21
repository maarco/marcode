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
 * collapsed-only class.
 */

describe("sidebarless titlebar inset", () => {
  it("applies unconditionally, unlike the collapsed-sidebar variant", () => {
    expect(COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS).toContain("data-sidebar-state=collapsed");
    expect(SIDEBARLESS_TITLEBAR_INSET_CLASS).not.toContain("data-sidebar-state");
    expect(SIDEBARLESS_TITLEBAR_INSET_CLASS).toContain("--workspace-titlebar-content-left");
  });

  // Upstream moved both routes onto the shared `WorkspacePageHeader`, which
  // hardcodes the collapsed-sidebar inset. Marcode carries the fix forward as a
  // `sidebarless` prop on that shared header, so the pin now has two halves:
  // the header has to honour the flag, and each sidebarless route has to pass
  // it. Either one silently regresses on its own.
  it("swaps the shared header to the sidebarless inset when asked", () => {
    expect(headerSource).toContain("readonly sidebarless?: boolean");
    expect(headerSource).toContain(
      "sidebarless ? SIDEBARLESS_TITLEBAR_INSET_CLASS : COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS",
    );
  });

  for (const [name, source] of [
    ["settings", settingsSource],
    ["usage", usageSource],
  ] as const) {
    it(`insets the ${name} desktop titlebar past the native window controls`, () => {
      const lines = source.split("\n");
      const header = lines.findIndex((line) => line.includes("<WorkspacePageHeader"));
      expect(header).toBeGreaterThan(-1);

      expect(lines.slice(header, header + 4).join("\n")).toContain("sidebarless");
    });
  }
});
