import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { assert } from "vite-plus/test";

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

// ── Marcode fork seam ──
// Marcode renamed the default data directory from upstream's `~/.t3` to
// `~/.marcode`. Nothing upstream owns pins that default, so an upstream change
// that reintroduces `.t3` merges without a conflict and only shows up as a CLI
// that dials a socket no desktop app is listening on. Pin it at the resolver so
// the next sync fails here instead.
it.effect("resolves the default base directory to the Marcode home", () =>
  Effect.gen(function* () {
    const baseDir = yield* resolveBaseDir(undefined);

    assert.equal(baseDir, NodePath.join(NodeOS.homedir(), ".marcode"));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("resolves a blank base directory to the Marcode home", () =>
  Effect.gen(function* () {
    const baseDir = yield* resolveBaseDir("   ");

    assert.equal(baseDir, NodePath.join(NodeOS.homedir(), ".marcode"));
  }).pipe(Effect.provide(NodeServices.layer)),
);
