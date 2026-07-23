#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { redactRemoteUrl } from "./lib/upstream-sync-config.ts";
import {
  integrateUpstreamSync,
  planUpstreamSync,
  printPlanSummary,
  upstreamSyncStatus,
} from "./lib/upstream-sync-git.ts";

export class UpstreamSyncReportWriteError extends Schema.TaggedErrorClass<UpstreamSyncReportWriteError>()(
  "UpstreamSyncReportWriteError",
  {
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to write the upstream sync report to ${this.path}.`;
  }
}

const writeReport = Effect.fn("writeReport")(function* (
  jsonOutput: string | undefined,
  report: unknown,
) {
  if (jsonOutput === undefined) return;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolute = path.resolve(jsonOutput);
  yield* fs
    .makeDirectory(path.dirname(absolute), { recursive: true })
    .pipe(Effect.mapError((cause) => new UpstreamSyncReportWriteError({ path: absolute, cause })));
  yield* fs
    // @effect-diagnostics-next-line preferSchemaOverJson:off
    .writeFileString(absolute, `${JSON.stringify(report, null, 2)}\n`)
    .pipe(Effect.mapError((cause) => new UpstreamSyncReportWriteError({ path: absolute, cause })));
  yield* Console.log(`report: ${absolute}`);
});

const resolveRoot = Effect.fn("resolveRoot")(function* (root: Option.Option<string>) {
  const path = yield* Path.Path;
  return path.resolve(Option.getOrUndefined(root) ?? process.cwd());
});

export const runStatus = Effect.fn("runStatus")(function* (rootDir: string) {
  const report = yield* upstreamSyncStatus({ rootDir });

  yield* Console.log(`local HEAD:      ${report.localHead}`);
  yield* Console.log(
    `target:          ${redactRemoteUrl(report.manifest.target.url)}#${report.manifest.target.branch} @ ${report.targetSha}`,
  );
  yield* Console.log(
    `source:          ${redactRemoteUrl(report.manifest.source.url)}#${report.manifest.source.branch} @ ${report.sourceSha}`,
  );
  yield* Console.log(`merge base:      ${report.mergeBase ?? "unknown (objects not local)"}`);
  yield* Console.log(`upstream ahead:  ${report.upstreamHasNewCommits ? "yes" : "no"}`);
  yield* Console.log(`worktree clean:  ${report.worktreeClean ? "yes" : "no"}`);
  yield* Console.log(`remotes match:   ${report.remotesMatchManifest ? "yes" : "no"}`);
  yield* Console.log(
    `integration:     ${report.integrationNeeded ? "needed — run upstream:plan" : "not needed"}`,
  );
  if (!report.worktreeClean) {
    yield* Console.log(
      "note:            uncommitted changes are invisible to merge history; integrate refuses a dirty checkout.",
    );
  }
  return report;
});

export const runPlan = Effect.fn("runPlan")(function* (
  rootDir: string,
  jsonOutput: string | undefined,
) {
  const { report } = yield* planUpstreamSync({ rootDir });
  yield* printPlanSummary(report);
  yield* writeReport(jsonOutput, report);
  return report;
});

export const runIntegrate = Effect.fn("runIntegrate")(function* (options: {
  readonly rootDir: string;
  readonly jsonOutput: string | undefined;
  readonly push: boolean;
  readonly targetSha: string | undefined;
  readonly worktree: string | undefined;
}) {
  const result = yield* integrateUpstreamSync(options);
  yield* printPlanSummary(result.plan);

  if (result.status === "up-to-date") {
    yield* Console.log("nothing to integrate: no branch, no commit, no pull request.");
  } else {
    yield* Console.log(`integration branch: ${result.integrationBranch}`);
    yield* Console.log(`merge commit:       ${result.mergeSha}`);
    yield* Console.log(`pushed:             ${result.pushed ? "yes" : "no (pass --push)"}`);
  }

  yield* writeReport(options.jsonOutput, result);
  return result;
});

const rootFlag = Flag.string("root").pipe(
  Flag.withDescription("Repository root. Defaults to the current working directory."),
  Flag.optional,
);
const jsonOutputFlag = Flag.string("json-output").pipe(
  Flag.withDescription("Write the machine-readable report to this path."),
  Flag.optional,
);

const statusCommand = Command.make("status", { root: rootFlag }, ({ root }) =>
  Effect.gen(function* () {
    yield* runStatus(yield* resolveRoot(root));
  }),
).pipe(
  Command.withDescription(
    "Read-only. Report local, target, and upstream heads without touching the checkout.",
  ),
);

const planCommand = Command.make(
  "plan",
  { root: rootFlag, jsonOutput: jsonOutputFlag },
  ({ root, jsonOutput }) =>
    Effect.gen(function* () {
      yield* runPlan(yield* resolveRoot(root), Option.getOrUndefined(jsonOutput));
    }).pipe(Effect.scoped),
).pipe(
  Command.withDescription(
    "Read-only. Plan the upstream merge in a disposable temporary repository.",
  ),
);

const integrateCommand = Command.make(
  "integrate",
  {
    root: rootFlag,
    jsonOutput: jsonOutputFlag,
    push: Flag.boolean("push").pipe(
      Flag.withDescription("Push the integration branch to the configured target remote."),
      Flag.withDefault(false),
    ),
    targetSha: Flag.string("target-sha").pipe(
      Flag.withDescription("Integrate from this target base instead of the current branch head."),
      Flag.optional,
    ),
    worktree: Flag.string("worktree").pipe(
      Flag.withDescription("Use this existing disposable worktree instead of a temporary one."),
      Flag.optional,
    ),
  },
  ({ root, jsonOutput, push, targetSha, worktree }) =>
    Effect.gen(function* () {
      yield* runIntegrate({
        rootDir: yield* resolveRoot(root),
        jsonOutput: Option.getOrUndefined(jsonOutput),
        push,
        targetSha: Option.getOrUndefined(targetSha),
        worktree: Option.getOrUndefined(worktree),
      });
    }).pipe(Effect.scoped),
).pipe(
  Command.withDescription(
    "Create the integration branch and merge commit. Refuses a dirty checkout; never force pushes.",
  ),
);

export const upstreamSyncCommand = Command.make("upstream-sync").pipe(
  Command.withDescription(
    "Detect and prepare merges from the official upstream repository declared in .github/upstream-sync.yml.",
  ),
  Command.withSubcommands([statusCommand, planCommand, integrateCommand]),
);

if (import.meta.main) {
  Command.run(upstreamSyncCommand, { version: "1.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
