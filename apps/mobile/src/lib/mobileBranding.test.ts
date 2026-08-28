import { describe, expect, it } from "vite-plus/test";

import { resolveMobileStageLabel } from "./mobileBranding";

// Marcode-owned: upstream returns "Alpha" for the stable channel and deleted this test in #8397.
// Marcode returns "" so the header badge is hidden on production builds. Keep this pinned so a
// future upstream sync conflicts loudly instead of silently reinstating the "Alpha" badge.
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
