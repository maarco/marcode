// @effect-diagnostics nodeBuiltinImport:off - Source-text assertion pins a removal upstream keeps re-adding.
import * as NodeFS from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";

import { SidebarChromeFooter } from "./SidebarChrome";

/**
 * Marcode moved brand, settings, usage, and pull-request navigation into
 * `FloatingPillNav`, leaving the sidebar footer to update pills only. Upstream
 * keeps growing their footer nav — the `pingdotgg/t3code@3da7f9c5` sync added a
 * "Pull Requests" row to it — and every one of those additions merges cleanly
 * into a footer Marcode deliberately emptied.
 *
 * A silent re-add is the failure mode this pins: two entry points for the same
 * destination, one of them in a footer Marcode does not style. If a sync
 * reintroduces footer navigation, this fails instead of shipping it.
 */

function labelsOf(node: ReactNode): string[] {
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(labelsOf);
  if (!isValidElement(node)) return [];
  return labelsOf((node as ReactElement<{ children?: ReactNode }>).props.children);
}

describe("SidebarChromeFooter", () => {
  it("carries no navigation: FloatingPillNav owns settings, usage and pull requests", () => {
    // `memo` wraps the render function; `.type` is the component itself.
    const render = (SidebarChromeFooter as unknown as { type: () => ReactNode }).type;
    const text = labelsOf(render()).join(" ");

    expect(text).not.toContain("Settings");
    expect(text).not.toContain("Usage");
    expect(text).not.toContain("Pull Requests");
    // `pingdotgg/t3code@b73232bd` added a page-level "Back" row to the same footer.
    expect(text).not.toContain("Back");
  });
});

/**
 * The same footer nav keeps arriving on the settings sidebar: upstream's
 * `pingdotgg/t3code#7153` replaced its Back row with `SidebarUtilityMenu`
 * (Back + Settings + Usage + Pull Requests). Marcode keeps the single Back row
 * there because FloatingPillNav already owns the other three, and that swap
 * merges cleanly — nothing else fails when it comes back.
 */
describe("SettingsSidebarNav footer", () => {
  it("keeps a single Back row instead of upstream's utility menu", () => {
    const source = NodeFS.readFileSync(
      new URL("../settings/SettingsSidebarNav.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/import\s*\{[^}]*SidebarUtilityMenu/);
    expect(source).not.toContain("<SidebarUtilityMenu");
    expect(source).toContain("handleBackClick");
  });
});
