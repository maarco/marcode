import { describe, expect, it } from "vite-plus/test";

import {
  checkForkBoundaries,
  formatForkBoundaryReport,
  loadForkBoundaryManifest,
} from "./fork-boundary.ts";

const repoRoot = new URL("../../", import.meta.url).pathname;

describe("fork boundary manifest", () => {
  it("has unique rules with existing owners and proof surfaces", () => {
    const manifest = loadForkBoundaryManifest(repoRoot);
    expect(manifest.version).toBe(1);
    expect(new Set(manifest.rules.map((rule) => rule.id)).size).toBe(manifest.rules.length);
    for (const rule of manifest.rules) {
      expect(rule.upstreamSurface.length).toBeGreaterThan(0);
      expect(rule.marcodeOwner.length).toBeGreaterThan(0);
      expect(rule.focusedTests.length).toBeGreaterThan(0);
      expect(rule.liveVerification.length).toBeGreaterThan(0);
    }
  });

  it("reports only declared seams touched by an upstream plan", () => {
    const report = checkForkBoundaries(repoRoot, [
      "apps/web/src/components/ChatView.tsx",
      "apps/web/src/components/ChatView.logic.ts",
    ]);
    expect(report.matchedRules.map((rule) => rule.id)).toEqual(["chat-ambient-effects"]);
    expect(formatForkBoundaryReport(report)).toContain("chat-ambient-effects");
    expect(formatForkBoundaryReport(report)).toContain("chatAmbientAnimation.test.ts");
  });

  it("does not turn an unrelated upstream path into a false boundary finding", () => {
    const report = checkForkBoundaries(repoRoot, ["apps/web/src/components/Unrelated.tsx"]);
    expect(report.matchedRules).toEqual([]);
    expect(formatForkBoundaryReport(report)).toContain("none of the declared seams changed");
  });
});
