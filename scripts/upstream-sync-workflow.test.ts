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

const manifestSource = read(".github/upstream-sync.yml");
const workflowSource = read(".github/workflows/upstream-sync.yml");
const ciSource = read(".github/workflows/ci.yml");
const relayDeploySource = read(".github/workflows/deploy-relay.yml");

const manifest = parseYaml(manifestSource) as {
  schedule: { enabled: boolean; cron: string };
  pullRequest: { draft: boolean; titleTemplate: string; labels: string[]; reviewers: string[] };
  requiredPullRequestChecks: string[];
  target: { branch: string };
};
const workflow = parseYaml(workflowSource) as {
  on: { workflow_dispatch: null; schedule: Array<{ cron: string }> };
  permissions: Record<string, string>;
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, { "runs-on": string; steps: Array<Record<string, unknown>> }>;
};
const ci = parseYaml(ciSource) as {
  jobs: Record<string, { name: string; "runs-on": string; steps: Array<Record<string, unknown>> }>;
};
const relayDeploy = parseYaml(relayDeploySource) as {
  jobs: Record<string, { if: string; "runs-on": string }>;
};

const steps = workflow.jobs.prepare!.steps;

function stepByName(name: string): Record<string, unknown> {
  const step = steps.find((candidate) => candidate.name === name);
  if (!step) {
    throw new Error(`Missing workflow step "${name}".`);
  }
  return step;
}

