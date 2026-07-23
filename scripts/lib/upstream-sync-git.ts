import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  evaluateCoupledChanges,
  loadUpstreamSyncConfig,
  matchHotspots,
  redactRemoteUrl,
  renderIntegrationBranch,
  renderMergeMessage,
  shortenSha,
  type UpstreamSyncManifest,
} from "./upstream-sync-config.ts";

/** Repository-local identity for merge commits the automation creates. No attribution footers. */
export const BOT_NAME = "marcode-upstream-bot";
export const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

const RECORD_SEPARATOR = "\u001e";
const FIELD_SEPARATOR = "\u001f";

export const UpstreamSyncPlanStatus = Schema.Literals([
  "up-to-date",
  "clean-merge",
  "conflicted",
  "unrelated-history",
  "error",
]);
export type UpstreamSyncPlanStatus = typeof UpstreamSyncPlanStatus.Type;

const RemoteRefReport = Schema.Struct({
  url: Schema.String,
  branch: Schema.String,
  sha: Schema.String,
});

export const UpstreamSyncPlanReport = Schema.Struct({
  status: UpstreamSyncPlanStatus,
  generatedAt: Schema.String,
  source: RemoteRefReport,
  target: RemoteRefReport,
  mergeBase: Schema.NullOr(Schema.String),
  upstreamCommits: Schema.Array(
    Schema.Struct({
      sha: Schema.String,
      title: Schema.String,
      author: Schema.String,
      authoredAt: Schema.String,
    }),
  ),
  changedPaths: Schema.Array(Schema.String),
  hotspotMatches: Schema.Array(
    Schema.Struct({ path: Schema.String, owner: Schema.String, reason: Schema.String }),
  ),
  conflicts: Schema.Array(
    Schema.Struct({ path: Schema.String, stages: Schema.Array(Schema.String) }),
  ),
  coupledChangeFindings: Schema.Array(
    Schema.Struct({
      check: Schema.String,
      sourceChanged: Schema.Boolean,
      companionChanged: Schema.Boolean,
      ok: Schema.Boolean,
    }),
  ),
});
export type UpstreamSyncPlanReport = typeof UpstreamSyncPlanReport.Type;

export const UpstreamSyncIntegrateReport = Schema.Struct({
  status: Schema.Literals(["up-to-date", "integrated"]),
  integrationBranch: Schema.NullOr(Schema.String),
  mergeSha: Schema.NullOr(Schema.String),
  pushed: Schema.Boolean,
  plan: UpstreamSyncPlanReport,
});
export type UpstreamSyncIntegrateReport = typeof UpstreamSyncIntegrateReport.Type;

export class UpstreamSyncGitError extends Schema.TaggedErrorClass<UpstreamSyncGitError>()(
  "UpstreamSyncGitError",
  {
    operation: Schema.String,
    phase: Schema.Literals(["spawn", "communicate", "exit"]),
    argumentCount: Schema.Number,
    remote: Schema.optional(Schema.String),
    exitCode: Schema.optional(Schema.Number),
    stdoutLength: Schema.optional(Schema.Number),
    stderrLength: Schema.optional(Schema.Number),
    stderrSummary: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    const remote = this.remote ? ` (${this.remote})` : "";
    return `git ${this.operation}${remote} failed during "${this.phase}"${
      this.exitCode === undefined ? "" : ` with exit code ${this.exitCode}`
    }.${this.stderrSummary ? ` ${this.stderrSummary}` : ""}`;
  }
}

