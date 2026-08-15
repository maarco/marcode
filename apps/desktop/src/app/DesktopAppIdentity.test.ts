import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as TestClock from "effect/testing/TestClock";

import type * as Electron from "electron";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopAppIdentity from "./DesktopAppIdentity.ts";
import * as DesktopAssets from "./DesktopAssets.ts";
import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const defaultEnvironmentInput = {
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "darwin",
  processArch: "arm64",
  appVersion: "1.2.3",
  appPath: "/Applications/T3 Code.app/Contents/Resources/app.asar",
  isPackaged: true,
  resourcesPath: "/Applications/T3 Code.app/Contents/Resources",
  runningUnderArm64Translation: false,
} satisfies DesktopEnvironment.MakeDesktopEnvironmentInput;

type TestEnvironmentInput = Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> & {
  readonly env?: Record<string, string | undefined>;
};

interface ElectronAppCalls {
  readonly setAboutPanelOptions: Array<Electron.AboutPanelOptionsOptions>;
  readonly setDockIcon: string[];
  readonly setName: string[];
}

const makeElectronAppLayer = (calls: ElectronAppCalls) =>
  Layer.succeed(ElectronApp.ElectronApp, {
    metadata: Effect.die("unexpected metadata read"),
    name: Effect.succeed("T3 Code"),
    systemLocale: Effect.succeed("en-US"),
    whenReady: Effect.void,
    quit: Effect.void,
    exit: () => Effect.void,
    relaunch: () => Effect.void,
    setPath: () => Effect.void,
    setName: (name) =>
      Effect.sync(() => {
        calls.setName.push(name);
      }),
    setAboutPanelOptions: (options) =>
      Effect.sync(() => {
        calls.setAboutPanelOptions.push(options);
      }),
    setAppUserModelId: () => Effect.void,
    getAppMetrics: Effect.succeed([]),
    isDefaultProtocolClient: () => Effect.succeed(false),
    setAsDefaultProtocolClient: () => Effect.succeed(true),
    setDesktopName: () => Effect.void,
    setDockIcon: (iconPath) =>
      Effect.sync(() => {
        calls.setDockIcon.push(iconPath);
      }),
    appendCommandLineSwitch: () => Effect.void,
    onBeforeQuitForUpdate: () => Effect.void,
    removeCommandLineSwitch: () => Effect.void,
    on: () => Effect.void,
  } satisfies ElectronApp.ElectronApp["Service"]);

const makeAssetsLayer = (png: Option.Option<string>) =>
  Layer.succeed(DesktopAssets.DesktopAssets, {
    iconPaths: Effect.succeed({
      ico: Option.none(),
      icns: Option.none(),
      png,
    }),
    resolveResourcePath: () => Effect.succeed(Option.none()),
  } satisfies DesktopAssets.DesktopAssets["Service"]);

const makeEnvironmentLayer = (overrides: TestEnvironmentInput = {}) => {
  const { env, ...environmentOverrides } = overrides;
  return DesktopEnvironment.layer({
    ...defaultEnvironmentInput,
    ...environmentOverrides,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(
        NodeServices.layer,
        DesktopConfig.layerTest({
          ...env,
        }),
      ),
    ),
  );
};

const withIdentity = <A, E, R>(
  effect: Effect.Effect<
    A,
    E,
    | R
    | DesktopAppIdentity.DesktopAppIdentity
    | DesktopEnvironment.DesktopEnvironment
    | FileSystem.FileSystem
  >,
  input: {
    readonly calls?: ElectronAppCalls;
    readonly environment?: TestEnvironmentInput;
    readonly existsOverride?: (path: string) => Effect.Effect<boolean, PlatformError.PlatformError>;
    readonly legacyPathExists?: boolean;
    readonly legacyPathMatch?: string;
    readonly legacyPathProbeError?: PlatformError.PlatformError;
    readonly packageJson?: string;
    readonly pngIconPath?: Option.Option<string>;
  } = {},
) => {
  const calls: ElectronAppCalls = input.calls ?? {
    setAboutPanelOptions: [],
    setDockIcon: [],
    setName: [],
  };

  return effect.pipe(
    Effect.provide(
      DesktopAppIdentity.layer.pipe(
        Layer.provideMerge(
          FileSystem.layerNoop({
            exists:
              input.existsOverride ??
              ((path) =>
                input.legacyPathProbeError
                  ? Effect.fail(input.legacyPathProbeError)
                  : Effect.succeed(
                      input.legacyPathExists === true &&
                        path.includes(input.legacyPathMatch ?? "T3 Code (Alpha)"),
                    )),
            readFileString: () =>
              Effect.succeed(input.packageJson ?? '{"marcodeCommitHash":"abcdef1234567890"}'),
          }),
        ),
        Layer.provideMerge(makeAssetsLayer(input.pngIconPath ?? Option.none())),
        Layer.provideMerge(makeElectronAppLayer(calls)),
        Layer.provideMerge(makeEnvironmentLayer(input.environment)),
      ),
    ),
  );
};

