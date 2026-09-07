// @effect-diagnostics nodeBuiltinImport:off - Glob matching uses node:path.matchesGlob directly.
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { fromYaml } from "@t3tools/shared/schemaYaml";

export const UPSTREAM_SYNC_MANIFEST_PATH = ".github/upstream-sync.yml";
export const UPSTREAM_SYNC_WORKFLOW_PATH = ".github/workflows/upstream-sync.yml";

/** The only placeholder any manifest template may contain. */
export const UPSTREAM_SHORT_SHA_PLACEHOLDER = "upstreamShortSha";
const SHORT_SHA_LENGTH = 12;
/** Rendered against this sample so an invalid branch template fails at load, not at merge time. */
const SAMPLE_SHORT_SHA = "0123456789ab";

const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

const RemoteRef = Schema.Struct({
  remote: NonEmptyString,
  url: NonEmptyString,
  branch: NonEmptyString,
});

export const UpstreamSyncHotspot = Schema.Struct({
  path: NonEmptyString,
  owner: NonEmptyString,
  reason: NonEmptyString,
});
export type UpstreamSyncHotspot = typeof UpstreamSyncHotspot.Type;

export const UpstreamSyncCoupledChange = Schema.Struct({
  source: NonEmptyString,
  companion: NonEmptyString,
  check: NonEmptyString,
});
export type UpstreamSyncCoupledChange = typeof UpstreamSyncCoupledChange.Type;

/**
 * The four destructive policy fields are literals on purpose: enabling one is a configuration
 * error the parser rejects, not a behaviour the tooling silently adopts.
 */
export const UpstreamSyncManifest = Schema.Struct({
  version: Schema.Literal(1),
  source: RemoteRef,
  target: RemoteRef,
  integration: Schema.Struct({
    strategy: Schema.Literal("merge"),
    mergeMessage: NonEmptyString,
    branchTemplate: NonEmptyString,
    requireCleanWorktree: Schema.Literal(true),
    allowDirectBasePush: Schema.Literal(false),
    allowForcePush: Schema.Literal(false),
    autoResolveConflicts: Schema.Literal(false),
    autoMergePullRequest: Schema.Literal(false),
  }),
  schedule: Schema.Struct({
    enabled: Schema.Boolean,
    cron: NonEmptyString,
  }),
  pullRequest: Schema.Struct({
    draft: Schema.Literal(true),
    singleFlight: Schema.Literal(true),
    titleTemplate: NonEmptyString,
    labels: Schema.Array(NonEmptyString),
    reviewers: Schema.Array(NonEmptyString),
  }),
  hotspots: Schema.Array(UpstreamSyncHotspot),
  coupledChanges: Schema.Array(UpstreamSyncCoupledChange),
  requiredPullRequestChecks: Schema.Array(NonEmptyString),
});
export type UpstreamSyncManifest = typeof UpstreamSyncManifest.Type;

export class UpstreamSyncConfigFileError extends Schema.TaggedErrorClass<UpstreamSyncConfigFileError>()(
  "UpstreamSyncConfigFileError",
  {
    operation: Schema.Literals(["read"]),
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Upstream sync manifest operation "${this.operation}" failed for ${this.path}.`;
  }
}

export class UpstreamSyncConfigParseError extends Schema.TaggedErrorClass<UpstreamSyncConfigParseError>()(
  "UpstreamSyncConfigParseError",
  {
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Upstream sync manifest at ${this.path} is not valid.`;
  }
}

