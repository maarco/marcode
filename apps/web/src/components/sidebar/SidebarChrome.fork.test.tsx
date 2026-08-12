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
  });
});
