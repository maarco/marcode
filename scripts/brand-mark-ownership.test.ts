// @effect-diagnostics nodeBuiltinImport:off - Fork-boundary assertions read checked-in files directly.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.dirname(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)));

/**
 * Marcode renamed upstream's T3 wordmark component to `MarcodeMark` on web and
 * on mobile. A rename is invisible to a merge: upstream keeps shipping their
 * component and keeps pointing new call sites at it, so a sync re-adds the file
 * and repoints the icons without ever raising a conflict. The fff33f9e sync did
 * exactly that — it restored the web component silently and left mobile
 * importing a path this fork does not have. Assert the removal so the next sync
 * fails here instead of in a CI typecheck or, worse, in the rendered UI.
 *
 * Assembled at runtime so this file does not match its own assertion.
 */
const forbiddenComponent = `T3${"Wordmark"}`;

const sourceRoots = ["apps/web/src", "apps/mobile/src", "apps/desktop/src"];

function collectSourceFiles(directory: string): ReadonlyArray<string> {
  const files: Array<string> = [];
  for (const entry of NodeFS.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(entryPath);
    }
  }
  return files;
}

describe("brand mark ownership", () => {
  it("ships no upstream wordmark component and no references to one", () => {
    const offenders: Array<string> = [];

    for (const root of sourceRoots) {
      for (const file of collectSourceFiles(NodePath.join(repoRoot, root))) {
        const relativePath = NodePath.relative(repoRoot, file);
        if (NodePath.basename(file).startsWith(forbiddenComponent)) {
          offenders.push(`${relativePath} (component file)`);
          continue;
        }
        if (NodeFS.readFileSync(file, "utf8").includes(forbiddenComponent)) {
          offenders.push(`${relativePath} (reference)`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("renders the Marcode mark for the t3-code tool server on web and mobile", () => {
    // The `t3-code` tool-server name is an upstream-shaped compatibility
    // identifier and stays as it is; only the icon beside it is Marcode's.
    const webTimeline = NodeFS.readFileSync(
      NodePath.join(repoRoot, "apps/web/src/components/chat/MessagesTimeline.tsx"),
      "utf8",
    );
    const mobileWorkLog = NodeFS.readFileSync(
      NodePath.join(repoRoot, "apps/mobile/src/features/threads/thread-work-log.tsx"),
      "utf8",
    );

    expect(webTimeline).toContain('case "t3-code":');
    expect(webTimeline).toContain("<MarcodeMark className={className} />");
    expect(mobileWorkLog).toContain('props.icon === "t3-code"');
    expect(mobileWorkLog).toContain("<MarcodeMark height={14} />");
  });
});