export class UpstreamSyncStateError extends Schema.TaggedErrorClass<UpstreamSyncStateError>()(
  "UpstreamSyncStateError",
  {
    rule: Schema.String,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Upstream sync refused to continue (${this.rule}): ${this.detail}`;
  }
}

export const UpstreamSyncGitFailure = Schema.Union([UpstreamSyncGitError, UpstreamSyncStateError]);
export type UpstreamSyncGitFailure = typeof UpstreamSyncGitFailure.Type;

/** Arguments that must never appear in a command this tool builds. */
const FORBIDDEN_ARGUMENTS = [
  "--force",
  "-f",
  "--force-with-lease",
  "--hard",
  "reset",
  "stash",
  "--ours",
  "--theirs",
  "--global",
  "--allow-unrelated-histories",
];

export function assertNoForbiddenArguments(args: ReadonlyArray<string>): void {
  // `git worktree remove --force` targets only the temporary directory this run created, so it is
  // checked by the caller rather than blanket-banned here.
  for (const argument of args) {
    if (FORBIDDEN_ARGUMENTS.includes(argument)) {
      throw new Error(`Refusing to run git with the forbidden argument "${argument}".`);
    }
  }
}

const collectStreamAsString = <E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (accumulator, chunk) => accumulator + chunk,
    ),
  );

interface GitResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface GitOptions {
  readonly operation: string;
  readonly cwd?: string | undefined;
  /** Exit codes that are a normal outcome rather than a failure (e.g. merge-tree conflicts). */
  readonly allowExitCodes?: ReadonlyArray<number> | undefined;
  readonly remote?: string | undefined;
}

const runGit = Effect.fn("runGit")(function* (args: ReadonlyArray<string>, options: GitOptions) {
  assertNoForbiddenArguments(args);
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const context = {
    operation: options.operation,
    argumentCount: args.length,
    ...(options.remote === undefined ? {} : { remote: redactRemoteUrl(options.remote) }),
  } as const;

  const child = yield* spawner
    .spawn(
      ChildProcess.make("git", [...args], options.cwd === undefined ? {} : { cwd: options.cwd }),
    )
    .pipe(
      Effect.mapError((cause) => new UpstreamSyncGitError({ ...context, phase: "spawn", cause })),
    );

  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      collectStreamAsString(child.stdout),
      collectStreamAsString(child.stderr),
      child.exitCode.pipe(Effect.map(Number)),
    ],
    { concurrency: "unbounded" },
  ).pipe(
    Effect.mapError(
      (cause) => new UpstreamSyncGitError({ ...context, phase: "communicate", cause }),
    ),
  );

  if (exitCode !== 0 && !(options.allowExitCodes ?? []).includes(exitCode)) {
    return yield* new UpstreamSyncGitError({
      ...context,
      phase: "exit",
      exitCode,
      stdoutLength: stdout.length,
      stderrLength: stderr.length,
      stderrSummary: summarizeStderr(stderr),
    });
  }

  return { stdout, stderr, exitCode };
});

/** Keeps the first line of stderr for operator context; credentials are redacted upstream. */
function summarizeStderr(stderr: string): string | undefined {
  const line = stderr.split("\n").find((candidate) => candidate.trim().length > 0);
  return line === undefined ? undefined : redactRemoteUrl(line.trim()).slice(0, 200);
}

const git = (args: ReadonlyArray<string>, options: GitOptions) =>
  runGit(args, options).pipe(Effect.scoped);

const gitText = Effect.fn("gitText")(function* (args: ReadonlyArray<string>, options: GitOptions) {
  const result = yield* git(args, options);
  return result.stdout.trim();
});

export interface UpstreamSyncOptions {
  readonly rootDir: string;
}

export interface UpstreamSyncStatusReport {
  readonly localHead: string;
  readonly targetSha: string;
  readonly sourceSha: string;
  readonly mergeBase: string | null;
  readonly upstreamHasNewCommits: boolean;
  readonly worktreeClean: boolean;
  readonly remotesMatchManifest: boolean;
  readonly integrationNeeded: boolean;
  readonly manifest: UpstreamSyncManifest;
}

const lsRemoteSha = Effect.fn("lsRemoteSha")(function* (url: string, branch: string) {
  const output = yield* gitText(["ls-remote", url, `refs/heads/${branch}`], {
    operation: `ls-remote ${branch}`,
    remote: url,
  });
  const sha = output.split("\n")[0]?.split("\t")[0]?.trim();
  if (!sha) {
    return yield* new UpstreamSyncStateError({
      rule: "remote-branch-missing",
      detail: `${redactRemoteUrl(url)} has no branch "${branch}".`,
    });
  }
  return sha;
});

/** Reads a configured remote URL, tolerating a remote that is simply not configured. */
const configuredRemoteUrl = Effect.fn("configuredRemoteUrl")(function* (
  rootDir: string,
  remote: string,
) {
  const result = yield* git(["remote", "get-url", remote], {
    operation: "remote get-url",
    cwd: rootDir,
    allowExitCodes: [2, 128],
  });
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
});

export const upstreamSyncStatus = Effect.fn("upstreamSyncStatus")(function* (
  options: UpstreamSyncOptions,
) {
  const manifest = yield* loadUpstreamSyncConfig(options.rootDir);

  yield* git(["rev-parse", "--show-toplevel"], {
    operation: "rev-parse --show-toplevel",
    cwd: options.rootDir,
  });

  const [sourceRemoteUrl, targetRemoteUrl] = yield* Effect.all([
    configuredRemoteUrl(options.rootDir, manifest.source.remote),
    configuredRemoteUrl(options.rootDir, manifest.target.remote),
  ]);

  for (const [label, configured, expected] of [
    ["source", sourceRemoteUrl, manifest.source.url],
    ["target", targetRemoteUrl, manifest.target.url],
  ] as const) {
    if (configured !== undefined && configured !== expected) {
      return yield* new UpstreamSyncStateError({
        rule: "remote-url-mismatch",
        detail: `${label} remote points at ${redactRemoteUrl(configured)} but the manifest declares ${redactRemoteUrl(expected)}.`,
      });
    }
  }

  const [localHead, targetSha, sourceSha, porcelain] = yield* Effect.all([
    gitText(["rev-parse", "HEAD"], { operation: "rev-parse HEAD", cwd: options.rootDir }),
    lsRemoteSha(manifest.target.url, manifest.target.branch),
    lsRemoteSha(manifest.source.url, manifest.source.branch),
    gitText(["status", "--porcelain"], { operation: "status --porcelain", cwd: options.rootDir }),
  ]);

  const mergeBase = yield* localMergeBase(options.rootDir, targetSha, sourceSha);

  return {
    localHead,
    targetSha,
    sourceSha,
    mergeBase,
    upstreamHasNewCommits: sourceSha !== targetSha && sourceSha !== mergeBase,
    worktreeClean: porcelain.length === 0,
    remotesMatchManifest: true,
    integrationNeeded: sourceSha !== targetSha && sourceSha !== mergeBase,
    manifest,
  } satisfies UpstreamSyncStatusReport;
});

/** Merge base computed only from objects already present locally; never fetches. */
const localMergeBase = Effect.fn("localMergeBase")(function* (
  rootDir: string,
  target: string,
  source: string,
) {
  for (const sha of [target, source]) {
    const present = yield* git(["cat-file", "-e", `${sha}^{commit}`], {
      operation: "cat-file -e",
      cwd: rootDir,
      allowExitCodes: [1, 128],
    });
    if (present.exitCode !== 0) return null;
  }
  const result = yield* git(["merge-base", target, source], {
    operation: "merge-base",
    cwd: rootDir,
    allowExitCodes: [1],
  });
  const base = result.stdout.trim();
  return base.length > 0 ? base : null;
});

function parseCommits(raw: string): UpstreamSyncPlanReport["upstreamCommits"] {
  return raw
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [sha = "", title = "", author = "", authoredAt = ""] = record.split(FIELD_SEPARATOR);
      return { sha, title, author, authoredAt };
    });
}

/**
 * `git merge-tree --write-tree --name-only` prints the merged tree oid on line 1, then conflicted
 * paths until a blank line, then human-readable messages. Verified against git 2.50.
 */
function parseMergeTree(stdout: string): { tree: string; conflicts: ReadonlyArray<string> } {
  const lines = stdout.split("\n");
  const tree = lines[0]?.trim() ?? "";
  const conflicts: Array<string> = [];
  for (const line of lines.slice(1)) {
    if (line.trim().length === 0) break;
    conflicts.push(line);
  }
  return { tree, conflicts };
}

export interface UpstreamSyncPlan {
  readonly report: UpstreamSyncPlanReport;
  /** Tree the clean merge probe produced; used to verify the real merge before pushing. */
  readonly probedTree: string | null;
  readonly manifest: UpstreamSyncManifest;
}

/**
 * Read-only. Everything happens inside a scoped temporary repository, so the caller's HEAD, index,
 * worktree, refs, and object store are never touched.
 *
 * ponytail: a full fetch of both sides each run is fine for a daily cron; if it ever gets slow,
 * borrow the caller's objects with `--reference-if-able` instead of adding a cache.
 */
export const planUpstreamSync = Effect.fn("planUpstreamSync")(function* (
  options: UpstreamSyncOptions,
) {
  const manifest = yield* loadUpstreamSyncConfig(options.rootDir);
  const fs = yield* FileSystem.FileSystem;
  const workDir = yield* fs.makeTempDirectoryScoped({ prefix: "upstream-sync-plan-" });

  yield* git(["init", "--quiet"], { operation: "init", cwd: workDir });
  yield* git(["config", "user.name", BOT_NAME], { operation: "config user.name", cwd: workDir });
  yield* git(["config", "user.email", BOT_EMAIL], { operation: "config user.email", cwd: workDir });

  const fetchInto = Effect.fn("fetchInto")(function* (url: string, branch: string, ref: string) {
    yield* git(["fetch", "--no-tags", "--quiet", url, `refs/heads/${branch}:${ref}`], {
      operation: `fetch ${branch}`,
      cwd: workDir,
      remote: url,
    });
    return yield* gitText(["rev-parse", ref], { operation: "rev-parse", cwd: workDir });
  });

  const targetSha = yield* fetchInto(
    manifest.target.url,
    manifest.target.branch,
    "refs/upstream-sync/target",
  );
  const sourceSha = yield* fetchInto(
    manifest.source.url,
    manifest.source.branch,
    "refs/upstream-sync/source",
  );

  const base = {
    generatedAt: new Date().toISOString(),
    source: {
      url: redactRemoteUrl(manifest.source.url),
      branch: manifest.source.branch,
      sha: sourceSha,
    },
    target: {
      url: redactRemoteUrl(manifest.target.url),
      branch: manifest.target.branch,
      sha: targetSha,
    },
  } as const;

  const emptyReport = (
    status: UpstreamSyncPlanStatus,
    mergeBase: string | null,
  ): UpstreamSyncPlanReport => ({
    ...base,
    status,
    mergeBase,
    upstreamCommits: [],
    changedPaths: [],
    hotspotMatches: [],
    conflicts: [],
    coupledChangeFindings: evaluateCoupledChanges(manifest, []),
  });

  const mergeBaseResult = yield* git(["merge-base", targetSha, sourceSha], {
    operation: "merge-base",
    cwd: workDir,
    allowExitCodes: [1],
  });
  const mergeBase = mergeBaseResult.stdout.trim();
  if (mergeBaseResult.exitCode !== 0 || mergeBase.length === 0) {
    return {
      report: emptyReport("unrelated-history", null),
      probedTree: null,
      manifest,
    };
  }

  const ancestor = yield* git(["merge-base", "--is-ancestor", sourceSha, targetSha], {
    operation: "merge-base --is-ancestor",
    cwd: workDir,
    allowExitCodes: [1],
  });
  if (ancestor.exitCode === 0) {
    return { report: emptyReport("up-to-date", mergeBase), probedTree: null, manifest };
  }

  const commitsRaw = yield* gitText(
    [
      "log",
      `--format=%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${RECORD_SEPARATOR}`,
      `${targetSha}..${sourceSha}`,
    ],
    { operation: "log", cwd: workDir },
  );
  const changedRaw = yield* gitText(
    ["-c", "core.quotePath=false", "diff", "--name-only", mergeBase, sourceSha],
    { operation: "diff --name-only", cwd: workDir },
  );
  const changedPaths = changedRaw.split("\n").filter((path) => path.length > 0);

  const probe = yield* git(["merge-tree", "--write-tree", "--name-only", targetSha, sourceSha], {
    operation: "merge-tree",
    cwd: workDir,
    allowExitCodes: [1],
  });
  const { tree, conflicts } = parseMergeTree(probe.stdout);
  const conflicted = probe.exitCode === 1;

  return {
    report: {
      ...base,
      status: conflicted ? "conflicted" : "clean-merge",
      mergeBase,
      upstreamCommits: parseCommits(commitsRaw),
      changedPaths,
      hotspotMatches: matchHotspots(manifest, changedPaths),
      conflicts: conflicts.map((path) => ({ path, stages: [] })),
      coupledChangeFindings: evaluateCoupledChanges(manifest, changedPaths),
    },
    probedTree: conflicted ? null : tree,
    manifest,
  };
});

export interface UpstreamSyncIntegrateOptions extends UpstreamSyncOptions {
  readonly push?: boolean | undefined;
  readonly targetSha?: string | undefined;
  readonly worktree?: string | undefined;
}

export const integrateUpstreamSync = Effect.fn("integrateUpstreamSync")(function* (
  options: UpstreamSyncIntegrateOptions,
) {
  const manifest = yield* loadUpstreamSyncConfig(options.rootDir);
  const fs = yield* FileSystem.FileSystem;

  if (manifest.integration.requireCleanWorktree) {
    const porcelain = yield* gitText(["status", "--porcelain"], {
      operation: "status --porcelain",
      cwd: options.rootDir,
    });
    if (porcelain.length > 0) {
      return yield* new UpstreamSyncStateError({
        rule: "dirty-worktree",
        detail: `${porcelain.split("\n").length} uncommitted change(s) in ${options.rootDir}. Uncommitted work is outside git's merge graph — commit it before integrating.`,
      });
    }
  }

  const { report, probedTree } = yield* planUpstreamSync(options);

  if (report.status === "up-to-date") {
    return {
      status: "up-to-date",
      integrationBranch: null,
      mergeSha: null,
      pushed: false,
      plan: report,
    };
  }
  if (report.status !== "clean-merge" || probedTree === null) {
    return yield* new UpstreamSyncStateError({
      rule: report.status === "conflicted" ? "merge-conflict" : "no-common-ancestor",
      detail: `Upstream integration stopped before any mutation: ${report.status}. Resolve it by hand on a new integration branch.`,
    });
  }

  const localHead = yield* gitText(["rev-parse", "HEAD"], {
    operation: "rev-parse HEAD",
    cwd: options.rootDir,
  });
  const expectedBase = options.targetSha ?? report.target.sha;
  if (localHead !== expectedBase) {
    return yield* new UpstreamSyncStateError({
      rule: "target-base-advanced",
      detail: `HEAD is ${localHead} but the target base is ${expectedBase}. Update the checkout, or pass --target-sha to integrate from a base you chose deliberately.`,
    });
  }

  yield* git(
    ["fetch", "--no-tags", "--quiet", manifest.source.url, `refs/heads/${manifest.source.branch}`],
    {
      operation: "fetch source",
      cwd: options.rootDir,
      remote: manifest.source.url,
    },
  );

  const shortSha = shortenSha(report.source.sha);
  const branch = renderIntegrationBranch(manifest, shortSha);
  const mergeMessage = renderMergeMessage(manifest, shortSha);

  const existingBranch = yield* git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
    operation: "rev-parse --verify",
    cwd: options.rootDir,
    allowExitCodes: [1, 128],
  });
  if (existingBranch.exitCode === 0) {
    return yield* new UpstreamSyncStateError({
      rule: "unexpected-integration-branch",
      detail: `Branch ${branch} already exists locally at ${existingBranch.stdout.trim()}. Inspect it and remove it deliberately; this tool never overwrites a branch.`,
    });
  }

  // git worktree add requires a path that does not exist yet, and git worktree remove deletes it.
  // Scope a parent directory instead so the finalizer always has something to clean up.
  const path = yield* Path.Path;
  const worktreeBase = yield* fs.makeTempDirectoryScoped({ prefix: "upstream-sync-merge-" });
  const worktreeDir = options.worktree ?? path.join(worktreeBase, "merge");

  yield* git(["worktree", "add", "--quiet", "-b", branch, worktreeDir, report.target.sha], {
    operation: "worktree add",
    cwd: options.rootDir,
  });

  const mergeSha = yield* Effect.gen(function* () {
    yield* git(
      [
        "-c",
        `user.name=${BOT_NAME}`,
        "-c",
        `user.email=${BOT_EMAIL}`,
        "merge",
        "--no-ff",
        "-m",
        mergeMessage,
        report.source.sha,
      ],
      { operation: "merge --no-ff", cwd: worktreeDir },
    );
    return yield* gitText(["rev-parse", "HEAD"], { operation: "rev-parse HEAD", cwd: worktreeDir });
  }).pipe(
    Effect.ensuring(
      // Removes only the directory this run created; the branch is kept for review.
      options.worktree === undefined
        ? git(["worktree", "remove", worktreeDir], {
            operation: "worktree remove",
            cwd: options.rootDir,
          }).pipe(Effect.ignore)
        : Effect.void,
    ),
  );

  yield* verifyMerge({
    rootDir: options.rootDir,
    mergeSha,
    targetSha: report.target.sha,
    sourceSha: report.source.sha,
    probedTree,
    mergeMessage,
  });

  let pushed = false;
  if (options.push ?? false) {
    const remoteState = yield* gitText(["ls-remote", manifest.target.url, `refs/heads/${branch}`], {
      operation: "ls-remote integration branch",
      remote: manifest.target.url,
    });
    const remoteSha = remoteState.split("\t")[0]?.trim();

    if (remoteSha && remoteSha !== mergeSha) {
      return yield* new UpstreamSyncStateError({
        rule: "remote-branch-collision",
        detail: `${branch} already exists on the target remote at ${remoteSha}, not ${mergeSha}. Stopping instead of overwriting it.`,
      });
    }

    if (!remoteSha) {
      yield* git(["push", manifest.target.url, `refs/heads/${branch}:refs/heads/${branch}`], {
        operation: "push integration branch",
        cwd: options.rootDir,
        remote: manifest.target.url,
      });
    }
    pushed = true;
  }

  return { status: "integrated", integrationBranch: branch, mergeSha, pushed, plan: report };
});

