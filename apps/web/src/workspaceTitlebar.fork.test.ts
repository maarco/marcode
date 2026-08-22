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

  /**
   * `pingdotgg/t3code@07f8027d` replaced both hand-rolled headers with the
   * shared `WorkspacePageHeader`, so the inset no longer lives at the call
   * sites. Marcode carries it as a `sidebarless` prop on that primitive
   * instead. The guarantee is unchanged and still has two halves, now checked
   * where each one lives: the primitive must map the prop to the
   * unconditional class, and both routes must opt in.
   */
  it("maps the sidebarless prop to the unconditional inset", () => {
    // The drag region is the Electron titlebar; the traffic lights sit on it.
    expect(headerSource).toContain("drag-region");
    expect(headerSource).toContain(
      "sidebarless ? SIDEBARLESS_TITLEBAR_INSET_CLASS : COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS",
    );
  });

  for (const [name, source] of [
    ["settings", settingsSource],
    ["usage", usageSource],
  ] as const) {
    it(`opts the ${name} route into the sidebarless inset`, () => {
      const lines = source.split("\n");
      const header = lines.findIndex((line) => line.includes("<WorkspacePageHeader"));
      expect(header, `${name} must render WorkspacePageHeader`).toBeGreaterThan(-1);

      // The prop sits on the opening tag, which the formatter may wrap.
      expect(lines.slice(header, header + 4).join("\n")).toContain("sidebarless");
    });
  }
});