describe("DesktopAppIdentity", () => {
  it.effect("keeps using the legacy T3 Code userData path when it already exists", () =>
    withIdentity(
      Effect.gen(function* () {
        const identity = yield* DesktopAppIdentity.DesktopAppIdentity;
        const userDataPath = yield* identity.resolveUserDataPath;

        assert.equal(userDataPath, "/Users/alice/Library/Application Support/T3 Code (Alpha)");
      }),
      { legacyPathExists: true },
    ),
  );

  // Covers the userData migration for users who installed before the
  // "(Alpha)" suffix was dropped from the product name: their state must
  // keep resolving to the old "Marcode (Alpha)" directory, not get orphaned
  // by a fresh "marcode" directory.
  it.effect("keeps using the legacy Marcode (Alpha) userData path when it already exists", () =>
    withIdentity(
      Effect.gen(function* () {
        const identity = yield* DesktopAppIdentity.DesktopAppIdentity;
        const userDataPath = yield* identity.resolveUserDataPath;

        assert.equal(userDataPath, "/Users/alice/Library/Application Support/Marcode (Alpha)");
      }),
      { legacyPathExists: true, legacyPathMatch: "Marcode (Alpha)" },
    ),
  );

  // The concurrent rewrite checks every legacy candidate at once instead of
  // stopping at the first match, so priority order has to come from the
  // candidate list's order (oldest first), not from whichever filesystem
  // check happens to settle first. Cover an install with both legacy
  // directories present: the older "T3 Code (Alpha)" must still win.
  it.effect("prefers the oldest legacy userData path when multiple legacy paths exist", () =>
    withIdentity(
      Effect.gen(function* () {
        const identity = yield* DesktopAppIdentity.DesktopAppIdentity;
        const userDataPath = yield* identity.resolveUserDataPath;

        assert.equal(userDataPath, "/Users/alice/Library/Application Support/T3 Code (Alpha)");
      }),
      {
        existsOverride: (path) =>
          Effect.succeed(path.includes("T3 Code (Alpha)") || path.includes("Marcode (Alpha)")),
      },
    ),
  );

  // Regression test for a real startup crash: resolveUserDataPath runs
  // before DesktopClerk creates the Clerk bridge, which synchronously calls
  // Electron's protocol.registerSchemesAsPrivileged — an API that must run
  // before Electron's "ready" event fires. A version of this function that
  // checked legacy names one at a time (sequentially) added enough extra
  // wall-clock latency on a real filesystem for "ready" to fire first,
  // crashing the packaged app on launch even though every unit test (all
  // running against a mocked, effectively-instant filesystem) stayed green.
  //
  // Prove the checks run concurrently on the (virtual) clock: give every
  // legacy candidate the same 10ms probe latency, then advance the clock by
  // exactly one probe's worth of time. Concurrent probing settles both
  // candidates in that single tick; a sequential loop would still be
  // awaiting the second candidate's own 10ms turn, so the fiber would still
  // be pending — pollUnsafe() catches that without risking a hang, since
  // (unlike Fiber.join) it never waits.
  it.effect("probes legacy userData paths concurrently, not one at a time", () =>
    withIdentity(
      Effect.gen(function* () {
        const identity = yield* DesktopAppIdentity.DesktopAppIdentity;
        const resolveFiber = yield* identity.resolveUserDataPath.pipe(Effect.forkChild);

        yield* TestClock.adjust(Duration.millis(10));
        assert.isDefined(
          resolveFiber.pollUnsafe(),
          "expected every legacy candidate to be probed in parallel, not queued behind each other",
        );

        const userDataPath = yield* Fiber.join(resolveFiber);
        assert.equal(userDataPath, "/Users/alice/Library/Application Support/Marcode (Alpha)");
      }),
      {
        existsOverride: (path) =>
          Effect.sleep(Duration.millis(10)).pipe(Effect.as(path.includes("Marcode (Alpha)"))),
      },
    ).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("preserves failures while inspecting the legacy userData path", () => {
    const legacyPath = "/Users/alice/Library/Application Support/T3 Code (Alpha)";
    const cause = PlatformError.systemError({
      _tag: "PermissionDenied",
      module: "FileSystem",
      method: "exists",
      description: "permission denied",
      pathOrDescriptor: legacyPath,
    });

    return withIdentity(
      Effect.gen(function* () {
        const identity = yield* DesktopAppIdentity.DesktopAppIdentity;
        const error = yield* identity.resolveUserDataPath.pipe(Effect.flip);

        assert.instanceOf(error, DesktopAppIdentity.DesktopUserDataPathResolutionError);
        assert.equal(error.legacyPath, legacyPath);
        assert.strictEqual(error.cause, cause);
        assert.equal(
          error.message,
          `Failed to inspect legacy desktop user-data path at "${legacyPath}".`,
        );
      }),
      { legacyPathProbeError: cause },
    );
  });

  it.effect("configures app identity from the environment commit override", () => {
    const calls: ElectronAppCalls = {
      setAboutPanelOptions: [],
      setDockIcon: [],
      setName: [],
    };

    return withIdentity(
      Effect.gen(function* () {
        const identity = yield* DesktopAppIdentity.DesktopAppIdentity;
        yield* identity.configure;

        assert.deepEqual(calls.setName, ["Marcode"]);
        assert.equal(calls.setAboutPanelOptions[0]?.applicationName, "Marcode");
        assert.equal(calls.setAboutPanelOptions[0]?.applicationVersion, "1.2.3");
        assert.equal(calls.setAboutPanelOptions[0]?.version, "0123456789ab");
        assert.deepEqual(calls.setDockIcon, ["/icon.png"]);
      }),
      {
        calls,
        environment: {
          env: {
            MARCODE_COMMIT_HASH: "0123456789abcdef",
          },
        },
        pngIconPath: Option.some("/icon.png"),
      },
    );
  });
});
