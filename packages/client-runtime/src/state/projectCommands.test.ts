<<<<<<< HEAD
import {
  CommandId,
  EnvironmentId,
  ORCHESTRATION_WS_METHODS,
  ProjectId,
  ProjectWorkspaceItemId,
  type ClientOrchestrationCommand,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
} from "../connection/model.ts";
import { EnvironmentNotRegisteredError, EnvironmentRegistry } from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import * as RpcSession from "../rpc/session.ts";
import { createProjectEnvironmentAtoms } from "./projectCommands.ts";

const TEST_CRYPTO_LAYER = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => new Uint8Array(size),
    digest: (_algorithm, data) => Effect.succeed(data),
  }),
);

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const TARGET = new PrimaryConnectionTarget({
  environmentId: ENVIRONMENT_ID,
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});

/**
 * A fake `EnvironmentRegistry` wired to one fake `EnvironmentSupervisor` whose RPC client
 * records every dispatched command instead of hitting a real transport — the same shape of
 * harness `operations/commands.test.ts` uses for `EnvironmentSupervisor` and
 * `apps/web/src/cloud/linkEnvironment.test.ts` uses for `EnvironmentRegistry.run`. Only
 * `ENVIRONMENT_ID` is "registered"; any other environment id fails with
 * `EnvironmentNotRegisteredError`, exactly like the real registry does for an unknown id.
 */
function testLayer(dispatched: ClientOrchestrationCommand[]) {
  return Layer.effect(
    EnvironmentRegistry,
    Effect.gen(function* () {
      const client = {
        [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command: ClientOrchestrationCommand) =>
          Effect.sync(() => {
            dispatched.push(command);
            return { sequence: dispatched.length };
          }),
      } as unknown as WsRpcProtocolClient;
      const session: RpcSession.RpcSession = {
        client,
        initialConfig: Effect.never,
        // Upstream added this to RpcSession; these tests dispatch commands and
        // never subscribe, so the stub only has to satisfy the shape.
        subscribeServerConfig: () => Stream.empty,
        ready: Effect.void,
        probe: Effect.void,
        closed: Effect.never,
      };
      const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
        target: TARGET,
        state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
        session: yield* SubscriptionRef.make(Option.some(session)),
        prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
        connect: Effect.void,
        disconnect: Effect.void,
        retryNow: Effect.void,
      } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
      const registry = {
        run: <A, E, R>(environmentId: EnvironmentId, effect: Effect.Effect<A, E, R>) =>
          environmentId === ENVIRONMENT_ID
            ? Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor)
            : Effect.fail(new EnvironmentNotRegisteredError({ environmentId })),
      } as unknown as EnvironmentRegistry["Service"];
      return EnvironmentRegistry.of(registry);
    }),
  );
}

