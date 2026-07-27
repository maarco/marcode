/**
 * Pure decision logic for which surface `EnvFileEditor` (editor-pane.tsx)
 * renders for a given file: a failed read, a truncated read, an image, a
 * rendered markdown preview, a diff, or the normal editable code view.
 *
 * Extracted out of the component so the two P0 guards this exists to close —
 * a failed read silently rendering an empty *editable* buffer, and a
 * truncated read silently autosaving a chopped-off file back to disk — are
 * unit-testable without mounting Monaco or a DOM. See
 * docs/specs/single-editing-surface.md, "Capability gap table" and "Stage 1".
 */

export type EditorSurfaceErrorReason = "binary" | "unscoped-preview" | "server";

export type EditorSurfaceDecision =
  | { readonly kind: "error"; readonly reason: EditorSurfaceErrorReason; readonly message: string }
  | { readonly kind: "truncated"; readonly byteLength: number }
  | { readonly kind: "image" }
  | { readonly kind: "markdown" }
  | { readonly kind: "diff" }
  | { readonly kind: "code" };

export interface EditorSurfaceInput {
  /** The file's relative path matched a known image-preview extension. */
  readonly isImagePath: boolean;
  /**
   * Only consulted when `isImagePath`. False whenever the workspace-file
   * asset cannot be safely resolved — no route thread, or the tab's `cwd`
   * doesn't match that thread's resolved workspace root. See the "critical
   * scoping rule" in the single-editing-surface spec: rendering an image
   * without this check risks silently showing a different worktree's file
   * under the same relative path.
   */
  readonly canPreviewImage: boolean;
  /** `ProjectFileState.error` — an already-formatted message, or null. */
  readonly error: string | null;
  /** `ProjectFileState.contents` — null until content has ever loaded. */
  readonly contents: string | null;
  readonly truncated: boolean;
  readonly byteLength: number;
  readonly isMarkdown: boolean;
  /** Whether the file's markdown edit/preview toggle is in "preview" mode. */
  readonly showMarkdownPreview: boolean;
  readonly isDiff: boolean;
}

const BINARY_FILE_ERROR_MARKER = "is binary and cannot be previewed as text";

/**
 * Heuristic, not a type check: the server's `WorkspaceBinaryFileError`
 * (`apps/server/src/workspace/WorkspaceFileSystem.ts`) message survives the
 * RPC boundary as a plain string with no `_tag` preserved by the time it
 * reaches `useProjectFile` — `projectFilesQueryState.ts`'s `errorMessage()`
 * squashes the cause down to `.message` and discards the tag. Matching the
 * literal wording is the only signal available without changing that shared
 * layer's error shape (out of scope here). If the server's wording ever
 * changes, this just stops recognizing the binary case and falls back to
 * showing the raw server message — never a blank editor.
 */
export function isBinaryFileReadError(message: string): boolean {
  return message.includes(BINARY_FILE_ERROR_MARKER);
}

/**
 * Decide what `EnvFileEditor` should render for a file, in priority order:
 *
 * 1. An image whose asset can't be safely scoped (or a binary/failed read)
 *    always wins — there is no content to safely show as editable text.
 * 2. Truncated wins over markdown/diff too, intentionally: a truncated diff
 *    would compare a full HEAD against a chopped-off working copy (spurious
 *    differences from the cut, not real changes), and a truncated markdown
 *    preview would render as if the file were complete. The banner is
 *    unconditional; toggling to source view still shows the (read-only)
 *    truncated text.
 * 3. Otherwise: markdown preview, then diff, then the normal code editor —
 *    the same relative order the pane already used before Stage 1.
 */
export function resolveEditorSurface(input: EditorSurfaceInput): EditorSurfaceDecision {
  if (input.isImagePath) {
    return input.canPreviewImage
      ? { kind: "image" }
      : {
          kind: "error",
          reason: "unscoped-preview",
          message: "Preview unavailable for this file outside its originating thread.",
        };
  }

  if (input.error !== null && input.contents === null) {
    return isBinaryFileReadError(input.error)
      ? {
          kind: "error",
          reason: "binary",
          message: "This file is binary and can't be displayed as text.",
        }
      : { kind: "error", reason: "server", message: input.error };
  }

  if (input.truncated) {
    return { kind: "truncated", byteLength: input.byteLength };
  }

  if (input.isMarkdown && input.showMarkdownPreview) {
    return { kind: "markdown" };
  }

  if (input.isDiff) {
    return { kind: "diff" };
  }

  return { kind: "code" };
}
