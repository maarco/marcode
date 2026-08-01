import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  HostProcessArguments,
  HostProcessExecutablePath,
  HostProcessPlatform,
} from "@t3tools/shared/hostProcess";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as ProcessRunner from "../processRunner.ts";
import * as BootService from "./bootService.ts";
import { pinnedRuntimePaths } from "./pinnedRuntime.ts";
import { parseServiceState } from "./serviceProtocol.ts";

it("keeps systemd pinned to the stable launcher rather than a versioned server", () => {
  const unit = BootService.renderBootServiceUnit({
    nodePath: "/usr/bin/node",
    launcherPath: "/home/theo/.marcode/runtime/service-launcher.mjs",
    baseDir: "/home/theo/.marcode",
    logPath: "/home/theo/.marcode/userdata/logs/boot-service.log",
    unitPath: "/home/theo/.config/systemd/user/marcode.service",
  });

  expect(unit).toContain(
    "ExecStart=/usr/bin/node /home/theo/.marcode/runtime/service-launcher.mjs",
  );
  expect(unit).toContain("KillMode=control-group");
  expect(unit).not.toContain("versions/1.2.3");
});

// Marcode's boot service is a distinct per-user unit from an upstream T3 Code
// install. This pins the three identifiers that carry that split so an upstream
// rewrite of the unit renderer conflicts here instead of silently rebranding a
// service users already have installed.
it("installs under Marcode's own service identity", () => {
  const unit = BootService.renderBootServiceUnit({
    nodePath: "/usr/bin/node",
    launcherPath: "/home/theo/.marcode/runtime/service-launcher.mjs",
    baseDir: "/home/theo/.marcode",
    logPath: "/home/theo/.marcode/userdata/logs/boot-service.log",
    unitPath: "/home/theo/.config/systemd/user/marcode.service",
  });

  expect(BootService.BOOT_SERVICE_UNIT_FILE).toBe("marcode.service");
  expect(unit).toContain("Description=Marcode server");
  expect(unit).toContain("Environment=MARCODE_HOME=/home/theo/.marcode");
  // The env var *name* stays upstream-shaped on purpose: it is a compatibility
  // identifier read by installed units, not user-visible branding.
  expect(unit).toContain(`Environment=${BootService.BOOT_SERVICE_UNIT_ENV}=marcode.service`);
  expect(BootService.BOOT_SERVICE_UNIT_ENV).toBe("T3_BOOT_SERVICE_UNIT");
});

const makeHarness = Effect.fn("test.make_boot_service_harness")(function* (
  platform: NodeJS.Platform = "linux",
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-boot-service-test-" });
  const baseDir = path.join(home, ".marcode");
  const sourceLauncher = path.join(home, "service-launcher.mjs");
  const statePath = path.join(baseDir, "runtime", "service-state.json");
  yield* fs.writeFileString(sourceLauncher, "export {};\n");
  const runtime = pinnedRuntimePaths(path, baseDir, "1.2.3");
  yield* fs.makeDirectory(path.dirname(runtime.entryPath), { recursive: true });
  yield* fs.writeFileString(runtime.entryPath, "export {};\n");
  yield* fs.writeFileString(runtime.sentinelPath, "1.2.3\n");

  const commands: string[] = [];
  const control: { failCommand: string | undefined } = { failCommand: undefined };
  const runner = ProcessRunner.ProcessRunner.of({
    run: (input) =>
      Effect.sync(() => {
        const command = `${input.command} ${input.args.join(" ")}`;
        commands.push(command);
        return {
          stdout: input.args[1] === "--version" ? "t3 v1.2.3\n" : "",
          stderr: "",
          code: ChildProcessSpawner.ExitCode(command === control.failCommand ? 1 : 0),
          timedOut: false,
          stdoutTruncated: false,
          stderrTruncated: false,
        };
      }),
  });
  const service = yield* BootService.make({
    baseDir,
    logsDir: path.join(baseDir, "userdata", "logs"),
    cliVersion: "1.2.3",
    host: {
      execPath: "/usr/bin/node",
      cliEntryPath: path.join(home, "bin.mjs"),
      launcherSourcePath: sourceLauncher,
    },
  }).pipe(
    Effect.provideService(ProcessRunner.ProcessRunner, runner),
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(HostProcessPlatform, platform),
        Layer.succeed(HostProcessExecutablePath, "/usr/bin/node"),
        Layer.succeed(HostProcessArguments, ["/usr/bin/node", path.join(home, "bin.mjs")]),
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { HOME: home } })),
      ),
    ),
  );
  return { service, fs, statePath, commands, control };
});

it.layer(NodeServices.layer)("boot service install", (it) => {
  it.effect("installs, reports current state, and uninstalls", () =>
    Effect.gen(function* () {
      const { service, fs, statePath, commands } = yield* makeHarness();
      const plan = yield* service.install;

      expect(parseServiceState(yield* fs.readFileString(statePath))).toEqual({
        protocol: 1,
        activeVersion: "1.2.3",
      });
      expect(yield* fs.readFileString(plan.launcherPath)).toBe("export {};\n");
      expect((yield* service.status).current).toBe(true);
      yield* fs.writeFileString(
        statePath,
        '{"protocol":1,"activeVersion":"1.2.3","update":{"id":"u","fromVersion":"1.2.3","targetVersion":"1.2.4","status":"pending"}}',
      );
      expect((yield* service.status).current).toBe(false);
      expect(yield* service.uninstall).toBe(true);
      expect((yield* service.status).installed).toBe(false);
      expect(commands.some((command) => command.startsWith("npm "))).toBe(false);
    }),
  );

  it.effect("restarts an installed service when repair fails", () =>
    Effect.gen(function* () {
      const { service, commands, control } = yield* makeHarness();
      yield* service.install;
      commands.length = 0;
      control.failCommand = "systemctl --user daemon-reload";

      const error = yield* service.install.pipe(Effect.flip);
      expect(error._tag).toBe("BootServiceCommandError");
      expect(commands.filter((command) => command.startsWith("systemctl "))).toEqual([
        "systemctl --user stop marcode.service",
        "systemctl --user daemon-reload",
        "systemctl --user restart marcode.service",
      ]);
    }),
  );

  it.effect("fails closed off Linux", () =>
    Effect.gen(function* () {
      const { service } = yield* makeHarness("darwin");
      expect((yield* service.status).supported).toBe(false);
      expect((yield* service.install.pipe(Effect.flip))._tag).toBe("BootServiceUnsupportedError");
    }),
  );
});
