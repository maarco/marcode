import type { ApplyProjectWorkspaceLayoutResult } from "@t3tools/client-runtime/operations/project-workspace";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";

import type { UnifiedWorkspaceCapabilities, UnifiedWorkspaceMutationResult } from "./types";

function hasTag(
  value: unknown,
  tag: string,
): value is { readonly _tag: string; readonly message?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "_tag" in value &&
    (value as { readonly _tag?: unknown })._tag === tag
  );
}

function failureMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { readonly message?: unknown }).message === "string"
  ) {
    return (value as { readonly message: string }).message;
  }
  return "Request failed.";
}

export function resolveLayoutCommandResult(
  result: AtomCommandResult<ApplyProjectWorkspaceLayoutResult, unknown>,
): UnifiedWorkspaceMutationResult {
  if (result._tag === "Success") {
    if (result.value.ok) return { ok: true };
    return { ok: false, tag: result.value.rejection.tag, message: result.value.rejection.message };
  }
  if (isAtomCommandInterrupted(result)) {
    return { ok: false, tag: "offline", message: "The request was interrupted." };
  }

  const error = squashAtomCommandFailure(result);
  if (hasTag(error, "EnvironmentRpcUnavailableError")) {
    return { ok: false, tag: "offline", message: failureMessage(error) };
  }
  if (hasTag(error, "EnvironmentAuthorizationError")) {
    return { ok: false, tag: "authorization", message: failureMessage(error) };
  }
  return { ok: false, tag: "error", message: failureMessage(error) };
}

export function resolveUnifiedWorkspaceCapabilities(input: {
  readonly serverConfigLoaded: boolean;
  readonly supportsLayoutMutations: boolean;
}): UnifiedWorkspaceCapabilities {
  if (input.supportsLayoutMutations) {
    return { canMutate: true, reason: null };
  }
  return {
    canMutate: false,
    reason: input.serverConfigLoaded
      ? "This server does not support workspace layout editing."
      : "Waiting for the server to report workspace layout editing support.",
  };
}
