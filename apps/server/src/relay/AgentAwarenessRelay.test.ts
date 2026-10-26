import { assert, describe, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import {
  EnvironmentId,
  EventId,
  MessageId,
  NodeId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ThreadShell,
  type OrchestrationV2TurnItem,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
<<<<<<< HEAD
import type {
  RelayAgentActivityPublishProofPayload,
  RelayAgentActivityState,
} from "@t3tools/contracts/relay";
import {
  CommandId,
  EMPTY_PROJECT_WORKSPACE_LAYOUT,
  INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { RelayClientTracer } from "@t3tools/shared/relayTracing";
import { RELAY_ACTIVITY_PUBLISH_TYP, verifyRelayJwt } from "@t3tools/shared/relayJwt";
import { describe, expect, it } from "@effect/vitest";
=======
import { RelayAgentActivityState } from "@t3tools/contracts/relay";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import {
  PUBLISH_AGENT_ACTIVITY_SECRET,
  RELAY_ENVIRONMENT_CREDENTIAL_SECRET,
  RELAY_ISSUER_SECRET,
  RELAY_URL_SECRET,
} from "../cloud/config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as AgentAwarenessRelay from "./AgentAwarenessRelay.ts";

<<<<<<< HEAD
const PROJECT_WORKSPACE_LAYOUT_DEFAULTS = {
  workspaceLayoutVersion: INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION,
  workspaceLayout: EMPTY_PROJECT_WORKSPACE_LAYOUT,
} as const;

const state: RelayAgentActivityState = {
  environmentId: "env" as RelayAgentActivityState["environmentId"],
  threadId: "thread" as RelayAgentActivityState["threadId"],
  projectTitle: "Project",
  threadTitle: "Thread",
  modelTitle: "gpt-5.4",
  phase: "running",
  headline: "Running",
  updatedAt: "2026-05-25T00:00:00.000Z",
  deepLink: "/threads/env/thread",
};
=======
const THREAD_ID = ThreadId.make("relay-thread");
const SECOND_THREAD_ID = ThreadId.make("relay-thread-2");
const PROJECT_ID = ProjectId.make("relay-project");
const NOW = "2026-09-04T12:00:00.000Z";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7

function shell(overrides: Partial<OrchestrationV2ThreadShell> = {}): OrchestrationV2ThreadShell {
  return {
    id: THREAD_ID,
    projectId: PROJECT_ID,
    title: "Thread",
    providerInstanceId: ProviderInstanceId.make("codex"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test-model" },
    runtimeMode: "full-access",
    interactionMode: "default",
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: THREAD_ID, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    activeRunId: null,
    latestVisibleMessage: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    lastVisitedAt: null,
    deletedAt: null,
    branch: null,
    linkedPullRequest: null,
    status: "running",
    activityRunStatus: null,
    pendingRuntimeRequest: null,
    pendingBackgroundTasks: [],
    latestRunId: null,
    latestRunRequestedAt: null,
    latestRunStartedAt: null,
    latestRunCompletedAt: null,
    latestUserMessageAt: null,
    createdAt: DateTime.makeUnsafe(NOW),
    updatedAt: DateTime.makeUnsafe(NOW),
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    ...overrides,
  };
}

const PublishPayload = Schema.Struct({ state: Schema.NullOr(RelayAgentActivityState) });
const decodePublishPayload = Schema.decodeUnknownSync(Schema.fromJsonString(PublishPayload));
const unused = () => Effect.die("Unexpected test dependency call");

describe("startup agent activity", () => {
  it("publishes active work and only terminal runs completed after startup", () => {
    const startedAt = DateTime.toEpochMillis(DateTime.makeUnsafe(NOW));
    const oldCompleted = ThreadId.make("old-completed");
    const newCompleted = ThreadId.make("new-completed");
    const oldFailed = ThreadId.make("old-failed");
    const newFailed = ThreadId.make("new-failed");
    const ids = AgentAwarenessRelay.resolveAgentAwarenessRelayActiveThreadIds({
      environmentId: EnvironmentId.make("relay-env"),
      startedAt,
      projects: [{ id: PROJECT_ID, title: "Project" }],
      threads: [
        shell(),
        shell({
          id: oldCompleted,
          status: "completed",
          latestRunCompletedAt: DateTime.makeUnsafe("2026-09-04T11:59:00.000Z"),
        }),
        shell({
          id: newCompleted,
          status: "completed",
          latestRunCompletedAt: DateTime.makeUnsafe("2026-09-04T12:00:01.000Z"),
        }),
        shell({
          id: oldFailed,
          status: "failed",
          latestRunCompletedAt: DateTime.makeUnsafe("2026-09-04T11:59:00.000Z"),
        }),
        shell({
          id: newFailed,
          status: "failed",
          latestRunCompletedAt: DateTime.makeUnsafe("2026-09-04T12:00:01.000Z"),
        }),
        shell({ id: ThreadId.make("idle"), status: "idle" }),
        shell({ id: ThreadId.make("missing-project"), projectId: ProjectId.make("missing") }),
      ],
    });
    assert.deepStrictEqual(ids, [THREAD_ID, newCompleted, newFailed]);
  });
});

<<<<<<< HEAD
  it("resolves a null publish state when a thread or project snapshot disappeared", () => {
    const environmentId = "env-1" as EnvironmentId;
    const threadId = "thread-1" as ThreadId;
    const thread = {
      id: threadId,
      projectId: "project-1" as ProjectId,
      title: "Deleted thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      session: null,
      latestTurn: null,
      updatedAt: "2026-05-25T00:00:00.000Z",
      hasPendingApprovals: false,
      hasPendingUserInput: false,
    } as OrchestrationThreadShell;

    expect(
      AgentAwarenessRelay.resolveAgentAwarenessRelayPublishSnapshot({
        environmentId,
        threadId,
        thread: Option.none(),
        project: Option.none(),
      }),
    ).toEqual({
      projectId: null,
      state: null,
      reason: "thread-not-found",
    });

    expect(
      AgentAwarenessRelay.resolveAgentAwarenessRelayPublishSnapshot({
        environmentId,
        threadId,
        thread: Option.some(thread),
        project: Option.none(),
      }),
    ).toEqual({
      projectId: "project-1",
      state: null,
      reason: "project-not-found",
    });
  });

  it("selects only active shell snapshot threads for startup catch-up", () => {
    const now = "2026-05-25T00:00:00.000Z";
    const environmentId = "env-1" as EnvironmentId;
    const projectId = "project-1" as ProjectId;
    const activeThreadId = "thread-active" as ThreadId;
    const idleThreadId = "thread-idle" as ThreadId;
    const oldCompletedId = "thread-old-completed" as ThreadId;
    const newCompletedId = "thread-new-completed" as ThreadId;
    const freshMessageId = "thread-fresh-message" as ThreadId;

    const baseThread = {
      projectId,
      title: "Run remote agent",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      pullRequests: [],
      latestTurn: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      session: null,
      latestUserMessageAt: null,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      hasActionableProposedPlan: false,
    } satisfies Omit<OrchestrationThreadShell, "id">;

    expect(
      AgentAwarenessRelay.resolveAgentAwarenessRelayActiveThreadIds({
        environmentId,
        startedAt: Date.parse(now),
        projects: [
          {
            id: projectId,
            title: "Marcode",
          },
        ],
        threads: [
          {
            ...baseThread,
            id: activeThreadId,
            latestTurn: {
              turnId: "turn-1" as TurnId,
              state: "running",
              requestedAt: now,
              startedAt: now,
              completedAt: null,
              assistantMessageId: null,
            },
          },
          {
            ...baseThread,
            id: idleThreadId,
          },
          {
            ...baseThread,
            id: oldCompletedId,
            latestTurn: {
              turnId: "turn-old" as TurnId,
              state: "completed",
              requestedAt: "2026-05-24T00:00:00.000Z",
              startedAt: "2026-05-24T00:00:00.000Z",
              completedAt: "2026-05-24T00:01:00.000Z",
              assistantMessageId: null,
            },
          },
          {
            ...baseThread,
            id: newCompletedId,
            latestTurn: {
              turnId: "turn-new" as TurnId,
              state: "completed",
              requestedAt: "2026-05-25T00:00:01.000Z",
              startedAt: "2026-05-25T00:00:01.000Z",
              completedAt: "2026-05-25T00:00:02.000Z",
              assistantMessageId: null,
            },
          },
          {
            ...baseThread,
            id: freshMessageId,
            latestUserMessageAt: "2026-05-25T00:00:01.000Z",
            session: {
              threadId: freshMessageId,
              status: "ready",
              providerName: "Codex",
              runtimeMode: "full-access",
              activeTurnId: null,
              lastError: null,
              updatedAt: "2026-05-25T00:00:02.000Z",
            },
          },
          {
            ...baseThread,
            id: "thread-missing-project" as ThreadId,
            projectId: "missing-project" as ProjectId,
            latestTurn: {
              turnId: "turn-2" as TurnId,
              state: "running",
              requestedAt: now,
              startedAt: now,
              completedAt: null,
              assistantMessageId: null,
            },
          },
=======
const makeTestRelay = Effect.fnUntraced(function* (
  options: {
    readonly respond?: (attempt: number) => Response;
    readonly failSecretRead?: (name: string) => boolean;
    readonly linked?: boolean;
    readonly readShell?: (threadId: ThreadId) => Effect.Effect<OrchestrationV2ThreadShell | null>;
    readonly domainEvents?: Stream.Stream<OrchestrationV2DomainEvent>;
  } = {},
) {
  const values = new Map<string, Uint8Array>(
    options.linked === false
      ? []
      : [
          [PUBLISH_AGENT_ACTIVITY_SECRET, new TextEncoder().encode("true")],
          [RELAY_URL_SECRET, new TextEncoder().encode("https://relay.example.test")],
          [RELAY_ISSUER_SECRET, new TextEncoder().encode("https://relay.example.test")],
          [RELAY_ENVIRONMENT_CREDENTIAL_SECRET, new TextEncoder().encode("credential-1")],
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
        ],
  );
  const secretReads: string[] = [];
  const secrets = ServerSecretStore.ServerSecretStore.of({
    get: (name) =>
      Effect.suspend(() => {
        secretReads.push(name);
        if (options.failSecretRead?.(name)) {
          return Effect.fail(
            new ServerSecretStore.SecretStoreReadError({
              resource: name,
              cause: "temporary read failure",
            }),
          );
        }
        return Effect.succeed(Option.fromUndefinedOr(values.get(name)));
      }),
    create: (name, value) => Effect.sync(() => void values.set(name, value)),
    set: (name, value) => Effect.sync(() => void values.set(name, value)),
    remove: (name) => Effect.sync(() => void values.delete(name)),
    getOrCreateRandom: unused,
  });
  const currentShell = yield* Ref.make<OrchestrationV2ThreadShell | null>(shell());
  const shellReads: ThreadId[] = [];
  const catchUp = { shellSnapshotReads: 0 };
  const threads = ThreadManagementService.ThreadManagementService.of({
    getThreadShell: (threadId) =>
      Effect.sync(() => shellReads.push(threadId)).pipe(
        Effect.andThen(options.readShell?.(threadId) ?? Ref.get(currentShell)),
      ),
    getShellSnapshot: () =>
      Effect.sync(() => {
        catchUp.shellSnapshotReads += 1;
        return { schemaVersion: 2, snapshotSequence: 1, threads: [], archivedThreads: [] };
      }),
    listActiveSubagentThreadIds: unused,
    listOlderSettledThreads: unused,
    readShellSnapshot: unused,
    ensureLegacyTranscript: unused,
    dispatch: unused,
    searchThread: () => Effect.die("unused"),
    searchThreadStream: () => Stream.empty,
    getThreadHistoryPage: () => Effect.die("unused"),
    getTimelinePage: () => Effect.die("Unused timeline read"),
    getMessageCount: () => Effect.die("unused message count"),
    getTurnItem: () => Effect.die("unused turn item read"),
    getThreadRecords: () => Effect.die("unused record read"),
    getThreadProjection: unused,
    getCheckpointContext: unused,
    getThreadSnapshot: unused,
    getThreadTranscript: unused,
    getThreadSnapshotWindow: unused,
    getProjectThreadRecords: () => Effect.die("unused project record read"),
    getProjectThread: unused,
    listProjectThreads: unused,
    sendToThread: unused,
    assertProviderInstanceEnabled: unused,
    isProviderInstanceEnabledForProject: unused,
    hasReceipt: unused,
    waitForThread: unused,
    settleAfterRun: unused,
    settleThread: unused,
    interruptThread: unused,
    stopWorkflow: () => Effect.die("unused stopWorkflow"),
    awaitBackgroundTasks: unused,
    stopDelegatedTasks: unused,
    getThreadEventSequence: unused,
    recoverDelegatedTask: unused,
    delegatedTaskResultPending: unused,
    streamStoredEvents: Stream.empty,
    streamStoredEventsFrom: () => Stream.empty,
    streamDomainEvents: options.domainEvents ?? Stream.empty,
  });
  const publications: Array<{
    readonly url: string;
    readonly authorization: string | null;
    readonly state: RelayAgentActivityState | null;
  }> = [];
  const fetch: typeof globalThis.fetch = Object.assign(
    (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: Parameters<typeof globalThis.fetch>[1],
    ) => {
      const body = init?.body;
      if (typeof body !== "string" && !(body instanceof Uint8Array)) {
        return Promise.reject(new Error("Expected a serialized activity publish payload"));
      }
      const payload = decodePublishPayload(
        typeof body === "string" ? body : new TextDecoder().decode(body),
      );
      publications.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        state: payload.state,
      });
      return Promise.resolve(
        options.respond?.(publications.length) ?? Response.json({ ok: true, deliveries: [] }),
      );
    },
    { preconnect: () => {} },
  );
  const relay = yield* AgentAwarenessRelay.make.pipe(
    Effect.provideService(ServerSecretStore.ServerSecretStore, secrets),
    Effect.provideService(ThreadManagementService.ThreadManagementService, threads),
    Effect.provideService(ServerEnvironment.ServerEnvironment, {
      getEnvironmentId: Effect.succeed(EnvironmentId.make("relay-environment")),
      getDescriptor: unused(),
    }),
    Effect.provideService(ProjectService.ProjectService, {
      create: unused,
      bootstrap: unused,
      update: unused,
      delete: unused,
      getByWorkspaceRoot: unused,
      snapshot: Effect.succeed({ projects: [] } as never),
      getShell: unused,
      listShells: unused,
      getById: () =>
        Effect.succeedSome({
          id: PROJECT_ID,
          title: "Project",
          workspaceRoot: "/workspace",
          defaultModelSelection: null,
          scripts: [],
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        }),
    }),
    Effect.provideService(FetchHttpClient.Fetch, fetch),
    Effect.provide(NodeCrypto.layer),
  );
  return { relay, secrets, secretReads, currentShell, shellReads, publications, catchUp };
});

describe("AgentAwarenessRelay", () => {
  it.effect("coalesces queued updates and reruns a thread dirtied during publishing", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const rerunStarted = yield* Deferred.make<void>();
      const releaseRerun = yield* Deferred.make<void>();
      const processed: Array<{ threadId: ThreadId; revision: number }> = [];
      let revision = 1;
      const worker = yield* AgentAwarenessRelay.makeAgentAwarenessPublishWorker((threadId) =>
        Effect.gen(function* () {
          const currentRevision = revision;
          const index = processed.length;
          processed.push({ threadId, revision: currentRevision });
          if (index === 0) {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          } else if (threadId === THREAD_ID) {
            yield* Deferred.succeed(rerunStarted, undefined);
            yield* Deferred.await(releaseRerun);
          }
        }),
      );
      yield* worker.enqueue(THREAD_ID);
      yield* Deferred.await(started);
      revision = 2;
      for (let i = 0; i < 100; i++) {
        yield* worker.enqueue(SECOND_THREAD_ID);
        yield* worker.enqueue(THREAD_ID);
      }
      const drained = yield* Deferred.make<void>();
      const draining = yield* worker.drain.pipe(
        Effect.andThen(Deferred.succeed(drained, undefined)),
        Effect.forkChild,
      );
      yield* Deferred.succeed(release, undefined);
      yield* Deferred.await(rerunStarted);
      assert.isFalse(yield* Deferred.isDone(drained));
      yield* Deferred.succeed(releaseRerun, undefined);
      yield* Fiber.join(draining);
      assert.deepEqual(processed, [
        { threadId: THREAD_ID, revision: 1 },
        { threadId: SECOND_THREAD_ID, revision: 2 },
        { threadId: THREAD_ID, revision: 2 },
      ]);
    }),
  );

<<<<<<< HEAD
  it.effect("keeps the listener armed and skips imported thread work", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const events = yield* Queue.unbounded<OrchestrationEvent>();
        const threadShellRequested = yield* Deferred.make<void>();
        const releaseThreadShell = yield* Deferred.make<void>();
        const threadShellRequests: Array<ThreadId> = [];
        let fetchCallCount = 0;
        const secrets = makeMemorySecretStore();
        const now = "2026-05-25T00:00:00.000Z";
        const projectId = "project-1" as ProjectId;
        const threadId = "thread-1" as ThreadId;
        const importedThreadId = "import:codex:session-1" as ThreadId;
        const environmentId = "env-1" as EnvironmentId;

        const originalFetch = globalThis.fetch;
        globalThis.fetch = (() => {
          fetchCallCount += 1;
          return Promise.resolve(Response.json({ ok: true, deliveries: [] }));
        }) as unknown as typeof fetch;
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            globalThis.fetch = originalFetch;
          }),
        );

        const project = {
          id: projectId,
          title: "Marcode",
          workspaceRoot: "/workspace",
          repositoryIdentity: null,
          defaultModelSelection: null,
          scripts: [],
          ...PROJECT_WORKSPACE_LAYOUT_DEFAULTS,
          createdAt: now,
          updatedAt: now,
        } satisfies OrchestrationProjectShell;

        const thread = {
          id: threadId,
          projectId,
          title: "Run remote agent",
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          pullRequests: [],
          latestTurn: {
            turnId: "turn-1" as TurnId,
            state: "running",
            requestedAt: now,
            startedAt: now,
            completedAt: null,
            assistantMessageId: null,
          },
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          settledOverride: null,
          settledAt: null,
          session: {
            threadId,
            status: "running",
            providerName: "Codex",
            runtimeMode: "full-access",
            activeTurnId: "turn-1" as TurnId,
            lastError: null,
            updatedAt: now,
          },
          latestUserMessageAt: now,
          hasPendingApprovals: false,
          hasPendingUserInput: false,
          hasActionableProposedPlan: false,
        } satisfies OrchestrationThreadShell;

        const orchestrationEngine = {
          readEvents: () => Stream.empty,
          readThreadEvents: () => Stream.empty,
          getThreadReplayStats: () => Effect.die("unused thread replay stats"),
          dispatch: () => Effect.succeed({ sequence: 1 }),
          streamDomainEvents: Stream.fromQueue(events),
          subscribeDomainEvents: Effect.succeed(Stream.fromQueue(events)),
          latestSequence: Effect.succeed(0),
        } satisfies OrchestrationEngineShape;

        const snapshotQuery = {
          getShellSnapshot: () =>
            Effect.succeed({
              snapshotSequence: 1,
              projects: [],
              threads: [],
              updatedAt: now,
            } satisfies OrchestrationShellSnapshot),
          getThreadShellById: (requestedThreadId: ThreadId) =>
            Effect.gen(function* () {
              threadShellRequests.push(requestedThreadId);
              if (requestedThreadId !== threadId) return Option.none();
              yield* Deferred.succeed(threadShellRequested, undefined);
              yield* Deferred.await(releaseThreadShell);
              return Option.some(thread);
            }),
          getProjectShellById: () => Effect.succeedSome(project),
        } as unknown as ProjectionSnapshotQueryShape;

        const descriptor = {
          environmentId,
          label: "Test Desktop",
          platform: {
            os: "darwin",
            arch: "arm64",
          },
          serverVersion: "0.0.0-test",
          capabilities: {
            repositoryIdentity: true,
          },
        } satisfies ExecutionEnvironmentDescriptor;

        const layer = Layer.mergeAll(
          Layer.succeed(ServerSecretStore.ServerSecretStore, secrets.store),
          Layer.succeed(ServerEnvironment.ServerEnvironment, {
            getEnvironmentId: Effect.succeed(environmentId),
            getDescriptor: Effect.succeed(descriptor),
          }),
          Layer.succeed(OrchestrationEngineService, orchestrationEngine),
          Layer.succeed(ProjectionSnapshotQuery, snapshotQuery),
        );

        yield* Effect.gen(function* () {
          const relay = yield* AgentAwarenessRelay.AgentAwarenessRelay;
          yield* relay.start();
          yield* secrets.setString(RELAY_URL_SECRET, "https://relay.example.test");
          yield* secrets.setString(RELAY_ENVIRONMENT_CREDENTIAL_SECRET, "relay-credential");
          yield* secrets.setString(PUBLISH_AGENT_ACTIVITY_SECRET, "true");
          yield* Queue.offer(events, {
            type: "thread.created",
            sequence: 1,
            eventId: "evt-import-created",
            commandId: CommandId.make("cmd-import-created"),
            aggregateKind: "thread",
            aggregateId: importedThreadId,
            metadata: { historyImport: true },
            payload: { threadId: importedThreadId },
            occurredAt: now,
          } as unknown as OrchestrationEvent);
          yield* Queue.offer(events, {
            type: "thread.settled",
            sequence: 2,
            eventId: "evt-import-settled",
            commandId: CommandId.make("cmd-import-settled"),
            aggregateKind: "thread",
            aggregateId: importedThreadId,
            metadata: { historyImport: true },
            payload: { threadId: importedThreadId },
            occurredAt: now,
          } as unknown as OrchestrationEvent);
          yield* Queue.offer(events, {
            type: "thread.activity-appended",
            sequence: 3,
            eventId: "evt-1",
            commandId: CommandId.make("cmd-1"),
            aggregateKind: "thread",
            aggregateId: threadId,
            actor: { kind: "server" },
            metadata: {},
            payload: {
              threadId,
              activity: {
                kind: "approval.requested",
              },
            },
            occurredAt: now,
          } as unknown as OrchestrationEvent);

          yield* Deferred.await(threadShellRequested).pipe(Effect.timeout("2 seconds"));
          expect(threadShellRequests).toEqual([threadId]);
          expect(fetchCallCount).toBe(0);
          yield* Deferred.succeed(releaseThreadShell, undefined);
        }).pipe(
          Effect.provide(
            AgentAwarenessRelay.layer.pipe(
              Layer.provide(layer),
              Layer.provideMerge(NodeServices.layer),
            ),
          ),
        );
      }),
    ),
=======
  it.effect("deduplicates state and republishes title changes", () =>
    Effect.gen(function* () {
      const { relay, currentShell, publications } = yield* makeTestRelay();
      yield* relay.publishThread(THREAD_ID);
      yield* Ref.set(
        currentShell,
        shell({ updatedAt: DateTime.makeUnsafe("2026-09-04T13:00:00Z") }),
      );
      yield* relay.publishThread(THREAD_ID);
      assert.equal(publications.length, 1);
      yield* Ref.set(currentShell, shell({ title: "Renamed thread" }));
      yield* relay.publishThread(THREAD_ID);
      assert.equal(publications.length, 2);
      assert.equal(publications[1]?.state?.threadTitle, "Renamed thread");
    }),
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  );

  it.effect("republishes unchanged state with fresh credentials after relinking", () =>
    Effect.gen(function* () {
      const { relay, secrets, publications } = yield* makeTestRelay();
      yield* relay.publishThread(THREAD_ID);
      yield* secrets.set(
        RELAY_ENVIRONMENT_CREDENTIAL_SECRET,
        new TextEncoder().encode("credential-2"),
      );
      yield* relay.publishThread(THREAD_ID);
      assert.equal(publications.length, 2);
      assert.equal(publications[0]?.authorization, "Bearer credential-1");
      assert.equal(publications[1]?.authorization, "Bearer credential-2");
      yield* secrets.set(
        RELAY_URL_SECRET,
        new TextEncoder().encode("https://new-relay.example.test"),
      );
      yield* relay.publishThread(THREAD_ID);
      assert.equal(publications.length, 3);
      assert.isTrue(publications[2]?.url.startsWith("https://new-relay.example.test/") ?? false);
    }),
  );

  it.effect.each(["completed", "failed"] as const)(
    "publishes a tombstone when a %s thread is settled through a domain event",
    (status) =>
      Effect.gen(function* () {
        const events = yield* Queue.unbounded<OrchestrationV2DomainEvent>();
        const pulls = yield* Queue.unbounded<void>();
        const { relay, currentShell, publications } = yield* makeTestRelay({
          domainEvents: Stream.fromEffectRepeat(
            Queue.offer(pulls, undefined).pipe(Effect.andThen(Queue.take(events))),
          ),
        });
        yield* relay.start();
        yield* Queue.take(pulls);
        yield* relay.publishThread(THREAD_ID);
        const terminal = shell({ status });
        yield* Ref.set(currentShell, terminal);
        yield* relay.publishThread(THREAD_ID);
        yield* TestClock.adjust("5 seconds");
        yield* relay.drain;
        assert.equal(publications[1]?.state?.phase, status);

<<<<<<< HEAD
        const project = {
          id: projectId,
          title: "Marcode",
          workspaceRoot: "/workspace",
          repositoryIdentity: null,
          defaultModelSelection: null,
          scripts: [],
          ...PROJECT_WORKSPACE_LAYOUT_DEFAULTS,
          createdAt: now,
          updatedAt: now,
        } satisfies OrchestrationProjectShell;

        const thread = {
          id: threadId,
          projectId,
          title: "Run remote agent",
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          pullRequests: [],
          latestTurn: {
            turnId: "turn-1" as TurnId,
            state: "running",
            requestedAt: now,
            startedAt: now,
            completedAt: null,
            assistantMessageId: null,
          },
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          settledOverride: null,
          settledAt: null,
          session: {
            threadId,
            status: "running",
            providerName: "Codex",
            runtimeMode: "full-access",
            activeTurnId: "turn-1" as TurnId,
            lastError: null,
            updatedAt: now,
          },
          latestUserMessageAt: now,
          hasPendingApprovals: false,
          hasPendingUserInput: false,
          hasActionableProposedPlan: false,
        } satisfies OrchestrationThreadShell;

        const descriptor = {
          environmentId,
          label: "Test Desktop",
          platform: {
            os: "darwin",
            arch: "arm64",
          },
          serverVersion: "0.0.0-test",
          capabilities: {
            repositoryIdentity: true,
          },
        } satisfies ExecutionEnvironmentDescriptor;

        globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
          const url = new URL(
            typeof input === "string" || input instanceof URL
              ? input
              : (input as unknown as { readonly url: string }).url,
          );
          resolveFetchSeen(url);
          return Promise.resolve(Response.json({ ok: true, deliveries: [] }));
        }) as unknown as typeof fetch;
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            globalThis.fetch = originalFetch;
          }),
        );

        const layer = Layer.mergeAll(
          Layer.succeed(ServerSecretStore.ServerSecretStore, secrets.store),
          Layer.succeed(ServerEnvironment.ServerEnvironment, {
            getEnvironmentId: Effect.succeed(environmentId),
            getDescriptor: Effect.succeed(descriptor),
          }),
          Layer.succeed(OrchestrationEngineService, {
            readEvents: () => Stream.empty,
            readThreadEvents: () => Stream.empty,
            getThreadReplayStats: () => Effect.die("unused thread replay stats"),
            dispatch: () => Effect.succeed({ sequence: 1 }),
            streamDomainEvents: Stream.fromQueue(events),
            subscribeDomainEvents: Effect.succeed(Stream.fromQueue(events)),
            latestSequence: Effect.succeed(0),
          } satisfies OrchestrationEngineShape),
          Layer.succeed(ProjectionSnapshotQuery, {
            getShellSnapshot: () =>
              Effect.succeed({
                snapshotSequence: 1,
                projects: [project],
                threads: [thread],
                updatedAt: now,
              } satisfies OrchestrationShellSnapshot),
            getThreadShellById: () => Effect.succeedSome(thread),
            getProjectShellById: () => Effect.succeedSome(project),
          } as unknown as ProjectionSnapshotQueryShape),
        );

        yield* Effect.gen(function* () {
          const relay = yield* AgentAwarenessRelay.AgentAwarenessRelay;
          yield* secrets.setString(RELAY_URL_SECRET, "https://transport.example.test");
          yield* secrets.setString(RELAY_ISSUER_SECRET, "https://issuer.example.test");
          yield* secrets.setString(RELAY_ENVIRONMENT_CREDENTIAL_SECRET, "relay-credential");
          yield* secrets.setString(PUBLISH_AGENT_ACTIVITY_SECRET, "true");
          yield* relay.start();
          yield* Queue.offer(events, {
            type: "thread.activity-appended",
            sequence: 1,
            eventId: "evt-1",
            commandId: CommandId.make("cmd-1"),
            aggregateKind: "thread",
            aggregateId: threadId,
            actor: { kind: "server" },
            metadata: {},
            payload: {
              threadId,
              activity: {
                kind: "approval.requested",
              },
            },
            occurredAt: now,
          } as unknown as OrchestrationEvent);

          const url = yield* Effect.promise(() => fetchSeen).pipe(Effect.timeout("2 seconds"));
          expect(url.origin).toBe("https://transport.example.test");
          expect(productSpans).toContain("makePublishProof");
          expect(userSpans).not.toContain("makePublishProof");
        }).pipe(
          Effect.provide(
            AgentAwarenessRelay.layer.pipe(
              Layer.provide(layer),
              Layer.provideMerge(NodeServices.layer),
            ),
          ),
          Effect.provideService(RelayClientTracer, Option.some(collectingTracer(productSpans))),
          Effect.withTracer(collectingTracer(userSpans)),
        );
      }),
    ),
  );

  it.effect("does not alert for historical completions after startup", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const secrets = makeMemorySecretStore();
        const now = yield* DateTime.now;
        const old = DateTime.formatIso(DateTime.add(now, { days: -7 }));
        const threadId = "thread-old" as ThreadId;
        const projectId = "project-1" as ProjectId;
        const environmentId = "env-1" as EnvironmentId;
        const project = {
          id: projectId,
          title: "T3 Code",
          workspaceRoot: "/workspace",
          repositoryIdentity: null,
          defaultModelSelection: null,
          scripts: [],
          workspaceLayoutVersion: INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION,
          workspaceLayout: EMPTY_PROJECT_WORKSPACE_LAYOUT,
          createdAt: old,
          updatedAt: old,
        } satisfies OrchestrationProjectShell;
        const completedTurn = {
          turnId: "turn-1" as TurnId,
          state: "completed",
          requestedAt: old,
          startedAt: old,
          completedAt: old,
          assistantMessageId: null,
        } as const;
        const completedThread = {
          id: threadId,
          projectId,
          title: "Old task",
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
=======
        const now = yield* DateTime.now;
        const settled = {
          ...terminal,
          settledOverride: "settled" as const,
          settledAt: now,
          lastVisitedAt: null,
        };
        yield* Ref.set(currentShell, settled);
        yield* Queue.offer(events, {
          id: EventId.make("event:settled"),
          type: "thread.settled",
          threadId: THREAD_ID,
          occurredAt: now,
          payload: settled,
        });
        yield* Queue.take(pulls);
        yield* relay.drain;
        assert.equal(publications.length, 2);
        yield* TestClock.adjust("5 seconds");
        yield* relay.drain;
        assert.equal(publications.length, 3);
        assert.equal(publications[2]?.state, null);
      }).pipe(Effect.scoped),
  );

  it.effect("holds a completion through a continuation gap, then publishes it once", () =>
    Effect.gen(function* () {
      const { relay, currentShell, publications } = yield* makeTestRelay();
      yield* relay.publishThread(THREAD_ID);
      yield* Ref.set(currentShell, shell({ status: "completed" }));
      yield* relay.publishThread(THREAD_ID);
      yield* Ref.set(currentShell, shell());
      yield* relay.publishThread(THREAD_ID);
      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      assert.deepEqual(
        publications.map((publication) => publication.state?.phase),
        ["running"],
      );

      yield* Ref.set(currentShell, shell({ status: "completed" }));
      yield* relay.publishThread(THREAD_ID);
      assert.equal(publications.length, 1);
      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      assert.deepEqual(
        publications.map((publication) => publication.state?.phase),
        ["running", "completed"],
      );
    }),
  );

  it.effect("still publishes a completion when the thread settles during the hold", () =>
    Effect.gen(function* () {
      const { relay, currentShell, publications } = yield* makeTestRelay();
      yield* relay.publishThread(THREAD_ID);
      const completed = shell({ status: "completed" });
      yield* Ref.set(currentShell, completed);
      yield* relay.publishThread(THREAD_ID);
      yield* Ref.set(currentShell, {
        ...completed,
        settledOverride: "settled",
        settledAt: yield* DateTime.now,
        lastVisitedAt: null,
      });
      yield* relay.publishThread(THREAD_ID);
      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      assert.deepEqual(
        publications.map((publication) => publication.state?.phase ?? null),
        ["running", "completed"],
      );

      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      assert.deepEqual(
        publications.map((publication) => publication.state?.phase ?? null),
        ["running", "completed", null],
      );
    }),
  );

  it.effect("drops a held completion when a queued continuation hides the thread", () =>
    Effect.gen(function* () {
      const { relay, currentShell, publications } = yield* makeTestRelay();
      yield* relay.publishThread(THREAD_ID);
      yield* Ref.set(currentShell, shell({ status: "completed" }));
      yield* relay.publishThread(THREAD_ID);
      yield* Ref.set(currentShell, shell({ status: "queued" }));
      yield* relay.publishThread(THREAD_ID);
      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      assert.notInclude(
        publications.map((publication) => publication.state?.phase ?? null),
        "completed",
      );
    }),
  );

  it.effect("retries a failed completion even after the thread settles", () =>
    Effect.gen(function* () {
      const { relay, currentShell, publications } = yield* makeTestRelay({
        respond: (attempt) =>
          attempt === 2
            ? new Response("unavailable", { status: 503 })
            : Response.json({ ok: true, deliveries: [] }),
      });
      yield* relay.publishThread(THREAD_ID);
      const completed = shell({ status: "completed" });
      yield* Ref.set(currentShell, completed);
      yield* relay.publishThread(THREAD_ID);
      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      yield* Ref.set(currentShell, {
        ...completed,
        settledOverride: "settled",
        settledAt: yield* DateTime.now,
        lastVisitedAt: null,
      });
      yield* TestClock.adjust("1 second");
      yield* relay.drain;
      assert.deepEqual(
        publications.map((publication) => publication.state?.phase ?? null),
        ["running", "completed", "completed"],
      );

      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      assert.equal(publications.at(-1)?.state ?? null, null);
    }),
  );

  it.effect("keeps settled live work until its awaited monitor finishes", () =>
    Effect.gen(function* () {
      const { relay, currentShell, publications } = yield* makeTestRelay();
      yield* relay.publishThread(THREAD_ID);
      const held = shell({
        status: "completed",
        settledOverride: "settled",
        pendingBackgroundTasks: [{ taskId: "watch", kind: "monitor", awaited: true }],
      });
      yield* Ref.set(currentShell, held);
      yield* relay.publishThread(THREAD_ID);
      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      assert.equal(publications.length, 1);
      assert.equal(publications[0]?.state?.phase, "running");

      yield* Ref.set(currentShell, { ...held, pendingBackgroundTasks: [] });
      yield* relay.publishThread(THREAD_ID);
      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      assert.equal(publications.length, 2);
      assert.equal(publications[1]?.state, null);
    }),
  );
  it.effect("publishes a held completion when its background item ends, not on tool output", () =>
    Effect.gen(function* () {
      const store = yield* ProjectionStore.ProjectionStoreV2;
      const events = yield* Queue.unbounded<OrchestrationV2DomainEvent>();
      const pulls = yield* Queue.unbounded<void>();
      const { relay, shellReads, publications } = yield* makeTestRelay({
        readShell: (threadId) => store.getThreadShell(threadId).pipe(Effect.orDie),
        domainEvents: Stream.fromEffectRepeat(
          Queue.offer(pulls, undefined).pipe(Effect.andThen(Queue.take(events))),
        ),
      });
      yield* relay.start();
      yield* Queue.take(pulls);
      const deliver = Effect.fnUntraced(function* (event: OrchestrationV2DomainEvent) {
        yield* store.apply(event);
        yield* Queue.offer(events, event);
        yield* Queue.take(pulls);
        yield* relay.drain;
      });

      const now = yield* DateTime.now;
      const runId = RunId.make("run:held-item");
      const run = {
        id: runId,
        threadId: THREAD_ID,
        ordinal: 1,
        providerInstanceId: ProviderInstanceId.make("codex"),
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test-model" },
        providerThreadId: null,
        userMessageId: MessageId.make("message:held-item"),
        rootNodeId: null,
        activeAttemptId: null,
        status: "running" as const,
        requestedAt: now,
        startedAt: now,
        completedAt: null,
        checkpointId: null,
        contextHandoffId: null,
      };
      const item = (
        id: string,
        fields: Pick<OrchestrationV2TurnItem, "status"> &
          (
            | { readonly type: "dynamic_tool"; readonly toolName: string; readonly input: unknown }
            | {
                readonly type: "assistant_message";
                readonly messageId: MessageId;
                readonly text: string;
                readonly streaming: boolean;
              }
          ),
      ): OrchestrationV2TurnItem => ({
        id: TurnItemId.make(id),
        threadId: THREAD_ID,
        runId,
        nodeId: NodeId.make("node:held-item"),
        providerThreadId: null,
        providerTurnId: null,
        nativeItemRef: null,
        parentItemId: null,
        ordinal: 1,
        title: null,
        startedAt: now,
        completedAt: null,
        updatedAt: now,
        ...fields,
      });
      const itemEvent = (id: string, payload: OrchestrationV2TurnItem) =>
        ({
          id: EventId.make(id),
          type: "turn-item.updated",
          threadId: THREAD_ID,
          runId,
          occurredAt: now,
          payload,
        }) satisfies OrchestrationV2DomainEvent;
      const background = { type: "dynamic_tool" as const, toolName: "watch", input: {} };

      yield* deliver({
        id: EventId.make("event:held-item:thread"),
        type: "thread.created",
        threadId: THREAD_ID,
        occurredAt: now,
        payload: {
          createdBy: "user",
          creationSource: "web",
          id: THREAD_ID,
          projectId: PROJECT_ID,
          title: "Thread",
          providerInstanceId: ProviderInstanceId.make("codex"),
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test-model" },
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          activeProviderThreadId: null,
          lineage: { rootThreadId: THREAD_ID, parentThreadId: null, relationshipToParent: null },
          forkedFrom: null,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          settledOverride: null,
          settledAt: null,
          lastVisitedAt: null,
          deletedAt: null,
        },
      });
      yield* deliver({
        id: EventId.make("event:held-item:run"),
        type: "run.created",
        threadId: THREAD_ID,
        runId,
        occurredAt: now,
        payload: run,
      });
      yield* deliver(
        itemEvent("event:held-item:tool", item("item:tool", { ...background, status: "running" })),
      );
      yield* deliver({
        id: EventId.make("event:held-item:run-completed"),
        type: "run.updated",
        threadId: THREAD_ID,
        runId,
        occurredAt: now,
        payload: { ...run, status: "completed", completedAt: now },
      });
      assert.deepEqual(
        publications.map((publication) => publication.state?.phase),
        ["running"],
      );

      const readsBeforeOutput = shellReads.length;
      yield* deliver(
        itemEvent(
          "event:held-item:reply",
          item("item:reply", {
            type: "assistant_message",
            messageId: MessageId.make("message:held-item:reply"),
            text: "Still watching",
            streaming: true,
            status: "running",
          }),
        ),
      );
      yield* deliver(
        itemEvent("event:held-item:tick", item("item:tool", { ...background, status: "running" })),
      );
      assert.equal(shellReads.length, readsBeforeOutput);

      yield* deliver(
        itemEvent("event:held-item:end", item("item:tool", { ...background, status: "completed" })),
      );
      yield* TestClock.adjust("5 seconds");
      yield* relay.drain;
      assert.deepEqual(
        publications.map((publication) => publication.state?.phase),
        ["running", "completed"],
      );
    }).pipe(Effect.scoped, Effect.provide(ProjectionStore.layerMemory)),
  );
});
