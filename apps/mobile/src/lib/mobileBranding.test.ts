// @effect-diagnostics nodeBuiltinImport:off - The brand-mark assertions read the checked-in component sources.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { resolveMobileStageLabel } from "./mobileBranding";

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

// ── Marcode fork seam ──
// Upstream deleted this file in #8397 as a low-signal test, and still ships
// `components/T3Wordmark.tsx` plus the lockups that render it. Marcode removed
// that component in favour of `MarcodeMark`, and a removal is invisible to a
// merge: upstream's version comes back with no conflict at all. Assert it so a
// future sync fails loudly instead of quietly restoring the T3 wordmark.
describe("mobile brand lockups", () => {
  const readComponent = (relativePath: string) =>
    NodeFS.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

  it.each([["components/CompactBrandTitle.tsx"], ["features/home/HomeHeader.tsx"]])(
    "renders the Marcode mark in %s",
    (relativePath) => {
      const source = readComponent(relativePath);

      expect(source).toMatch(/<MarcodeMark\b/);
      expect(source).not.toMatch(/<T3Wordmark\b/);
    },
  );

  it("keeps the T3 wordmark component out of the tree", () => {
    expect(NodeFS.existsSync(new URL("../components/T3Wordmark.tsx", import.meta.url))).toBe(false);
  });
});
