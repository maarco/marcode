import type { ScopedThreadRef } from "@t3tools/contracts";

import { openFileInFloatingEditor } from "./editor/open-floating-file";
import { resolvePathLinkTarget } from "./terminal-links";

interface OpenDiffFilePrimaryActionInput {
  readonly threadRef: ScopedThreadRef | null;
  readonly filePath: string;
  readonly activeCwd: string | undefined;
  readonly openInEditor: (targetPath: string) => void;
}

// Opens the diff's *working* file in the floating editor — the same thing
// the right panel used to open. This is deliberately not `openDiffFile`
// (editor-store.ts): that renders a diff view, a different feature.
//
// `filePath` comes from `resolveFileDiffPath` (lib/diffRendering.ts), which
// reads `FileDiffMetadata.name`/`prevName` — a patch-header path from
// `@pierre/diffs`. Unlike terminal-link text, a unified-diff filename has no
// `:line:col` suffix convention (position lives in hunk headers), so it
// cannot collide with `resolvePathLinkTarget`'s line-suffix encoding and
// needs no splitting before reaching the bridge.
export function openDiffFilePrimaryAction({
  threadRef,
  filePath,
  activeCwd,
  openInEditor,
}: OpenDiffFilePrimaryActionInput): void {
  if (threadRef && activeCwd) {
    openFileInFloatingEditor({
      environmentId: threadRef.environmentId,
      workspacePath: activeCwd,
      relativePath: filePath,
    });
    return;
  }

  openInEditor(activeCwd ? resolvePathLinkTarget(filePath, activeCwd) : filePath);
}
