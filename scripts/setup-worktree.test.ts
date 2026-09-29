// @effect-diagnostics nodeBuiltinImport:off - reads the checked-in setup script as text.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

// ── Marcode fork seam ──
// Upstream's worktree setup script reads T3CODE_PROJECT_ROOT, but Marcode's
// project script runtime exports MARCODE_PROJECT_ROOT
// (packages/shared/src/projectScripts.ts). An upstream sync that rewrites the
// script merges cleanly and then throws on every worktree creation, so pin the
// variable the script actually reads.
const source = NodeFS.readFileSync(NodePath.join(import.meta.dirname, "setup-worktree.ts"), "utf8");

describe("setup-worktree", () => {
  it("reads the project root from Marcode's project script environment", () => {
    expect(source).toContain("process.env.MARCODE_PROJECT_ROOT");
  });

  it("does not read the upstream project root variable", () => {
    expect(source).not.toContain("process.env.T3CODE_PROJECT_ROOT");
  });
});