/** Reads a `const <name> = [...]` array literal out of an embedded github-script block. */
function readArrayLiteral(name: string): string[] {
  const match = workflowSource.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`));
  if (!match?.[1]) {
    throw new Error(`Missing array literal "${name}" in the workflow.`);
  }
  return JSON.parse(match[1]) as string[];
}

describe("upstream-sync workflow", () => {
  it("parses as YAML with one prepare job on Ubuntu", () => {
    expect(Object.keys(workflow.jobs)).toEqual(["prepare"]);
    expect(workflow.jobs.prepare!["runs-on"]).toBe("ubuntu-24.04");
  });

  it("triggers manually and on the literal manifest cron", () => {
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on.schedule).toEqual([{ cron: manifest.schedule.cron }]);
    expect(manifest.schedule.enabled).toBe(true);
  });

  it("declares exactly the permissions it needs", () => {
    expect(workflow.permissions).toEqual({
      contents: "write",
      "pull-requests": "write",
      issues: "write",
    });
  });

  it("serializes runs through one non-cancelling concurrency group", () => {
    expect(workflow.concurrency).toEqual({
      group: "upstream-sync-main",
      "cancel-in-progress": false,
    });
  });

  it("checks out full history with persisted credentials", () => {
    const checkout = stepByName("Checkout") as { uses: string; with: Record<string, unknown> };
    expect(checkout.uses).toBe("actions/checkout@v6");
    expect(checkout.with["fetch-depth"]).toBe(0);
    expect(checkout.with["persist-credentials"]).toBe(true);
  });

  it("delegates every git decision to the sync script", () => {
    expect(workflowSource).not.toMatch(/^\s*git /m);
    expect(workflowSource).toContain("node scripts/upstream-sync.ts status");
    expect(workflowSource).toContain("node scripts/upstream-sync.ts plan --json-output");
    expect(workflowSource).toContain("node scripts/upstream-sync.ts integrate");
  });

  it("never force pushes, resets, or writes directly to the base branch", () => {
    // Only shell bodies can run git; the github-script bodies are API calls and prose.
    const shell = steps.map((step) => (typeof step.run === "string" ? step.run : "")).join("\n");
    expect(shell).not.toMatch(/--force|force-with-lease|--hard|\breset\b|git push/);
    expect(workflowSource).not.toMatch(/git push|git reset|git checkout/);
    expect(workflowSource).not.toMatch(new RegExp(`git[^\\n]*:${manifest.target.branch}\\b`));
  });

  it("never auto-merges a pull request", () => {
    expect(workflowSource).not.toMatch(
      /enablePullRequestAutoMerge|pulls\.merge|gh pr merge|automerge/i,
    );
  });

  it("uploads the plan report on every non-no-op result", () => {
    const upload = stepByName("Upload plan report") as {
      if: string;
      with: Record<string, unknown>;
    };
    expect(upload.if).toContain("always()");
    expect(upload.if).toContain("steps.plan.outputs.status != 'up-to-date'");
    expect(upload.with["if-no-files-found"]).toBe("ignore");
  });

  it("stops successfully on a no-op without creating a branch", () => {
    const noop = stepByName("Report no-op") as { if: string; run: string };
    expect(noop.if).toContain("steps.plan.outputs.status == 'up-to-date'");
    expect(noop.run).toContain("GITHUB_STEP_SUMMARY");
    expect(noop.run).not.toContain("integrate");
  });

  it("creates or updates one tracking issue and fails on blocked runs", () => {
    const blocked = stepByName("Report blocked sync") as { if: string; with: { script: string } };
    expect(blocked.if).toContain("steps.plan.outputs.status == 'conflicted'");
    expect(blocked.if).toContain("steps.plan.outputs.status == 'unrelated-history'");
    expect(blocked.with.script).toContain("upstream sync blocked:");
    expect(blocked.with.script).toContain("upstream-sync-blocked");
    expect(blocked.with.script).toContain("issues.update");
    expect(blocked.with.script).toContain("issues.create");
    expect(blocked.with.script).toContain("core.setFailed");
    // A blocked run must never reach integration.
    expect(blocked.with.script).not.toContain("pulls.create");
  });

  it("keeps the label failure separate from the issue itself", () => {
    const blocked = stepByName("Report blocked sync") as { with: { script: string } };
    expect(blocked.with.script).toContain("labelAvailable = false");
    expect(blocked.with.script).toContain("core.warning");
  });

  it("integrates and pushes only on a clean merge", () => {
    const integrate = stepByName("Integrate and push") as { if: string; run: string };
    expect(integrate.if).toContain("steps.plan.outputs.status == 'clean-merge'");
    expect(integrate.run).toContain("--push");
  });

  it("describes the merge it actually made, not the earlier plan", () => {
    // Upstream can advance between `plan` and `integrate`; the PR body must come from the report
    // `integrate` acted on.
    const pr = stepByName("Create or update draft pull request") as {
      env: Record<string, string>;
      with: { script: string };
    };
    expect(Object.keys(pr.env)).toEqual(["INTEGRATE_REPORT"]);
    expect(pr.with.script).toContain("integration.plan");
    expect(pr.with.script).toContain("integration.integrationBranch");
    expect(pr.with.script).toContain("integration.mergeSha");
  });

  it("reuses an existing pull request before creating one", () => {
    const pr = stepByName("Create or update draft pull request") as {
      if: string;
      with: { script: string };
    };
    expect(pr.if).toContain("steps.integrate.outputs.pushed == 'true'");
    const script = pr.with.script;
    expect(script.indexOf("pulls.list")).toBeGreaterThan(-1);
    expect(script.indexOf("pulls.list")).toBeLessThan(script.indexOf("pulls.create"));
    expect(script).toContain("pulls.update");
    expect(script).toContain("draft: true");
    expect(script).toContain("No conflicts were auto-resolved");
    expect(script).toContain("html_url");
  });

  it("tolerates an empty reviewer list", () => {
    expect(readArrayLiteral("reviewers")).toEqual(manifest.pullRequest.reviewers);
    const pr = stepByName("Create or update draft pull request") as { with: { script: string } };
    expect(pr.with.script).toContain("if (reviewers.length)");
    expect(pr.with.script).toContain("core.warning(`Could not request reviewers");
  });

  it("keeps pull-request literals equal to the manifest", () => {
    expect(manifest.pullRequest.draft).toBe(true);
    expect(readArrayLiteral("labels")).toEqual(manifest.pullRequest.labels);
    expect(workflowSource).toContain(
      `\`${manifest.pullRequest.titleTemplate.replace("{upstreamShortSha}", "${shortSha}")}\``,
    );
  });

  it("advertises required checks that exist as CI jobs", () => {
    const requiredChecks = readArrayLiteral("requiredChecks");
    expect(requiredChecks).toEqual(manifest.requiredPullRequestChecks);
    const ciJobNames = Object.values(ci.jobs).map((job) => job.name);
    for (const check of requiredChecks) {
      expect(ciJobNames).toContain(check);
    }
  });

  // Upstream runs default CI on Blacksmith. The fork has no Blacksmith
  // installation, so a Blacksmith label leaves the job queued forever. Upstream
  // adding a job is a clean merge, so assert on the labels rather than a job
  // list: a new upstream job arrives here loudly instead of silently hanging.
  it("uses runners available to the public fork for default CI", () => {
    const runners = Object.values(ci.jobs).map((job) => job["runs-on"]);
    expect(runners.length).toBeGreaterThan(0);
    for (const runner of runners) {
      expect(["ubuntu-24.04", "macos-26"]).toContain(runner);
    }
  });

  it("installs the workspace search dependency before running tests", () => {
    const testSteps = ci.jobs.test!.steps;
    const installStep = testSteps.find(
      (step) => step.name === "Install workspace search dependency",
    );
    expect(installStep?.run).toContain("apt-get install --yes ripgrep");
  });

  it("keeps production relay deployment disabled until the fork opts in", () => {
    expect(relayDeploy.jobs.deploy_relay).toMatchObject({
      if: "vars.RELAY_DEPLOY_ENABLED == 'true'",
      "runs-on": "ubuntu-24.04",
    });
  });
});
