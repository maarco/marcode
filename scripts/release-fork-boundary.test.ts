// @effect-diagnostics nodeBuiltinImport:off - Static workflow assertions read checked-in files directly.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { parse as parseYaml } from "yaml";

const repoRoot = NodePath.dirname(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(repoRoot, relativePath), "utf8");
}

const releaseWorkflow = parseYaml(read(".github/workflows/release.yml")) as {
  jobs: Record<string, Record<string, unknown>>;
};

/**
 * Upstream's release pipeline publishes the `t3code-bin` / `t3code-nightly-bin`
 * AUR packages, and the PKGBUILDs under `packaging/aur` fetch their assets from
 * `pingdotgg/t3code` releases. Marcode owns neither the AUR package names nor
 * those release assets.
 *
 * `packaging/aur` and `.github/workflows/publish-aur.yml` are kept verbatim so
 * upstream syncs never conflict on them — which also means the call site is the
 * only thing standing between a Marcode release and a push to upstream's AUR
 * package. Removing that call site is invisible to a merge: upstream keeps
 * shipping the job and it would silently merge back in. Assert the removal so a
 * future sync fails here instead.
 */
describe("release workflow fork boundary", () => {
  it("does not wire upstream's AUR publish into Marcode releases", () => {
    expect(Object.keys(releaseWorkflow.jobs)).not.toContain("publish_aur");

    const callers = Object.entries(releaseWorkflow.jobs).filter(
      ([, job]) => typeof job.uses === "string" && job.uses.includes("publish-aur.yml"),
    );
    expect(callers).toEqual([]);
  });
});
