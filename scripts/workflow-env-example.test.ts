// @effect-diagnostics nodeBuiltinImport:off - Static workflow assertions read checked-in files directly.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

// ── Marcode fork seam ──
// Workflows that lift public configuration out of `.env.example` name the
// variables inline. Marcode renamed those names from upstream's `T3CODE_*` to
// `MARCODE_*`, and an upstream workflow that arrives with the old names merges
// without a conflict and then fails at release time with "missing or
// malformed in .env.example". Pin the join so the next sync fails here instead.

const repoRoot = NodePath.dirname(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)));

const read = (relativePath: string): string =>
  NodeFS.readFileSync(NodePath.join(repoRoot, relativePath), "utf8");

const envExampleNames = new Set(
  read(".env.example")
    .split("\n")
    .flatMap((line) => {
      const match = /^([A-Z][A-Z0-9_]*)=/u.exec(line);
      return match?.[1] === undefined ? [] : [match[1]];
    }),
);

// `for key in <output>:<ENV_NAME> ...; do` — the shape both preview publishing
// and any later workflow use to read `.env.example` into step outputs.
const readsEnvExample = (workflow: string): ReadonlyArray<string> =>
  [...workflow.matchAll(/\bfor key in ((?:[a-z0-9_]+:[A-Z][A-Z0-9_]*\s*)+);\s*do/gu)].flatMap(
    (match) =>
      (match[1] ?? "")
        .trim()
        .split(/\s+/u)
        .map((pair) => pair.split(":")[1] ?? ""),
  );

describe("workflows that read .env.example", () => {
  const workflowsDir = NodePath.join(repoRoot, ".github/workflows");
  const workflows = NodeFS.readdirSync(workflowsDir).filter((name) => name.endsWith(".yml"));

  it("names variables that .env.example actually defines", () => {
    const missing = workflows.flatMap((name) =>
      readsEnvExample(read(`.github/workflows/${name}`))
        .filter((variable) => !envExampleNames.has(variable))
        .map((variable) => `${name}: ${variable}`),
    );
    expect(missing).toEqual([]);
  });

  it("covers the preview publish workflow, so the check cannot silently match nothing", () => {
    expect(readsEnvExample(read(".github/workflows/desktop-macos-preview-publish.yml"))).toEqual([
      "MARCODE_CLERK_PUBLISHABLE_KEY",
      "MARCODE_CLERK_JWT_TEMPLATE",
      "MARCODE_CLERK_CLI_OAUTH_CLIENT_ID",
      "MARCODE_RELAY_URL",
    ]);
  });
});
