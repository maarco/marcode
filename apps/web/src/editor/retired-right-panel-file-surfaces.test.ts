// @effect-diagnostics nodeBuiltinImport:off - Regression coverage asserts retired modules are absent from the source tree.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

/**
 * Marcode retired upstream's right-panel file surfaces: the floating Code
 * editor is the only file-editing surface (see `editor-surface.ts` and
 * `open-floating-file.ts`), and `rightPanelStore` no longer carries the
 * `"file"` / `"files"` kinds.
 *
 * A deletion is invisible to a merge. Upstream keeps shipping these modules and
 * keeps adding new ones beside them, so each sync re-adds them silently unless
 * something asserts they are gone. The b883fc06 sync is the worked example:
 * upstream's expand/collapse-all control (#8889) arrived as a brand-new
 * `fileTreeExpansion` module under a panel Marcode does not render, and merged
 * without a conflict.
 *
 * When this fails after an upstream sync, decide deliberately: either drop the
 * file again, or port the behavior into the floating editor and remove its
 * entry here.
 */
const RETIRED = [
  "../components/files/FileBrowserPanel.tsx",
  "../components/files/FilePreviewPanel.tsx",
  "../components/files/fileTreeExpansion.ts",
  "../components/files/fileTreeExpansion.test.ts",
] as const;

describe("retired right-panel file surfaces", () => {
  it.each(RETIRED)("does not ship %s", (relativePath) => {
    expect(NodeFS.existsSync(new URL(relativePath, import.meta.url))).toBe(false);
  });
});
