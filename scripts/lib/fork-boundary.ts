// @effect-diagnostics nodeBuiltinImport:off - This is a repository policy checker.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { parse as parseYaml } from "yaml";

export interface ForkBoundaryRule {
  readonly id: string;
  readonly upstreamSurface: readonly string[];
  readonly marcodeOwner: readonly string[];
  readonly invariant: string;
  readonly compatibilityIdentifiers: readonly string[];
  readonly focusedTests: readonly string[];
  readonly liveVerification: readonly string[];
}

export interface ForkBoundaryManifest {
  readonly version: 1;
  readonly rules: readonly ForkBoundaryRule[];
}

export interface ForkBoundaryReport {
  readonly manifestVersion: 1;
  readonly changedPaths: readonly string[];
  readonly matchedRules: readonly ForkBoundaryRule[];
}

const MANIFEST_PATH = ".github/fork-boundary.yml";

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  return value.map((item, index) => nonEmptyString(item, `${label}[${index}]`));
}

function repoRelativePath(value: string, label: string): string {
  if (NodePath.isAbsolute(value) || value.split("/").includes("..")) {
    throw new Error(`${label} must be repository-relative: ${value}`);
  }
  return value;
}

function parseRule(value: unknown, index: number): ForkBoundaryRule {
  if (typeof value !== "object" || value === null) {
    throw new Error(`rules[${index}] must be an object.`);
  }
  const rule = value as Record<string, unknown>;
  const prefix = `rules[${index}]`;
  return {
    id: nonEmptyString(rule.id, `${prefix}.id`),
    upstreamSurface: stringArray(rule.upstreamSurface, `${prefix}.upstreamSurface`).map((path) =>
      repoRelativePath(path, `${prefix}.upstreamSurface`),
    ),
    marcodeOwner: stringArray(rule.marcodeOwner, `${prefix}.marcodeOwner`).map((path) =>
      repoRelativePath(path, `${prefix}.marcodeOwner`),
    ),
    invariant: nonEmptyString(rule.invariant, `${prefix}.invariant`),
    compatibilityIdentifiers: stringArray(
      rule.compatibilityIdentifiers,
      `${prefix}.compatibilityIdentifiers`,
    ),
    focusedTests: stringArray(rule.focusedTests, `${prefix}.focusedTests`).map((path) =>
      repoRelativePath(path, `${prefix}.focusedTests`),
    ),
    liveVerification: stringArray(rule.liveVerification, `${prefix}.liveVerification`),
  };
}

export function loadForkBoundaryManifest(rootDir: string): ForkBoundaryManifest {
  const path = NodePath.join(rootDir, MANIFEST_PATH);
  const parsed = parseYaml(NodeFS.readFileSync(path, "utf8")) as Record<string, unknown>;
  if (parsed.version !== 1) {
    throw new Error(`${MANIFEST_PATH} must declare version: 1.`);
  }
  if (!Array.isArray(parsed.rules) || parsed.rules.length === 0) {
    throw new Error(`${MANIFEST_PATH} must declare at least one rule.`);
  }

  const rules = parsed.rules.map(parseRule);
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`Duplicate fork-boundary rule id: ${rule.id}.`);
    ids.add(rule.id);

    for (const relativePath of [
      ...rule.upstreamSurface,
      ...rule.marcodeOwner,
      ...rule.focusedTests,
    ]) {
      if (!NodeFS.existsSync(NodePath.join(rootDir, relativePath))) {
        throw new Error(`Fork-boundary rule ${rule.id} references missing path ${relativePath}.`);
      }
    }
  }

  return { version: 1, rules };
}

export function checkForkBoundaries(
  rootDir: string,
  changedPaths: readonly string[] = [],
): ForkBoundaryReport {
  const manifest = loadForkBoundaryManifest(rootDir);
  const changed = new Set(changedPaths);
  const matchedRules = manifest.rules.filter((rule) =>
    rule.upstreamSurface.some((path) => changed.has(path)),
  );
  return {
    manifestVersion: manifest.version,
    changedPaths: [...changedPaths],
    matchedRules,
  };
}

export function formatForkBoundaryReport(report: ForkBoundaryReport): string {
  if (report.matchedRules.length === 0) {
    return "fork boundaries: none of the declared seams changed";
  }
  const lines = [`fork boundaries: ${report.matchedRules.length} declared seam(s) changed`];
  for (const rule of report.matchedRules) {
    lines.push(`- ${rule.id}: ${rule.invariant}`);
    lines.push(`  focused tests: ${rule.focusedTests.join(", ")}`);
    lines.push(`  live verification: ${rule.liveVerification.join("; ")}`);
  }
  return lines.join("\n");
}

function parseArguments(args: readonly string[]): {
  readonly planPath: string | undefined;
  readonly jsonOutput: string | undefined;
} {
  let planPath: string | undefined;
  let jsonOutput: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--plan") planPath = args[++index];
    else if (argument === "--json-output") jsonOutput = args[++index];
    else throw new Error(`Unknown fork-boundary argument: ${argument}`);
  }
  return { planPath, jsonOutput };
}

export function runForkBoundaryCli(args: readonly string[], rootDir: string): void {
  const [command, ...commandArgs] = args;
  if (command !== "check") {
    throw new Error(
      "Usage: node scripts/fork-boundary.ts check [--plan path] [--json-output path]",
    );
  }
  const { planPath, jsonOutput } = parseArguments(commandArgs);
  const plan = planPath
    ? (JSON.parse(NodeFS.readFileSync(NodePath.resolve(planPath), "utf8")) as {
        changedPaths?: unknown;
      })
    : undefined;
  const changedPaths = Array.isArray(plan?.changedPaths)
    ? plan.changedPaths.map((path) => nonEmptyString(path, "plan.changedPaths entry"))
    : [];
  const report = checkForkBoundaries(rootDir, changedPaths);
  process.stdout.write(`${formatForkBoundaryReport(report)}\n`);
  if (jsonOutput) {
    const absolute = NodePath.resolve(jsonOutput);
    NodeFS.mkdirSync(NodePath.dirname(absolute), { recursive: true });
    NodeFS.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
  }
}

if (import.meta.main) {
  runForkBoundaryCli(process.argv.slice(2), process.cwd());
}
