import * as NodeFS from "node:fs";
import * as NodeEvents from "node:events";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeVM from "node:vm";

import { assert, describe, it } from "vite-plus/test";

import {
  makeDevelopmentEnvironmentScript,
  makeDevelopmentLauncherScript,
  resolveElectronBinaryPath,
  resolveMacBundleInfoPlistStrings,
  resolveMacCodeSignArguments,
  resolveMacLauncherPaths,
  writeDevelopmentLauncherScript,
} from "./electron-launcher.mjs";

describe("electron development launcher", () => {
  it("uses Marcode environment names and PID-scoped dev cleanup", () => {
    const devElectron = NodeFS.readFileSync(new URL("./dev-electron.mjs", import.meta.url), "utf8");

    assert.include(devElectron, "MARCODE_DESKTOP_REMOTE_DEBUGGING_PORT");
    assert.include(devElectron, "MARCODE_DESKTOP_APP_USER_MODEL_ID");
    assert.notInclude(devElectron, "T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT");
    assert.notInclude(devElectron, "T3CODE_DESKTOP_APP_USER_MODEL_ID");
    assert.notInclude(devElectron, "T3CODE_DESKTOP_PROTOCOL_REGISTRATION_MANAGED");
    assert.notInclude(devElectron, 'spawnSync("pkill", ["-f"');
    assert.include(devElectron, "dev-electron.pid");
  });

  it("uses captured values only as fallbacks for a live runner environment", () => {
    const environmentScript = makeDevelopmentEnvironmentScript({
      VITE_DEV_SERVER_URL: "http://127.0.0.1:8526",
      T3CODE_PORT: "16566",
      T3CODE_HOME: "/tmp/t3",
      MARCODE_OTLP_PROTOCOL: "http/protobuf",
    });

    assert.include(
      environmentScript,
      "if [ -z \"${VITE_DEV_SERVER_URL:-}\" ]; then export VITE_DEV_SERVER_URL='http://127.0.0.1:8526'; fi",
    );
    assert.include(
      environmentScript,
      "if [ -z \"${MARCODE_OTLP_PROTOCOL:-}\" ]; then export MARCODE_OTLP_PROTOCOL='http/protobuf'; fi",
    );
    assert.notInclude(environmentScript, "\nexport VITE_DEV_SERVER_URL=");
  });

  it("keeps the launcher script free of volatile environment values", () => {
    const script = makeDevelopmentLauncherScript({
      electronBinaryPath: "/repo/node_modules/electron/Electron",
      mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      environmentFilePath: "/repo/apps/desktop/.electron-runtime/dev-environment.sh",
    });

    assert.include(
      script,
      "if [ -f '/repo/apps/desktop/.electron-runtime/dev-environment.sh' ]; then . '/repo/apps/desktop/.electron-runtime/dev-environment.sh'; fi",
    );
    assert.notInclude(script, "VITE_DEV_SERVER_URL");
    assert.include(
      script,
      "exec '/repo/node_modules/electron/Electron' --t3code-dev-root='/repo/apps/desktop' '/repo/apps/desktop/dist-electron/main.cjs' \"$@\"",
    );
  });

  it("repairs Electron before loading the package entrypoint", () => {
    const calls = [];
    const electronPath = resolveElectronBinaryPath({
      ensureRuntime: () => {
        calls.push("ensure");
      },
      createRequire: () => (specifier) => {
        calls.push(`require:${specifier}`);
        return "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron";
      },
      moduleUrl: import.meta.url,
    });

    assert.equal(
      electronPath,
      "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
    assert.deepEqual(calls, ["ensure", "require:electron"]);
  });

  it("keeps the native Electron executable name inside the branded macOS bundle", () => {
    const paths = resolveMacLauncherPaths(
      "/repo/apps/desktop/.electron-runtime/T3 Code (Dev).app",
      "T3 Code (Dev)",
    );

    assert.equal(paths.launcherExecutableName, "T3 Code (Dev) Launcher");
    assert.equal(
      paths.launcherBinaryPath,
      "/repo/apps/desktop/.electron-runtime/T3 Code (Dev).app/Contents/MacOS/T3 Code (Dev) Launcher",
    );
    assert.equal(
      paths.runtimeElectronBinaryPath,
      "/repo/apps/desktop/.electron-runtime/T3 Code (Dev).app/Contents/MacOS/Electron",
    );

    const script = makeDevelopmentLauncherScript({
      electronBinaryPath: paths.runtimeElectronBinaryPath,
      mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      environmentFilePath: "/repo/apps/desktop/.electron-runtime/dev-environment.sh",
    });
    assert.include(
      script,
      "exec '/repo/apps/desktop/.electron-runtime/T3 Code (Dev).app/Contents/MacOS/Electron'",
    );
    assert.notInclude(script, "node_modules/electron");
  });

  it("declares why the macOS app needs protected access", () => {
    const values = resolveMacBundleInfoPlistStrings("T3 Code (Dev) Launcher");

    assert.equal(
      values.NSScreenCaptureUsageDescription,
      "Marcode captures the active window when you use the snapshot shortcut.",
    );
    assert.equal(
      values.NSDocumentsFolderUsageDescription,
      "Marcode reads project files you open in the desktop app.",
    );
  });

  it("ad-hoc signs the complete development app bundle", () => {
    assert.deepEqual(resolveMacCodeSignArguments("/runtime/T3 Code (Dev).app"), [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--timestamp=none",
      "/runtime/T3 Code (Dev).app",
    ]);
  });

  it("restores execute permissions on an unchanged launcher", () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-launcher-"));
    const launcherPath = NodePath.join(directory, "launcher");
    try {
      writeDevelopmentLauncherScript(launcherPath, "/runtime/Electron");
      NodeFS.chmodSync(launcherPath, 0o644);

      assert.isFalse(writeDevelopmentLauncherScript(launcherPath, "/runtime/Electron"));
      assert.equal(NodeFS.statSync(launcherPath).mode & 0o777, 0o755);
    } finally {
      NodeFS.rmSync(directory, { recursive: true, force: true });
    }
  });
});

