import * as NodeServices from "@effect/platform-node/NodeServices";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as NodeOS from "node:os";

import { assert } from "vite-plus/test";
import { it } from "vite-plus/test";
import { hydratePosixHome, resolveBaseDir } from "./os-jank.ts";

it("hydrates HOME for minimal service environments from the user account", () => {
  const env: NodeJS.ProcessEnv = {};

  hydratePosixHome(env);

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("hydrates HOME independently of a blank process HOME", () => {
  const originalHome = process.env.HOME;
  const env: NodeJS.ProcessEnv = { HOME: " " };

  try {
    process.env.HOME = " ";
    hydratePosixHome(env);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("preserves an explicitly configured HOME", () => {
  const env: NodeJS.ProcessEnv = { HOME: "/custom/home" };

  hydratePosixHome(env, () => {
    throw new Error("HOME lookup should not run");
  });

  assert.equal(env.HOME, "/custom/home");
});

// Marcode's base directory is `~/.marcode`, not upstream's `~/.t3`. Upstream
// owns `resolveBaseDir` and its fixtures assume their own name, so a sync can
// revert this without producing a conflict. Pin it here: every caller that
// falls back to the default home (`t3 app`, `pair`, `triage`, `theme`, config)
// resolves a different state directory the moment this changes.
effectIt.effect("defaults the base directory to the Marcode home", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const resolved = yield* resolveBaseDir(undefined);

    assert.equal(resolved, path.join(NodeOS.homedir(), ".marcode"));
  }).pipe(Effect.provide(NodeServices.layer)),
);

effectIt.effect("resolves a blank base directory to the Marcode home", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const resolved = yield* resolveBaseDir("   ");

    assert.equal(resolved, path.join(NodeOS.homedir(), ".marcode"));
  }).pipe(Effect.provide(NodeServices.layer)),
);
