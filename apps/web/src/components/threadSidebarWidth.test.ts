// @effect-diagnostics nodeBuiltinImport:off - Regression coverage reads the sidebar component source.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { THREAD_SIDEBAR_MIN_WIDTH } from "./threadSidebarWidth";

// Upstream pruned its own width tests as trivial layout coverage (#8400) and
// un-exported the default width with them. Only the two rules Marcode actually
// depends on survive here.
describe("thread sidebar width", () => {
  it("keeps the sidebar minimum at the 13rem the header layout is built around", () => {
    expect(THREAD_SIDEBAR_MIN_WIDTH).toBe(13 * 16);
  });

  // Upstream sizes a wordmark inside the sidebar header and pins that with a
  // `.sidebar-brand` CSS test. Marcode moved the brand to FloatingPillNav and
  // SidebarChromeHeader renders nothing but the Electron drag strip, so those
  // rules would be dead styles. Assert the removal instead: a future upstream
  // merge that re-introduces the sidebar brand fails here rather than silently
  // shipping a second wordmark.
  it("keeps the brand out of the sidebar header", () => {
    const sidebarStyles = NodeFS.readFileSync(new URL("../index.css", import.meta.url), "utf8");
    const sidebarChrome = NodeFS.readFileSync(
      new URL("./sidebar/SidebarChrome.tsx", import.meta.url),
      "utf8",
    );

    expect(sidebarStyles).not.toMatch(/\.sidebar-brand[\s{,]/);
    expect(sidebarChrome).not.toMatch(/SidebarBrand|Wordmark/);
  });
});
