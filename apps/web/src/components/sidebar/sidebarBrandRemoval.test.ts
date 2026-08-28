// @effect-diagnostics nodeBuiltinImport:off - The removal is a source-level contract, not behavior.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

// ── Marcode fork seam ──
// Upstream sizes a wordmark inside the sidebar header and pins that with a
// `.sidebar-brand` CSS test. Marcode moved the brand to FloatingPillNav and
// SidebarChromeHeader renders nothing but the Electron drag strip, so those
// rules would be dead styles. Assert the removal instead: a future upstream
// merge that re-introduces the sidebar brand fails here rather than silently
// shipping a second wordmark.
//
// This pin used to live in `components/threadSidebarWidth.test.ts`, which
// upstream deleted in #8400. It lives in its own Marcode-owned file now so the
// next sync cannot take it out with an upstream prune.
describe("sidebar chrome", () => {
  it("keeps the brand out of the sidebar header", () => {
    const sidebarStyles = NodeFS.readFileSync(new URL("../../index.css", import.meta.url), "utf8");
    const sidebarChrome = NodeFS.readFileSync(
      new URL("./SidebarChrome.tsx", import.meta.url),
      "utf8",
    );

    expect(sidebarStyles).not.toMatch(/\.sidebar-brand[\s{,]/);
    expect(sidebarChrome).not.toMatch(/SidebarBrand|Wordmark/);
  });
});
