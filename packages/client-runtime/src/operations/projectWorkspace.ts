import {
  CommandId,
  makeCommandWorkspaceItemId,
  makeThreadWorkspaceItemId,
  ORCHESTRATION_WS_METHODS,
  ProjectWorkspaceItemId,
  ThreadId,
  type EnvironmentAuthorizationError,
  type EnvironmentId,
  type ProjectId,
  type ProjectWorkspaceEntry,
  type ProjectWorkspaceLayoutErrorTag,
  type ProjectWorkspaceLayoutOperation,
  type ProjectWorkspaceLayoutRejection,
  type ProjectWorkspaceLayoutVersion,
} from "@t3tools/contracts";
import { rankSequence } from "@t3tools/shared/fractional-rank";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import { RpcClientError } from "effect/unstable/rpc";

import type { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { type EnvironmentRpcUnavailableError, request } from "../rpc/client.ts";

export interface ApplyProjectWorkspaceLayoutInput {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly expectedVersion: ProjectWorkspaceLayoutVersion;
  readonly operation: ProjectWorkspaceLayoutOperation;
  readonly commandId?: CommandId;
}

export type ApplyProjectWorkspaceLayoutResult =
  | { readonly ok: true; readonly layoutVersion: ProjectWorkspaceLayoutVersion }
  | { readonly ok: false; readonly rejection: ProjectWorkspaceLayoutRejection };

const WORKSPACE_LAYOUT_ERROR_TAGS: ReadonlySet<ProjectWorkspaceLayoutErrorTag> = new Set([
  "version-conflict",
  "cycle",
  "missing-target",
  "duplicate-path",
  "cross-project",
  "invalid-parent",
  "invalid-path",
  "not-persistent",
]);

function isProjectWorkspaceLayoutErrorTag(value: unknown): value is ProjectWorkspaceLayoutErrorTag {
  return (
    typeof value === "string" &&
    WORKSPACE_LAYOUT_ERROR_TAGS.has(value as ProjectWorkspaceLayoutErrorTag)
  );
}

/**
 * Parses the structured `{tag, message, currentVersion?}` rejection the
 * server embeds (as JSON) inside `OrchestrationDispatchCommandError.message`
 * for `project.workspace-layout.apply` failures — the counterpart to
 * `workspaceLayoutRejectionDetail`/`workspaceLayoutInvariantError` in
 * `apps/server/src/orchestration/commandInvariants.ts`. There is no
 * dedicated typed error channel from the decider through to the WS client
 * (dispatchCommand's wire error is the single generic
 * `OrchestrationDispatchCommandError` with a flat `message` string), so this
 * wire convention is what carries the tag across. Exported so it can be
 * tested directly against the exact string shape the server produces.
 *
 * Falls back to a generic `"missing-target"`-tagged rejection carrying the
 * raw message when parsing fails for any reason (message shape from an
 * unrelated/older server, network-layer mangling, etc.) — this function
 * always returns a valid `ProjectWorkspaceLayoutRejection`, never throws.
 */
export function parseProjectWorkspaceLayoutRejection(
  message: string,
): ProjectWorkspaceLayoutRejection {
  const fallback: ProjectWorkspaceLayoutRejection = {
    tag: "missing-target",
    message: message.trim().length > 0 ? message : "The workspace layout change was rejected.",
  };

  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) {
    return fallback;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(message.slice(jsonStart));
  } catch {
    return fallback;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return fallback;
  }

  const candidate = parsed as Record<string, unknown>;
  if (!isProjectWorkspaceLayoutErrorTag(candidate.tag) || typeof candidate.message !== "string") {
    return fallback;
  }

  return {
    tag: candidate.tag,
    message: candidate.message,
    ...(typeof candidate.currentVersion === "number"
      ? { currentVersion: candidate.currentVersion }
      : {}),
  };
}

/**
 * Dispatches `project.workspace-layout.apply` and resolves to a typed
 * ok/rejection result rather than failing the Effect for expected rejections
 * (stale version, cycle, duplicate path, ...) — callers branch on `.ok`
 * instead of catching. Connection-level failures
 * (`EnvironmentRpcUnavailableError`, e.g. the environment is offline) still
 * fail the Effect, since that is a materially different situation from "the
 * server rejected this specific mutation" and callers should handle it
 * differently (e.g. an offline banner rather than a retry/refresh prompt).
 *
 * On success, `layoutVersion` is `expectedVersion + 1` — the decider only
 * ever accepts a command when `expectedVersion` matches the current version
 * exactly and always advances the version by exactly 1 on acceptance
 * (`apps/server/src/orchestration/decider.ts`), so the resulting version is
 * computable client-side without round-tripping it through the RPC success
 * payload (`DispatchResult` only carries an event sequence number).
 */
