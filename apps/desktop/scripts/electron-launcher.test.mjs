import * as NodeFS from "node:fs";

import { assert, describe, it } from "vite-plus/test";

import {
  makeDevelopmentLauncherScript,
  resolveElectronBinaryPath,
  resolveMacLauncherIconPaths,
  resolveMacLauncherPaths,
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
    const script = makeDevelopmentLauncherScript({
      electronBinaryPath: "/repo/node_modules/electron/Electron",
      mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      environment: {
        VITE_DEV_SERVER_URL: "http://127.0.0.1:8526",
        MARCODE_PORT: "16566",
        MARCODE_HOME: "/tmp/marcode",
      },
    });

    assert.include(
      script,
      "if [ -z \"${VITE_DEV_SERVER_URL:-}\" ]; then export VITE_DEV_SERVER_URL='http://127.0.0.1:8526'; fi",
    );
    assert.notInclude(script, "\nexport VITE_DEV_SERVER_URL=");
    assert.include(script, "if [ -z \"${MARCODE_PORT:-}\" ]; then export MARCODE_PORT='16566'; fi");
    assert.include(
      script,
      "if [ -z \"${MARCODE_HOME:-}\" ]; then export MARCODE_HOME='/tmp/marcode'; fi",
    );
    assert.notInclude(script, "T3CODE_PORT");
    assert.notInclude(script, "T3CODE_HOME");
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
      environment: {},
    });
    assert.include(
      script,
      "exec '/repo/apps/desktop/.electron-runtime/T3 Code (Dev).app/Contents/MacOS/Electron'",
    );
    assert.notInclude(script, "node_modules/electron");
  });

  it("derives launcher icons from canonical development and production assets", () => {
    const development = resolveMacLauncherIconPaths("/runtime", true);
    const production = resolveMacLauncherIconPaths("/runtime", false);

    assert.match(development.sourceIconPath, /assets\/dev\/blueprint-macos-1024\.png$/);
    assert.equal(development.generatedIconPath, "/runtime/icon-dev.icns");
    assert.match(production.sourceIconPath, /assets\/prod\/black-macos-1024\.png$/);
    assert.equal(production.generatedIconPath, "/runtime/icon-prod.icns");
  });
});
