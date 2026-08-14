// @effect-diagnostics nodeBuiltinImport:off - Static fork assertions read checked-in files directly.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

/**
 * `.agents/skills/test-t3-mobile/scripts/pair-client.sh` is upstream-owned: T3
 * Code ships it and rewrites it. Every identity it touches is one Marcode
 * renamed, and none of them conflict on merge — upstream replaces the whole
 * file, git takes it, and mobile pairing silently stops working:
 *
 *   - the server reads `MARCODE_PORT` (`apps/server/src/cli/config.ts`), so
 *     upstream's `T3CODE_PORT` is ignored and the helper pairs against the
 *     wrong port;
 *   - the dev variant registers the `marcode-dev` scheme and the
 *     `com.t3tools.marcode.dev` Android package (`apps/mobile/app.config.ts`),
 *     so upstream's `t3code-dev` deep link resolves to nothing.
 *
 * Bundle ids stay under the upstream-owned `com.t3tools.` namespace on purpose;
 * only the product segment is Marcode's.
 */

const repoRoot = NodePath.dirname(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(repoRoot, relativePath), "utf8");
}

const helperSource = read(".agents/skills/test-t3-mobile/scripts/pair-client.sh");
const mobileAppConfigSource = read("apps/mobile/app.config.ts");
const serverConfigSource = read("apps/server/src/cli/config.ts");

describe("mobile pairing helper fork identity", () => {
  it("mints the credential with the port variable the server actually reads", () => {
    expect(serverConfigSource).toContain('Config.port("MARCODE_PORT")');
    expect(helperSource).toContain('MARCODE_PORT="$server_port"');
    expect(helperSource).not.toContain("T3CODE_PORT");
  });

  it("defaults to the URL scheme the development build registers", () => {
    expect(mobileAppConfigSource).toContain('scheme: "marcode-dev"');
    expect(helperSource).toContain('url_scheme="${5:-marcode-dev}"');
    expect(helperSource).not.toContain("t3code-dev");
  });

  it("opens the Android package the development build installs", () => {
    expect(mobileAppConfigSource).toContain('androidPackage: "com.t3tools.marcode.dev"');
    expect(helperSource).toContain("com.t3tools.marcode.dev");
    expect(helperSource).not.toContain("com.t3tools.t3code");
  });
});