describe("createProjectEnvironmentAtoms.applyWorkspaceLayout", () => {
  // Regression coverage for a real, live-app-reproduced bug: `apps/web`'s
  // `useUnifiedWorkspaceProject.ts` used to call `applyProjectWorkspaceLayout(...)` directly
  // and `await` (or `.then`/`.catch`) the return value. `applyProjectWorkspaceLayout` returns
  // an `Effect.Effect<...>`, not a `Promise` — awaiting it directly never runs the Effect, so
  // the "result" was just the un-run Effect object. Reading `.ok` off that is `undefined`
  // (falsy), so code fell through to read `.rejection.tag`, which threw "Cannot read
  // properties of undefined (reading 'tag')" in the browser on every attach/move/rename/etc.
  // The fix routes the call through `createEnvironmentCommand` (this file) and `useAtomCommand`
  // (the web hook), which actually execute the Effect. These tests fail immediately if that
  // wiring regresses — e.g. if `execute` ever stopped returning/running the real Effect, the
  // dispatched-command list below would stay empty and the settled value would not match.

  it("actually executes the Effect and dispatches the real wire command", async () => {
    const dispatched: ClientOrchestrationCommand[] = [];
    const runtime = Atom.runtime(Layer.mergeAll(testLayer(dispatched), TEST_CRYPTO_LAYER));
    const atoms = createProjectEnvironmentAtoms(runtime);
    const registry = AtomRegistry.make();

    const result = await atoms.applyWorkspaceLayout.run(registry, {
      environmentId: ENVIRONMENT_ID,
      input: {
        environmentId: ENVIRONMENT_ID,
        projectId: ProjectId.make("project-1"),
        expectedVersion: 3,
        operation: {
          type: "rename",
          itemId: ProjectWorkspaceItemId.make("item-1"),
          label: "renamed",
        },
        commandId: CommandId.make("apply-1"),
      },
    });

    // An un-run Effect has neither `_tag` nor `.value` — a caller reading `.value.ok` off it
    // throws exactly the bug's error. Asserting the real settled shape here fails immediately
    // if `applyWorkspaceLayout` ever stops actually running the Effect.
    expect(result._tag).toBe("Success");
    if (result._tag === "Success") {
      expect(result.value).toEqual({ ok: true, layoutVersion: 4 });
    }

    // And proof the dispatch genuinely reached the (fake) wire, not just that some promise
    // resolved to a truthy-looking value.
    expect(dispatched).toEqual([
      {
        type: "project.workspace-layout.apply",
        commandId: "apply-1",
        projectId: "project-1",
        expectedVersion: 3,
        operation: {
          type: "rename",
          itemId: "item-1",
          label: "renamed",
        },
      },
    ]);

    registry.dispose();
  });

  it("settles a connection-level failure as a Failure result instead of throwing or hanging", async () => {
    const dispatched: ClientOrchestrationCommand[] = [];
    const runtime = Atom.runtime(Layer.mergeAll(testLayer(dispatched), TEST_CRYPTO_LAYER));
    const atoms = createProjectEnvironmentAtoms(runtime);
    const registry = AtomRegistry.make();

    const result = await atoms.applyWorkspaceLayout.run(registry, {
      environmentId: EnvironmentId.make("unregistered-environment"),
      input: {
        environmentId: EnvironmentId.make("unregistered-environment"),
        projectId: ProjectId.make("project-1"),
        expectedVersion: 0,
        operation: {
          type: "rename",
          itemId: ProjectWorkspaceItemId.make("item-1"),
          label: "renamed",
        },
      },
    });

    expect(result._tag).toBe("Failure");
    expect(dispatched).toEqual([]);

    registry.dispose();
  });
=======
import { describe, expect, it } from "@effect/vitest";
import {
  AuthFilesystemWriteScope,
  EnvironmentId,
  ProjectId,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ThreadId,
  type AuthSessionState,
  type ScopedProjectRef,
  WS_METHODS,
} from "@t3tools/contracts";
import { vi } from "vite-plus/test";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as Stream from "effect/Stream";
import { Atom, AtomRegistry, AsyncResult } from "effect/reactivity";
import { AVAILABLE_CONNECTION_STATE } from "../connection/model.ts";

import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { RpcSession } from "../rpc/session.ts";
import type { EnvironmentProject } from "./models.ts";
import { createProjectEnvironmentAtoms } from "./projectCommands.ts";

const decodeReadFileInput = Schema.decodeUnknownSync(ProjectReadFileInput);
const decodeReadFileResult = Schema.decodeUnknownSync(ProjectReadFileResult);
const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
vi.mock("./session.ts", () => ({
  createEnvironmentSessionAtoms: () => ({ sessionStateAtom: sessions }),
}));
const sessions = Atom.family((_id: EnvironmentId) =>
  Atom.make<AsyncResult.AsyncResult<AuthSessionState>>(AsyncResult.initial()),
);
const PROJECT_ID = ProjectId.make("scratch");
const PROJECT = {
  id: PROJECT_ID,
  environmentId: ENVIRONMENT_ID,
  workspaceRoot: "/scratch",
} as EnvironmentProject;

const makeHarness = Effect.fn("TestProjectCommands.makeHarness")(function* () {
  const metadataRequests: string[][] = [];
  const file = { byteLength: 5 };
  const readResponse = {
    wait: Effect.void as Effect.Effect<void>,
    missing: false,
  };
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: { environmentId: ENVIRONMENT_ID },
    session: yield* SubscriptionRef.make(
      Option.some({
        client: {
          [WS_METHODS.projectsEnsureScratch]: () => Effect.succeed({ projectId: PROJECT_ID }),
          [WS_METHODS.projectsReadFile]: () =>
            Effect.gen(function* () {
              const byteLength = file.byteLength;
              yield* readResponse.wait;
              return decodeReadFileResult(
                readResponse.missing
                  ? {
                      relativePath: "foo",
                      byteLength: 0,
                      contents: "",
                      truncated: false,
                      exists: false,
                    }
                  : { relativePath: "foo", byteLength, contents: "old", truncated: false },
              );
            }),
          [WS_METHODS.projectsWriteFile]: () =>
            Effect.sync(() => {
              file.byteLength = 10;
              return { relativePath: "foo" };
            }),
          [WS_METHODS.filesystemGetMetadata]: (input: { paths: string[] }) =>
            Effect.sync(() => {
              metadataRequests.push(input.paths);
              return {
                entries: input.paths.map(() =>
                  readResponse.missing
                    ? null
                    : { kind: "file" as const, byteLength: file.byteLength },
                ),
              };
            }),
        },
      } as unknown as RpcSession),
    ),
    state: yield* SubscriptionRef.make({
      ...AVAILABLE_CONNECTION_STATE,
      phase: "connected" as const,
    }),
  } as EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  const runtime = Atom.runtime(
    Layer.mergeAll(
      Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, {
        run: (_environmentId, effect) =>
          Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        followStream: (_environmentId, stream) =>
          Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
      } as EnvironmentRegistry.EnvironmentRegistry["Service"]),
      Layer.succeed(
        Crypto.Crypto,
        Crypto.make({
          randomBytes: (size) => new Uint8Array(size),
          digest: (_algorithm, data) => Effect.succeed(data),
        }),
      ),
    ),
  );
  const storedProject = Atom.make<EnvironmentProject | null>(null);
  const commands = createProjectEnvironmentAtoms(runtime, {
    projectAtom: (ref: ScopedProjectRef) =>
      ref.environmentId === ENVIRONMENT_ID && ref.projectId === PROJECT_ID
        ? storedProject
        : Atom.make(null),
  });
  const registry = AtomRegistry.make();
  yield* Effect.addFinalizer(() => Effect.sync(() => registry.dispose()));
  registry.set(
    sessions(ENVIRONMENT_ID),
    AsyncResult.success({
      authenticated: true,
      auth: {
        policy: "remote-reachable" as const,
        bootstrapMethods: [],
        sessionMethods: [],
        sessionCookieName: "test",
      },
      scopes: [AuthFilesystemWriteScope],
      permissions: [AuthFilesystemWriteScope],
    }),
  );
  const openScratch = Effect.promise(() =>
    commands.openScratch.run(registry, { environmentId: ENVIRONMENT_ID, input: {} }),
  );
  return { registry, storedProject, openScratch, commands, metadataRequests, readResponse };
});

