import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { resolveLayoutCommandResult, resolveUnifiedWorkspaceCapabilities } from "./mutationResults";

describe("resolveLayoutCommandResult", () => {
  it("keeps interruption and unavailable failures offline", () => {
    const interrupted = resolveLayoutCommandResult(AsyncResult.failure(Cause.interrupt(1)));
    expect(interrupted).toEqual({
      ok: false,
      tag: "offline",
      message: "The request was interrupted.",
    });

    const unavailable = resolveLayoutCommandResult(
      AsyncResult.failure(
        Cause.fail({
          _tag: "EnvironmentRpcUnavailableError",
          message: "Local server is not connected.",
        }),
      ),
    );
    expect(unavailable).toEqual({
      ok: false,
      tag: "offline",
      message: "Local server is not connected.",
    });
  });

  it("does not label authorization and generic RPC failures offline", () => {
    const authorization = resolveLayoutCommandResult(
      AsyncResult.failure(
        Cause.fail({
          _tag: "EnvironmentAuthorizationError",
          message: "Layout write scope is required.",
        }),
      ),
    );
    expect(authorization).toEqual({
      ok: false,
      tag: "authorization",
      message: "Layout write scope is required.",
    });

    const rpcFailure = resolveLayoutCommandResult(
      AsyncResult.failure(
        Cause.fail({
          _tag: "RpcClientError",
          message: "Server rejected the request.",
        }),
      ),
    );
    expect(rpcFailure).toEqual({
      ok: false,
      tag: "error",
      message: "Server rejected the request.",
    });
  });
});

describe("resolveUnifiedWorkspaceCapabilities", () => {
  it("enables mutation only when the server advertises it", () => {
    expect(
      resolveUnifiedWorkspaceCapabilities({
        serverConfigLoaded: true,
        supportsLayoutMutations: true,
      }),
    ).toEqual({ canMutate: true, reason: null });
  });

  it("degrades safely while loading and under version skew", () => {
    expect(
      resolveUnifiedWorkspaceCapabilities({
        serverConfigLoaded: false,
        supportsLayoutMutations: false,
      }),
    ).toEqual({
      canMutate: false,
      reason: "Waiting for the server to report workspace layout editing support.",
    });
    expect(
      resolveUnifiedWorkspaceCapabilities({
        serverConfigLoaded: true,
        supportsLayoutMutations: false,
      }),
    ).toEqual({
      canMutate: false,
      reason: "This server does not support workspace layout editing.",
    });
  });
});
