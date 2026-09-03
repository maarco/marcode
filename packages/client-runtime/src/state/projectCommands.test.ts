import {
  CommandId,
  EnvironmentId,
  ORCHESTRATION_WS_METHODS,
  ProjectId,
  ProjectWorkspaceItemId,
  type ClientOrchestrationCommand,
} from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
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
        subscribeServerConfig: () => Stream.never,
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
});
