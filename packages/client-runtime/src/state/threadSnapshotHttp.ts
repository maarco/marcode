import type { OrchestrationV2ThreadDetailSnapshot, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as RemoteEnvironmentAuthorization from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import * as ManagedRelay from "../relay/managedRelay.ts";
import type { RemoteEnvironmentRequestError } from "../rpc/http.ts";
import {
  executeAuthenticatedEnvironmentHttpRequest,
  withOrchestrationProtocolHeader,
} from "./environmentHttpAuth.ts";

// Long enough for a slow but alive server to finish. On a cold open a timeout makes the socket
// ask the same server for the same snapshot again, and older turn pages have no fallback, so a
// short deadline only drops work. The socket fallback is for setups where /api fails but /ws
// works, such as a proxy that blocks /api.
const DEFAULT_THREAD_SNAPSHOT_TIMEOUT_MS = 20_000;

export type ThreadSnapshotHistoryMeta = {
  readonly historyCursor: string | null;
  readonly hasMoreHistory: boolean;
  readonly latestLocalTurnOrdinal?: number | null;
};

export type ThreadSnapshotLoadResult =
  | {
      readonly _tag: "present";
      readonly snapshot: OrchestrationV2ThreadDetailSnapshot;
      readonly history?: ThreadSnapshotHistoryMeta;
    }
  | { readonly _tag: "missing" }
  | { readonly _tag: "unavailable" };

export const fetchEnvironmentThreadSnapshot = Effect.fn(
  "clientRuntime.state.fetchEnvironmentThreadSnapshot",
)(function* (input: {
  readonly prepared: PreparedConnection;
  readonly threadId: ThreadId;
  readonly signer: Option.Option<ManagedRelay.ManagedRelayDpopSigner["Service"]>;
  readonly remoteAuthorization?: Option.Option<
    RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization["Service"]
  >;
  readonly timeoutMs?: number;
}) {
  return yield* executeAuthenticatedEnvironmentHttpRequest({
    ...input,
    group: "orchestration",
    method: "GET",
    url: (urls) => urls.threadSnapshot({ params: { threadId: input.threadId } }),
    timeoutMs: input.timeoutMs ?? DEFAULT_THREAD_SNAPSHOT_TIMEOUT_MS,
    request: ({ client, headers }) =>
      client.threadSnapshot({
        params: { threadId: input.threadId },
        headers: withOrchestrationProtocolHeader(headers),
      }),
  });
});

export type FetchEnvironmentThreadSnapshotError = RemoteEnvironmentRequestError;

<<<<<<< HEAD
/**
 * Outcome of an HTTP snapshot load.
 *
 * `missing` (the server answered 404) and `unavailable` (the request itself
 * failed) are deliberately distinct: both fall back to the socket snapshot, but
 * only `missing` is a permanent answer, so only `missing` lets the caller stop
 * asking. Collapsing them into one "no snapshot" value is what made a deleted
 * thread re-fetch its 404 on every resubscribe, forever.
 */
export type ThreadSnapshotLoadResult =
  | { readonly _tag: "found"; readonly snapshot: OrchestrationThreadDetailSnapshot }
  | { readonly _tag: "missing" }
  | { readonly _tag: "unavailable" };

/**
 * Loads a thread's detail snapshot over HTTP. Decouples the thread state machine
 * from the underlying HTTP + DPoP details and keeps them out of test contexts.
 */
=======
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
export class ThreadSnapshotLoader extends Context.Service<
  ThreadSnapshotLoader,
  {
    readonly load: (
      prepared: PreparedConnection,
      threadId: ThreadId,
<<<<<<< HEAD
      window?: ThreadSnapshotWindow,
      reasoningMessages?: boolean,
      // Marcode keeps the three-state load result (found/missing/unavailable) so a
      // deleted thread stops re-fetching its 404; upstream's reasoningMessages flag
      // rides on top of it.
    ) => Effect.Effect<ThreadSnapshotLoadResult>;
  }
>()("@t3tools/client-runtime/state/threadSnapshotHttp/ThreadSnapshotLoader") {}

export const threadSnapshotLoaderLayer: Layer.Layer<
  ThreadSnapshotLoader,
  never,
  HttpClient.HttpClient
> = Layer.effect(
  ThreadSnapshotLoader,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    // Resolve the DPoP signer optionally: it is only needed for relay/DPoP
    // connections, so the loader must not hard-require it (bearer/primary
    // connections work without one).
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    const remoteAuthorization = yield* Effect.serviceOption(RemoteEnvironmentAuthorization);
    return ThreadSnapshotLoader.of({
      load: (
        prepared: PreparedConnection,
        threadId: ThreadId,
        window?: ThreadSnapshotWindow,
        reasoningMessages?: boolean,
      ) =>
        fetchEnvironmentThreadSnapshot({
          prepared,
          threadId,
          signer,
          remoteAuthorization,
          ...(reasoningMessages === true ? { reasoningMessages: true } : {}),
          ...(window !== undefined ? { window } : {}),
        }).pipe(
          Effect.map(
            (snapshot): ThreadSnapshotLoadResult => ({ _tag: "found", snapshot }) as const,
          ),
          Effect.provideService(HttpClient.HttpClient, httpClient),
          // A genuinely missing thread (404) is expected — the socket
          // subscription is the source of truth for thread existence and will
          // surface the deletion — so don't treat it as an error worth warning
          // about; just defer to the socket path.
          Effect.catchTags({
            EnvironmentResourceNotFoundError: () =>
              Effect.logDebug(
                "Thread snapshot not found over HTTP; deferring to the socket subscription.",
              ).pipe(
                Effect.annotateLogs({ threadId }),
                Effect.as<ThreadSnapshotLoadResult>({ _tag: "missing" } as const),
              ),
          }),
          Effect.catchCause((cause) =>
            Effect.logWarning(
              "Could not load the thread snapshot over HTTP; using the socket snapshot instead.",
            ).pipe(
              Effect.annotateLogs({ threadId, cause: Cause.pretty(cause) }),
              Effect.as<ThreadSnapshotLoadResult>({ _tag: "unavailable" } as const),
            ),
          ),
        ),
    });
  }),
);
=======
    ) => Effect.Effect<ThreadSnapshotLoadResult>;
  }
>()("@t3tools/client-runtime/state/threadSnapshotHttp/ThreadSnapshotLoader") {}
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
