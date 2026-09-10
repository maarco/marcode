// @effect-diagnostics nodeBuiltinImport:off - Reads the checked-in GNOME extension source.
import * as NodeFS from "node:fs";
import { expect, it } from "vite-plus/test";

/**
 * Marcode fork seam.
 *
 * The GNOME extension only answers D-Bus callers whose well-known name is in
 * its own `CLIENT_NAMES` allowlist, and the Linux client requests
 * `${linuxDesktopEntryName without .desktop}.SnapShot`. Upstream ships that
 * allowlist spelled with their desktop-entry identity, so a sync can replace it
 * without producing a conflict — and every Marcode capture request is then
 * refused with "Only Marcode may request a snapshot", at runtime, on Linux
 * only. Pin both halves against the entry names Marcode actually ships.
 *
 * The allowlist is read as source text rather than imported: the extension is
 * plain GJS JavaScript with no type declarations.
 */
const read = (relativePath: string) =>
  NodeFS.readFileSync(new URL(relativePath, import.meta.url), "utf8");

const MARCODE_DESKTOP_ENTRY_NAMES = ["marcode.desktop", "marcode-dev.desktop"] as const;

it("allows exactly the bus names Marcode's desktop entries produce", () => {
  const source = read("../../gnome-extension/captureService.js");
  const declaration = /export const CLIENT_NAMES = \[(?<names>[^\]]*)\]/s.exec(source);
  expect(declaration?.groups?.names).toBeDefined();

  const allowlist = [...declaration!.groups!.names!.matchAll(/"([^"]+)"/g)].map(([, name]) => name);
  const expected = MARCODE_DESKTOP_ENTRY_NAMES.map(
    (entry) => `${entry.replace(/\.desktop$/, "")}.SnapShot`,
  );

  expect([...allowlist].sort()).toEqual([...expected].sort());
});

it("derives the requested bus name the same way the Linux client does", () => {
  // DesktopSnapShot builds the app id from the desktop entry name...
  expect(read("./DesktopSnapShot.ts")).toContain(
    'environment.linuxDesktopEntryName.replace(/\\.desktop$/, "")',
  );
  // ...and LinuxSnapShot requests that id suffixed with .SnapShot.
  expect(read("./LinuxSnapShot.ts")).toContain("${appId}.SnapShot");
});