const verifyMerge = Effect.fn("verifyMerge")(function* (input: {
  readonly rootDir: string;
  readonly mergeSha: string;
  readonly targetSha: string;
  readonly sourceSha: string;
  readonly probedTree: string;
  readonly mergeMessage: string;
}) {
  const parents = (yield* gitText(["rev-list", "--parents", "-n", "1", input.mergeSha], {
    operation: "rev-list --parents",
    cwd: input.rootDir,
  })).split(" ");

  const failures: Array<string> = [];
  if (parents.length !== 3)
    failures.push(`expected exactly two parents, got ${parents.length - 1}`);
  if (parents[1] !== input.targetSha)
    failures.push(`first parent ${parents[1]} != target ${input.targetSha}`);
  if (parents[2] !== input.sourceSha)
    failures.push(`second parent ${parents[2]} != source ${input.sourceSha}`);

  const tree = yield* gitText(["rev-parse", `${input.mergeSha}^{tree}`], {
    operation: "rev-parse tree",
    cwd: input.rootDir,
  });
  if (tree !== input.probedTree)
    failures.push(`merge tree ${tree} != probed tree ${input.probedTree}`);

  const subject = yield* gitText(["log", "-1", "--format=%s", input.mergeSha], {
    operation: "log subject",
    cwd: input.rootDir,
  });
  if (subject !== input.mergeMessage)
    failures.push(`commit subject "${subject}" != "${input.mergeMessage}"`);

  if (failures.length > 0) {
    return yield* new UpstreamSyncStateError({
      rule: "merge-verification-failed",
      detail: failures.join("; "),
    });
  }
});

export const printPlanSummary = Effect.fn("printPlanSummary")(function* (
  report: UpstreamSyncPlanReport,
) {
  yield* Console.log(`status: ${report.status}`);
  yield* Console.log(`source: ${report.source.url}#${report.source.branch} @ ${report.source.sha}`);
  yield* Console.log(`target: ${report.target.url}#${report.target.branch} @ ${report.target.sha}`);
  yield* Console.log(`merge base: ${report.mergeBase ?? "none"}`);
  yield* Console.log(`upstream commits: ${report.upstreamCommits.length}`);
  yield* Console.log(`changed paths: ${report.changedPaths.length}`);
  yield* Console.log(`hotspot matches: ${report.hotspotMatches.length}`);
  const blocking = report.coupledChangeFindings.filter((finding) => !finding.ok);
  yield* Console.log(
    `coupled-change findings: ${blocking.length > 0 ? `${blocking.length} blocking` : "none blocking"}`,
  );
  if (report.conflicts.length > 0) {
    yield* Console.log(`conflicts (${report.conflicts.length}):`);
    for (const conflict of report.conflicts) {
      yield* Console.log(`  ${conflict.path}`);
    }
  }
});
