import { describe, expect, it } from "vite-plus/test";

import { resolveMobileStageLabel } from "./mobileBranding";

// Marcode fork seam: upstream deleted this file as low-signal (#8397), but
// Marcode's resolveMobileStageLabel returns "" (no stage badge) on the stable
// channel where upstream returns "Alpha". Without a pin, a future sync would
// silently restore the upstream label. Keep this test until the divergence goes.
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