describe("writeFile metadata", () => {
  it.effect("preserves optional read results without seeding metadata for an absent file", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      h.readResponse.missing = true;
      const input = { cwd: "/repo", relativePath: "foo", allowMissing: true };
      expect.soft(decodeReadFileInput(input)).toEqual(input);
      const result = yield* AtomRegistry.getResult(
        h.registry,
        h.commands.readFile({ environmentId: ENVIRONMENT_ID, input }),
        { suspendOnWaiting: true },
      );
      expect.soft(result).toEqual({
        relativePath: "foo",
        byteLength: 0,
        contents: "",
        truncated: false,
        exists: false,
      });
      const metadata = h.commands.fileMetadata({
        environmentId: ENVIRONMENT_ID,
        input: { path: "/repo/foo" },
      });
      expect(
        yield* AtomRegistry.getResult(h.registry, metadata, { suspendOnWaiting: true }),
      ).toBeNull();
      expect(h.metadataRequests).toEqual([["/repo/foo"]]);
    }).pipe(Effect.scoped),
  );

  it.effect("does not restore old metadata from a read completed after a write", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const threadId = ThreadId.make("stale-read-thread");
      h.registry.mount(h.commands.fileMetadataThread({ environmentId: ENVIRONMENT_ID, threadId }));
      const metadata = h.commands.fileMetadata({
        environmentId: ENVIRONMENT_ID,
        input: { path: "/repo/foo", threadId },
      });
      h.registry.mount(metadata);
      const readMetadata = () =>
        AtomRegistry.getResult(h.registry, metadata, { suspendOnWaiting: true });
      yield* readMetadata();
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      h.readResponse.wait = Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Deferred.await(release)),
      );
      const fileRead = yield* AtomRegistry.getResult(
        h.registry,
        h.commands.readFile({
          environmentId: ENVIRONMENT_ID,
          input: { cwd: "/repo", relativePath: "foo" },
        }),
        { suspendOnWaiting: true },
      ).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      const write = yield* Effect.promise(() =>
        h.commands.writeFile.run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { cwd: "/repo", relativePath: "foo", contents: "new" },
        }),
      );
      expect(write._tag).toBe("Success");
      expect(yield* readMetadata()).toEqual({ kind: "file", byteLength: 10 });
      yield* Deferred.succeed(release, undefined);
      expect((yield* Fiber.join(fileRead)).byteLength).toBe(5);
      h.registry.refresh(metadata);
      expect(yield* readMetadata()).toEqual({ kind: "file", byteLength: 10 });
      expect(h.metadataRequests).toHaveLength(2);
    }).pipe(Effect.scoped),
  );

  it.effect("refreshes retained canonical and original paths after an aliased write", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const threadId = ThreadId.make("write-metadata-thread");
      h.registry.mount(h.commands.fileMetadataThread({ environmentId: ENVIRONMENT_ID, threadId }));
      const atoms = ["/repo/foo", "/repo/./foo"].map((path) =>
        h.commands.fileMetadata({ environmentId: ENVIRONMENT_ID, input: { path, threadId } }),
      );
      for (const atom of atoms) h.registry.mount(atom);
      const read = () =>
        Effect.forEach(
          atoms,
          (atom) => AtomRegistry.getResult(h.registry, atom, { suspendOnWaiting: true }),
          { concurrency: "unbounded" },
        );
      expect(yield* read()).toEqual([
        { kind: "file", byteLength: 5 },
        { kind: "file", byteLength: 5 },
      ]);
      const result = yield* Effect.promise(() =>
        h.commands.writeFile.run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { cwd: "/repo", relativePath: "./foo", contents: "new" },
        }),
      );
      expect(result).toMatchObject({ _tag: "Success", value: { relativePath: "foo" } });
      expect(yield* read()).toEqual([
        { kind: "file", byteLength: 10 },
        { kind: "file", byteLength: 10 },
      ]);
      expect(h.metadataRequests.flat()).toEqual([
        "/repo/foo",
        "/repo/./foo",
        "/repo/foo",
        "/repo/./foo",
      ]);
    }).pipe(Effect.scoped),
  );
});

describe("openScratch", () => {
  it.effect("resolves once the created project reaches the client store", () =>
    Effect.gen(function* () {
      const { registry, storedProject, openScratch } = yield* makeHarness();
      const opening = yield* Effect.forkChild(openScratch);
      yield* Effect.yieldNow;
      registry.set(storedProject, PROJECT);
      const result = yield* Fiber.join(opening);
      expect(result).toMatchObject({ _tag: "Success", value: PROJECT });
    }).pipe(Effect.scoped),
  );
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
});