export class UpstreamSyncConfigPolicyError extends Schema.TaggedErrorClass<UpstreamSyncConfigPolicyError>()(
  "UpstreamSyncConfigPolicyError",
  {
    path: Schema.String,
    rule: Schema.String,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Upstream sync policy "${this.rule}" rejected ${this.path}: ${this.detail}`;
  }
}

export const UpstreamSyncConfigError = Schema.Union([
  UpstreamSyncConfigFileError,
  UpstreamSyncConfigParseError,
  UpstreamSyncConfigPolicyError,
]);
export type UpstreamSyncConfigError = typeof UpstreamSyncConfigError.Type;
export const isUpstreamSyncConfigError = Schema.is(UpstreamSyncConfigError);

const decodeManifest = Schema.decodeEffect(fromYaml(UpstreamSyncManifest));
const decodeYamlUnknown = Schema.decodeEffect(fromYaml(Schema.Unknown));

function policy(path: string, rule: string, detail: string): UpstreamSyncConfigPolicyError {
  return new UpstreamSyncConfigPolicyError({ path, rule, detail });
}

/** Truncates a full object name to the short form used in branch names, titles, and messages. */
export function shortenSha(sha: string): string {
  return sha.trim().toLowerCase().slice(0, SHORT_SHA_LENGTH);
}

export function renderTemplate(template: string, shortSha: string): string {
  return template.replaceAll(`{${UPSTREAM_SHORT_SHA_PLACEHOLDER}}`, shortSha);
}

export function renderIntegrationBranch(manifest: UpstreamSyncManifest, shortSha: string): string {
  return renderTemplate(manifest.integration.branchTemplate, shortSha);
}

export function renderMergeMessage(manifest: UpstreamSyncManifest, shortSha: string): string {
  return renderTemplate(manifest.integration.mergeMessage, shortSha);
}

export function renderPullRequestTitle(manifest: UpstreamSyncManifest, shortSha: string): string {
  return renderTemplate(manifest.pullRequest.titleTemplate, shortSha);
}

function unknownPlaceholders(template: string): ReadonlyArray<string> {
  return [...template.matchAll(/\{([^{}]*)\}/g)]
    .map((match) => match[1] ?? "")
    .filter((name) => name !== UPSTREAM_SHORT_SHA_PLACEHOLDER);
}

/**
 * Pure subset of `git check-ref-format --branch`. Kept pure so manifest validation never has to
 * spawn a process.
 */
export function isValidBranchName(branch: string): boolean {
  if (branch.length === 0 || branch === "@") return false;
  if (branch.startsWith("/") || branch.endsWith("/") || branch.includes("//")) return false;
  if (branch.startsWith("-") || branch.endsWith(".") || branch.endsWith(".lock")) return false;
  if (branch.includes("..") || branch.includes("@{")) return false;
  if (/[\s~^:?*[\]\\]/.test(branch)) return false;
  if ([...branch].some((character) => (character.codePointAt(0) ?? 0) < 0x20)) return false;
  return branch
    .split("/")
    .every(
      (segment) => segment.length > 0 && !segment.startsWith(".") && !segment.endsWith(".lock"),
    );
}

/** Rejects patterns that cannot describe a repository-relative path. */
export function isValidPathGlob(pattern: string): boolean {
  if (pattern.length === 0) return false;
  if (pattern.startsWith("/") || /^[A-Za-z]:/.test(pattern)) return false;
  if (pattern.includes("\\")) return false;
  if (pattern.split("/").includes("..")) return false;
  const balanced = (open: string, close: string) => {
    let depth = 0;
    for (const character of pattern) {
      if (character === open) depth += 1;
      if (character === close) depth -= 1;
      if (depth < 0) return false;
    }
    return depth === 0;
  };
  return balanced("[", "]") && balanced("{", "}");
}

/** Strips any credentials from a remote URL so it is safe to print, log, or embed in a report. */
export function redactRemoteUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1***@");
}

function matchesAny(path: string, pattern: string): boolean {
  return path === pattern || NodePath.matchesGlob(path, pattern);
}

/**
 * Returns the changed paths that a hotspot claims, carrying the owner and reason of the first
 * matching hotspot. Hotspots are review metadata — they never select a merge side.
 */
export function matchHotspots(
  manifest: UpstreamSyncManifest,
  changedPaths: ReadonlyArray<string>,
): ReadonlyArray<UpstreamSyncHotspot> {
  const matches: Array<UpstreamSyncHotspot> = [];
  for (const path of changedPaths) {
    const hotspot = manifest.hotspots.find((candidate) => matchesAny(path, candidate.path));
    if (hotspot) {
      matches.push({ path, owner: hotspot.owner, reason: hotspot.reason });
    }
  }
  return matches.toSorted((left, right) => (left.path < right.path ? -1 : 1));
}

export interface UpstreamSyncCoupledChangeFinding {
  readonly check: string;
  readonly sourceChanged: boolean;
  readonly companionChanged: boolean;
  readonly ok: boolean;
}

/** A dependency that moved without its vendored subtree is a blocking finding, never an auto-fix. */
export function evaluateCoupledChanges(
  manifest: UpstreamSyncManifest,
  changedPaths: ReadonlyArray<string>,
): ReadonlyArray<UpstreamSyncCoupledChangeFinding> {
  return manifest.coupledChanges.map((coupled) => {
    const sourceChanged = changedPaths.some((path) => matchesAny(path, coupled.source));
    const companionChanged = changedPaths.some((path) => matchesAny(path, coupled.companion));
    return {
      check: coupled.check,
      sourceChanged,
      companionChanged,
      ok: !sourceChanged || companionChanged,
    };
  });
}

function duplicates(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

export const validateUpstreamSyncConfig = Effect.fn("validateUpstreamSyncConfig")(function* (
  manifest: UpstreamSyncManifest,
  sourcePath: string,
) {
  for (const [field, ref] of [
    ["source", manifest.source],
    ["target", manifest.target],
  ] as const) {
    // file:// is permitted so the merge machinery is testable against local repositories;
    // the checked-in manifest is asserted to be https by its own test.
    if (!ref.url.startsWith("https://") && !ref.url.startsWith("file://")) {
      return yield* policy(
        sourcePath,
        `${field}-url-not-https`,
        `${field}.url must use https, got ${redactRemoteUrl(ref.url)}.`,
      );
    }
  }

  if (manifest.source.url === manifest.target.url) {
    return yield* policy(
      sourcePath,
      "source-target-url-identical",
      "source.url and target.url must be different repositories.",
    );
  }

  for (const [field, template] of [
    ["integration.mergeMessage", manifest.integration.mergeMessage],
    ["integration.branchTemplate", manifest.integration.branchTemplate],
    ["pullRequest.titleTemplate", manifest.pullRequest.titleTemplate],
  ] as const) {
    const unknown = unknownPlaceholders(template);
    if (unknown.length > 0) {
      return yield* policy(
        sourcePath,
        "template-unknown-placeholder",
        `${field} uses unsupported placeholder(s): ${unknown.map((name) => `{${name}}`).join(", ")}.`,
      );
    }
  }

  if (!manifest.integration.branchTemplate.includes(`{${UPSTREAM_SHORT_SHA_PLACEHOLDER}}`)) {
    return yield* policy(
      sourcePath,
      "branch-template-missing-sha",
      `integration.branchTemplate must contain {${UPSTREAM_SHORT_SHA_PLACEHOLDER}} so each upstream commit gets its own branch.`,
    );
  }

  const sampleBranch = renderIntegrationBranch(manifest, SAMPLE_SHORT_SHA);
  if (!isValidBranchName(sampleBranch)) {
    return yield* policy(
      sourcePath,
      "branch-template-invalid-ref",
      `integration.branchTemplate renders the invalid branch name "${sampleBranch}".`,
    );
  }

  for (const hotspot of manifest.hotspots) {
    if (!isValidPathGlob(hotspot.path)) {
      return yield* policy(
        sourcePath,
        "hotspot-invalid-glob",
        `hotspot path "${hotspot.path}" is not a repository-relative glob.`,
      );
    }
  }

  for (const coupled of manifest.coupledChanges) {
    for (const pattern of [coupled.source, coupled.companion]) {
      if (!isValidPathGlob(pattern)) {
        return yield* policy(
          sourcePath,
          "hotspot-invalid-glob",
          `coupled change "${coupled.check}" uses the invalid glob "${pattern}".`,
        );
      }
    }
  }

  const duplicateChecks: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    ["hotspot-duplicate-path", duplicates(manifest.hotspots.map((hotspot) => hotspot.path))],
    [
      "coupled-change-duplicate",
      duplicates(manifest.coupledChanges.map((coupled) => coupled.check)),
    ],
    ["required-check-duplicate", duplicates(manifest.requiredPullRequestChecks)],
    ["label-duplicate", duplicates(manifest.pullRequest.labels)],
  ];
  for (const [rule, repeated] of duplicateChecks) {
    if (repeated.length > 0) {
      return yield* policy(sourcePath, rule, `duplicate entries: ${repeated.join(", ")}.`);
    }
  }

  return manifest;
});

export const parseUpstreamSyncConfig = Effect.fn("parseUpstreamSyncConfig")(function* (
  content: string,
  sourcePath: string,
) {
  const manifest = yield* decodeManifest(content).pipe(
    Effect.mapError((cause) => new UpstreamSyncConfigParseError({ path: sourcePath, cause })),
  );
  return yield* validateUpstreamSyncConfig(manifest, sourcePath);
});

function workflowCrons(workflow: unknown): ReadonlyArray<string> | undefined {
  if (typeof workflow !== "object" || workflow === null) return undefined;
  const record = workflow as Record<string, unknown>;
  // YAML 1.1 parsers fold the `on:` key to boolean true; accept both spellings.
  const triggers = record["on"] ?? record["true"];
  if (typeof triggers !== "object" || triggers === null) return undefined;
  const schedule = (triggers as Record<string, unknown>)["schedule"];
  if (!Array.isArray(schedule)) return undefined;
  return schedule.map((entry) =>
    typeof entry === "object" && entry !== null
      ? String((entry as Record<string, unknown>).cron)
      : "",
  );
}

export const assertWorkflowScheduleParity = Effect.fn("assertWorkflowScheduleParity")(function* (
  manifest: UpstreamSyncManifest,
  workflowContent: string,
  workflowPath: string,
) {
  const workflow = yield* decodeYamlUnknown(workflowContent).pipe(
    Effect.mapError((cause) => new UpstreamSyncConfigParseError({ path: workflowPath, cause })),
  );
  const crons = workflowCrons(workflow);

  if (!manifest.schedule.enabled) {
    return;
  }

  if (!crons || crons.length === 0) {
    return yield* policy(
      workflowPath,
      "workflow-schedule-missing",
      `schedule.enabled is true but the workflow declares no cron. Set schedule.enabled to false to run on workflow_dispatch only.`,
    );
  }

  if (crons.length !== 1 || crons[0] !== manifest.schedule.cron) {
    return yield* policy(
      workflowPath,
      "workflow-cron-mismatch",
      // @effect-diagnostics-next-line preferSchemaOverJson:off
      `workflow cron ${JSON.stringify(crons)} does not match manifest schedule.cron "${manifest.schedule.cron}".`,
    );
  }
});

export const loadUpstreamSyncConfig = Effect.fn("loadUpstreamSyncConfig")(function* (
  rootDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifestPath = path.join(rootDir, UPSTREAM_SYNC_MANIFEST_PATH);
  const content = yield* fs
    .readFileString(manifestPath)
    .pipe(
      Effect.mapError(
        (cause) =>
          new UpstreamSyncConfigFileError({ operation: "read", path: manifestPath, cause }),
      ),
    );
  const manifest = yield* parseUpstreamSyncConfig(content, manifestPath);

  const workflowPath = path.join(rootDir, UPSTREAM_SYNC_WORKFLOW_PATH);
  if (yield* fs.exists(workflowPath)) {
    const workflowContent = yield* fs
      .readFileString(workflowPath)
      .pipe(
        Effect.mapError(
          (cause) =>
            new UpstreamSyncConfigFileError({ operation: "read", path: workflowPath, cause }),
        ),
      );
    yield* assertWorkflowScheduleParity(manifest, workflowContent, workflowPath);
  }

  return manifest;
});
