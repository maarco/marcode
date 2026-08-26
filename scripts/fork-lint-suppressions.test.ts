// @effect-diagnostics nodeBuiltinImport:off - Static repository assertions read checked-in files directly.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { expect, it } from "vite-plus/test";

const repoRoot = NodePath.dirname(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)));

const SEARCH_ROOTS = ["apps", "packages", "scripts"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "build", ".repos", ".marcode"]);

/**
 * Upstream writes suppressions against its own plugin name; Marcode's custom
 * oxlint plugin is registered as `marcode`. A `t3code/`-namespaced suppression
 * therefore matches no rule here, so the rule it meant to silence fires as a
 * hard error — and because the comment merges cleanly, nothing flags it.
 */
const STALE_SUPPRESSION = /oxlint-disable(?:-next-line|-line)?\s+t3code\//;

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of NodeFS.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      yield* sourceFiles(NodePath.join(directory, entry.name));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(NodePath.extname(entry.name))) {
      yield NodePath.join(directory, entry.name);
    }
  }
}

it("has no oxlint suppressions left pointing at upstream's plugin name", () => {
  const offenders: string[] = [];
  for (const root of SEARCH_ROOTS) {
    const absoluteRoot = NodePath.join(repoRoot, root);
    if (!NodeFS.existsSync(absoluteRoot)) continue;
    for (const file of sourceFiles(absoluteRoot)) {
      const source = NodeFS.readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        if (STALE_SUPPRESSION.test(line)) {
          offenders.push(`${NodePath.relative(repoRoot, file)}:${index + 1}`);
        }
      });
    }
  }

  // Rewrite each hit's `t3code/` prefix to `marcode/`. Upstream #7140 shipped
  // one of these and it merged without a conflict, turning a silenced rule
  // into a CI error that only reproduces on the fork.
  expect(offenders).toEqual([]);
});