// Runs the real dev-electron.mjs startup with inert imports and reports which pids it signalled.
async function runDevCleanup({ desktopDir, recordedPid, psCommand }) {
  const source = NodeFS.readFileSync(new URL("./dev-electron.mjs", import.meta.url), "utf8");
  const signalled = [];
  const pkillCalls = [];
  await NodeVM.runInNewContext(
    `(async () => { ${source.replace(/^import\s[\s\S]*?;\n/gm, "")} })()`,
    {
      NodeChildProcess: {
        execFileSync: () => undefined,
        spawnSync: (command, args) => {
          if (command === "ps") {
            return psCommand === null
              ? { status: 1, stdout: "" }
              : { status: 0, stdout: `${psCommand}\n` };
          }
          pkillCalls.push([command, ...args]);
          return { status: 0, stdout: "" };
        },
        spawn: () => new NodeEvents.EventEmitter(),
      },
      NodeFS: {
        readFileSync: () => `${recordedPid}\n`,
        unlinkSync: () => undefined,
        mkdirSync: () => undefined,
        writeFileSync: () => undefined,
        watch: () => ({ close: () => undefined }),
      },
      NodeOS: { platform: () => "linux" },
      NodePath,
      desktopDir,
      resolveDevProtocolClient: () => null,
      resolveElectronLaunchCommand: (args) => ({ electronPath: "electron", args }),
      waitForResources: async () => undefined,
      URL,
      setTimeout,
      process: {
        pid: 1,
        env: { VITE_DEV_SERVER_URL: "http://localhost:1234" },
        execPath: "node",
        once: () => undefined,
        kill: (pid, signal) => signalled.push([pid, signal]),
      },
    },
  );
  return { signalled, pkillCalls };
}

describe("dev cleanup of a recorded Marcode dev app", () => {
  const desktopDir = "/tmp/marcode-feature.one/apps/desktop";
  const flag = `--t3code-dev-root=${desktopDir}`;

  it.each([
    ["the root flag", `/x/Electron ${flag} ${desktopDir}/dist-electron/main.cjs`],
    ["the main entry", `/x/Electron ${desktopDir}/dist-electron/main.cjs`],
  ])("signals the recorded pid when it runs this desktopDir via %s", async (_name, psCommand) => {
    const { signalled } = await runDevCleanup({ desktopDir, recordedPid: 4242, psCommand });
    assert.deepEqual(signalled, [[4242, "SIGTERM"]]);
  });

  it.each([
    ["an unrelated process", "/usr/bin/python3 server.py"],
    ["a gone process", null],
    ["a root with a suffix", `/x/Electron ${flag}-two main.cjs`],
    ["a root with a prefix", `/x/Electron prefix${flag}`],
    ["a root under another directory", `/x/Electron --t3code-dev-root=/other${desktopDir}`],
    ["another checkout's main entry", `/x/Electron /other${desktopDir}/dist-electron/main.cjs`],
  ])("never signals the recorded pid for %s", async (_name, psCommand) => {
    const { signalled, pkillCalls } = await runDevCleanup({
      desktopDir,
      recordedPid: 4242,
      psCommand,
    });
    assert.deepEqual(signalled, []);
    assert.deepEqual(pkillCalls, []);
  });
});
