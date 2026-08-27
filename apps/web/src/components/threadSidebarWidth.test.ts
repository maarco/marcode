// @effect-diagnostics nodeBuiltinImport:off - Regression coverage compares the sidebar component with its width contract.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import {
  resolveInitialThreadSidebarWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

// Marcode fork seam: upstream pruned this file as trivial (#8400). Marcode keeps
// it for the brand-removal pin below, which has no other home — a sync that
// re-introduces the sidebar wordmark must fail loudly instead of merging clean.
describe("thread sidebar width", () => {
  // Upstream un-exported THREAD_SIDEBAR_DEFAULT_WIDTH when it pruned this file
  // (#8400). Marcode follows that refactor rather than re-exporting it, so the
  // no-preference case is pinned by its floor instead of its exact value.
  it("uses a width above the minimum when no preference is stored", () => {
    expect(resolveInitialThreadSidebarWidth(null, 1200)).toBeGreaterThan(THREAD_SIDEBAR_MIN_WIDTH);
  });

  it("uses a stored width in the initial render", () => {
    expect(resolveInitialThreadSidebarWidth(360, 1200)).toBe(360);
  });

  it("clamps a stored width to the sidebar minimum", () => {
    expect(resolveInitialThreadSidebarWidth(120, 1200)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });

  it("leaves enough room for the main content on a smaller window", () => {
    const viewportWidth = 1000;

    expect(resolveInitialThreadSidebarWidth(900, viewportWidth)).toBe(
      viewportWidth - THREAD_MAIN_CONTENT_MIN_WIDTH,
    );
  });

  it("keeps the sidebar minimum when the whole layout is narrower than its minimums", () => {
    expect(resolveInitialThreadSidebarWidth(900, 700)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });

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
