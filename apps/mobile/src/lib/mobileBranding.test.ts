import { describe, expect, it } from "vite-plus/test";

import { resolveMobileStageLabel } from "./mobileBranding";

// ── Marcode fork seam ──
// Upstream deleted this file as low-signal (t3code@73f8cfc0) and its
// `resolveMobileStageLabel` returns "Alpha" on the stable channel. Marcode
// returns "" there so `CompactBrandTitle` renders no stage pill on production.
// Keep this test: it is the only thing that makes a sync reinstating "Alpha"
// fail loudly instead of silently re-branding the production nav bar.
describe("resolveMobileStageLabel", () => {
  it.each([
    ["development", "Dev"],
    ["preview", "Nightly"],
    ["production", ""],
    [undefined, ""],
  ])("maps %s builds to %s", (appVariant, expected) => {
    expect(resolveMobileStageLabel(appVariant)).toBe(expected);
  });
});
