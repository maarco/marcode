// @effect-diagnostics nodeBuiltinImport:off - Regression coverage compares the sidebar component with its width contract.
//
// ── Marcode fork seam ──
// Upstream deleted this file in #8400 as a trivial layout test. Marcode keeps
// it because "keeps the brand out of the sidebar header" below is the only
// assertion pinning a Marcode removal that upstream still ships; without it a
// future sync re-introduces the sidebar wordmark with no conflict at all.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import {
  resolveInitialThreadSidebarWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

describe("thread sidebar width", () => {
  it("uses the default width when no preference is stored", () => {
    // Upstream un-exported THREAD_SIDEBAR_DEFAULT_WIDTH when it deleted this
    // file; the literal keeps the assertion without re-widening their module.
    expect(resolveInitialThreadSidebarWidth(null, 1200)).toBe(16 * 16);
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