export const applyProjectWorkspaceLayout: (
  input: ApplyProjectWorkspaceLayoutInput,
) => Effect.Effect<
  ApplyProjectWorkspaceLayoutResult,
  EnvironmentAuthorizationError | EnvironmentRpcUnavailableError | RpcClientError.RpcClientError,
  Crypto.Crypto | EnvironmentSupervisor
> = Effect.fn("EnvironmentCommands.applyProjectWorkspaceLayout")(function* (input) {
  yield* Effect.annotateCurrentSpan({ "environment.id": input.environmentId });

  const commandId =
    input.commandId ??
    (yield* Crypto.Crypto.pipe(
      Effect.flatMap((crypto) => crypto.randomUUIDv4),
      Effect.orDie,
      Effect.map(CommandId.make),
    ));

  return yield* request(ORCHESTRATION_WS_METHODS.dispatchCommand, {
    type: "project.workspace-layout.apply",
    commandId,
    projectId: input.projectId,
    expectedVersion: input.expectedVersion,
    operation: input.operation,
  }).pipe(
    Effect.map(
      (): ApplyProjectWorkspaceLayoutResult => ({
        ok: true,
        layoutVersion: input.expectedVersion + 1,
      }),
    ),
    Effect.catchTag("OrchestrationDispatchCommandError", (error) =>
      Effect.succeed<ApplyProjectWorkspaceLayoutResult>({
        ok: false,
        rejection: parseProjectWorkspaceLayoutRejection(error.message),
      }),
    ),
  );
});

/**
 * One reusable fixture covering every persisted `ProjectWorkspaceEntry`
 * kind, nested the way the spec's example tree is nested (a folder
 * containing a file, containing a thread), plus a root-level command and URL
 * shortcut:
 *
 * ```text
 * src/                          folder   (fixture-folder-src)
 * └─ auth.ts                    file     (fixture-file-auth)
 *    └─ Fix token refresh       thread   (thread:fixture-thread-1)
 * Run web                       command  (command:fixture-script-1)
 * Local app                     url      (fixture-url-local)
 * ```
 *
 * Ranks are produced by the real `rankSequence` helper
 * (`@t3tools/shared/fractional-rank`) rather than hand-picked strings, so
 * consumers exercise real, valid, lexically-ordered ranks. Thread/command
 * ids use the real deterministic id convention
 * (`makeThreadWorkspaceItemId`/`makeCommandWorkspaceItemId`) so a fixture
 * consumer can cross-reference a live/synthetic node for the same
 * thread/script id.
 *
 * For the tree presentation (Agent 2) and view-model (Agent 3) lanes to
 * build their own richer fixtures (live terminal/browser nodes, synthetic
 * root entries, broken references) on top of — this fixture only covers the
 * *persisted* entry union, not the web-only synthetic/live node types.
 */
export const SAMPLE_PROJECT_WORKSPACE_THREAD_ID = "fixture-thread-1";
export const SAMPLE_PROJECT_WORKSPACE_SCRIPT_ID = "fixture-script-1";

// One rankSequence call per sibling group — every entry below the root
// shares a distinct single-child group (folder -> file -> thread), so each
// gets its own independent rankSequence(1); the three *root*-level entries
// (folder, command, url) share one group and must come from a single
// rankSequence(3) call so their ranks are guaranteed distinct and ordered.
const [folderRank, commandRank, urlRank] = rankSequence(3) as [string, string, string];

export const SAMPLE_PROJECT_WORKSPACE_LAYOUT: ReadonlyArray<ProjectWorkspaceEntry> = [
  {
    kind: "folder",
    id: ProjectWorkspaceItemId.make("fixture-folder-src"),
    parentId: null,
    rank: folderRank,
    relativePath: "src",
  },
  {
    kind: "file",
    id: ProjectWorkspaceItemId.make("fixture-file-auth"),
    parentId: ProjectWorkspaceItemId.make("fixture-folder-src"),
    rank: rankSequence(1)[0]!,
    relativePath: "src/auth.ts",
    label: "auth.ts",
  },
  {
    kind: "thread",
    id: makeThreadWorkspaceItemId(SAMPLE_PROJECT_WORKSPACE_THREAD_ID),
    parentId: ProjectWorkspaceItemId.make("fixture-file-auth"),
    rank: rankSequence(1)[0]!,
    threadId: ThreadId.make(SAMPLE_PROJECT_WORKSPACE_THREAD_ID),
  },
  {
    kind: "command",
    id: makeCommandWorkspaceItemId(SAMPLE_PROJECT_WORKSPACE_SCRIPT_ID),
    parentId: null,
    rank: commandRank,
    scriptId: SAMPLE_PROJECT_WORKSPACE_SCRIPT_ID,
  },
  {
    kind: "url",
    id: ProjectWorkspaceItemId.make("fixture-url-local"),
    parentId: null,
    rank: urlRank,
    label: "Local app",
    url: "http://localhost:5173",
  },
];
