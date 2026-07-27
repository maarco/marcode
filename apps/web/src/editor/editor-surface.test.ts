import { describe, expect, it } from "vite-plus/test";

import {
  isBinaryFileReadError,
  resolveEditorSurface,
  type EditorSurfaceInput,
} from "./editor-surface";

const BASE: EditorSurfaceInput = {
  isImagePath: false,
  canPreviewImage: false,
  error: null,
  contents: "hello",
  truncated: false,
  byteLength: 5,
  isMarkdown: false,
  showMarkdownPreview: false,
  isDiff: false,
};

describe("resolveEditorSurface", () => {
  it("renders the normal editable surface for an ordinary file", () => {
    expect(resolveEditorSurface(BASE)).toEqual({ kind: "code" });
  });

  describe("P0: a failed read never falls back to a blank editable buffer", () => {
    it("returns an error surface when the read failed and no content ever loaded", () => {
      const decision = resolveEditorSurface({
        ...BASE,
        error: "Permission denied",
        contents: null,
      });
      expect(decision).toEqual({ kind: "error", reason: "server", message: "Permission denied" });
    });

    it("gives the server's binary-file rejection its own wording instead of the raw string", () => {
      const decision = resolveEditorSurface({
        ...BASE,
        error: "Workspace file 'logo.png' in '/repo' is binary and cannot be previewed as text.",
        contents: null,
      });
      expect(decision).toEqual({
        kind: "error",
        reason: "binary",
        message: "This file is binary and can't be displayed as text.",
      });
    });

    it("does not treat a refresh error over stale-but-present content as blocking", () => {
      // mirrors FilePreviewPanel's own gate: `file.error && file.data === null`.
      // An error alongside content that already loaded once is not the P0 case
      // (nothing here would render blank, or reach autosave on bad content).
      const decision = resolveEditorSurface({
        ...BASE,
        error: "Network hiccup",
        contents: "still here",
      });
      expect(decision.kind).toBe("code");
    });
  });

  describe("P0: a truncated read is never editable", () => {
    it("returns a truncated surface carrying the real byte length", () => {
      const decision = resolveEditorSurface({ ...BASE, truncated: true, byteLength: 4_194_304 });
      expect(decision).toEqual({ kind: "truncated", byteLength: 4_194_304 });
    });

    it("wins over markdown preview — a truncated .md file still shows the read-only guard", () => {
      const decision = resolveEditorSurface({
        ...BASE,
        truncated: true,
        isMarkdown: true,
        showMarkdownPreview: true,
      });
      expect(decision.kind).toBe("truncated");
    });

    it("wins over the diff view — a truncated diff would compare a full HEAD against a chopped copy", () => {
      const decision = resolveEditorSurface({ ...BASE, truncated: true, isDiff: true });
      expect(decision.kind).toBe("truncated");
    });

    it("wins over a stale error from an earlier failed refresh", () => {
      // truncated is a fact about the successful read that DID happen; an
      // error field left over from an earlier failed refresh must not mask it.
      const decision = resolveEditorSurface({
        ...BASE,
        truncated: true,
        error: "stale refresh error",
        contents: "partial contents",
      });
      expect(decision.kind).toBe("truncated");
    });
  });

  describe("image preview scoping", () => {
    it("renders the image only when the asset can be safely scoped to the route thread", () => {
      expect(resolveEditorSurface({ ...BASE, isImagePath: true, canPreviewImage: true })).toEqual({
        kind: "image",
      });
    });

    it("falls back to a legible message instead of guessing when scoping fails", () => {
      const decision = resolveEditorSurface({ ...BASE, isImagePath: true, canPreviewImage: false });
      expect(decision.kind).toBe("error");
      expect(decision.kind === "error" && decision.reason).toBe("unscoped-preview");
    });

    it("takes priority over an error or truncated flag from a stray text read", () => {
      // useProjectFile is called with enabled:false for images, so these
      // shouldn't normally be set — but image detection must win regardless.
      const decision = resolveEditorSurface({
        ...BASE,
        isImagePath: true,
        canPreviewImage: true,
        error: "is binary and cannot be previewed as text",
        contents: null,
        truncated: true,
      });
      expect(decision.kind).toBe("image");
    });
  });

  describe("markdown / diff / code precedence", () => {
    it("shows rendered markdown only while the preview toggle is on", () => {
      expect(
        resolveEditorSurface({ ...BASE, isMarkdown: true, showMarkdownPreview: true }).kind,
      ).toBe("markdown");
      expect(
        resolveEditorSurface({ ...BASE, isMarkdown: true, showMarkdownPreview: false }).kind,
      ).toBe("code");
    });

    it("shows the diff surface when not markdown-previewing", () => {
      expect(resolveEditorSurface({ ...BASE, isDiff: true }).kind).toBe("diff");
    });

    it("prefers markdown preview over diff, matching the pane's pre-Stage-1 order", () => {
      expect(
        resolveEditorSurface({
          ...BASE,
          isMarkdown: true,
          showMarkdownPreview: true,
          isDiff: true,
        }).kind,
      ).toBe("markdown");
    });
  });
});

describe("isBinaryFileReadError", () => {
  it("matches the server's WorkspaceBinaryFileError wording", () => {
    expect(
      isBinaryFileReadError(
        "Workspace file 'a.bin' in '/repo' is binary and cannot be previewed as text.",
      ),
    ).toBe(true);
  });

  it("does not match unrelated error text", () => {
    expect(isBinaryFileReadError("ENOENT: no such file or directory")).toBe(false);
  });
});
