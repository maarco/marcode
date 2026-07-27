import type { ProjectReadFileResult } from "@t3tools/contracts";
import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  clearProjectFileQueryData,
  getOptimisticProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";

import {
  applyProjectFileEdit,
  blockedWriteResult,
  isConfirmedReadWritable,
} from "./projectFileState";

const environmentId = EnvironmentId.make("environment-project-file-state-write-gate-test");
const cwd = "/repo";
const relativePath = "big.txt";

const TRUNCATED: ProjectReadFileResult = {
  relativePath,
  contents: "partial",
  byteLength: 4_000_000,
  truncated: true,
};
const SAFE: ProjectReadFileResult = {
  relativePath,
  contents: "hello",
  byteLength: 5,
  truncated: false,
};
/**
 * `confirmed: null` is how an ERRORED read is represented here, alongside a
 * read that hasn't completed yet: `getConfirmedFileResult` extracts via
 * `AsyncResult.value()`, which only ever holds a value from a `Success` —
 * there is no `ProjectReadFileResult` for a failed fetch to attach an
 * "errored but still has data" flag to. So `null` is simultaneously the
 * error case and the not-loaded-yet case, and the gate refuses both the same
 * way. Concretely: a binary file's read fails server-side (`WorkspaceBinaryFileError`),
 * so `confirmed` is `null` here — the exact "one keystroke replaces the
 * binary" case from the audit.
 */
const NEVER_CONFIRMED = null;

describe("write gate (P0: a truncated/failed confirmed read must block writes at the choke point)", () => {
  afterEach(() => {
    clearProjectFileQueryData(environmentId, cwd, relativePath);
    vi.unstubAllGlobals();
  });

  describe("isConfirmedReadWritable", () => {
    it("is false with no confirmed read at all — covers both an errored read and one that hasn't loaded yet", () => {
      expect(isConfirmedReadWritable(NEVER_CONFIRMED)).toBe(false);
    });

    it("is false for a truncated confirmed read", () => {
      expect(isConfirmedReadWritable(TRUNCATED)).toBe(false);
    });

    it("is true for a successful, non-truncated confirmed read", () => {
      expect(isConfirmedReadWritable(SAFE)).toBe(true);
    });
  });

  describe("applyProjectFileEdit — this is what useProjectFileEditor's update() calls", () => {
    it("P0: refuses to apply an edit over a truncated confirmed read", () => {
      vi.stubGlobal("window", {});
      const change = vi.fn();

      const applied = applyProjectFileEdit(
        environmentId,
        cwd,
        relativePath,
        "malicious edit",
        TRUNCATED,
        { change },
      );

      expect(applied).toBe(false);
      expect(change).not.toHaveBeenCalled();
      // and, just as important: it must not resurrect `truncated: false` into
      // the overlay — that would be the self-destroying-guard failure mode
      // (a slipped-through write erasing the very flag that should block it).
      expect(getOptimisticProjectFileQueryData(environmentId, cwd, relativePath)).toBeNull();
    });

    it("P0: refuses to apply an edit when the read errored — the binary-file case: read fails, write must not", () => {
      vi.stubGlobal("window", {});
      const change = vi.fn();

      const applied = applyProjectFileEdit(
        environmentId,
        cwd,
        relativePath,
        "typed into a blank buffer",
        NEVER_CONFIRMED,
        { change },
      );

      expect(applied).toBe(false);
      expect(change).not.toHaveBeenCalled();
      expect(getOptimisticProjectFileQueryData(environmentId, cwd, relativePath)).toBeNull();
    });

    it("P0: refuses to apply an edit when the read hasn't completed yet", () => {
      vi.stubGlobal("window", {});
      const change = vi.fn();

      const applied = applyProjectFileEdit(
        environmentId,
        cwd,
        relativePath,
        "typed before the read resolved",
        NEVER_CONFIRMED,
        { change },
      );

      expect(applied).toBe(false);
      expect(change).not.toHaveBeenCalled();
    });

    it("applies the edit normally once the confirmed read is a safe, non-truncated success", () => {
      vi.stubGlobal("window", {});
      const change = vi.fn();

      const applied = applyProjectFileEdit(environmentId, cwd, relativePath, "hello world", SAFE, {
        change,
      });

      expect(applied).toBe(true);
      expect(change).toHaveBeenCalledWith("hello world");
      expect(getOptimisticProjectFileQueryData(environmentId, cwd, relativePath)?.contents).toBe(
        "hello world",
      );
    });
  });

  describe("blockedWriteResult — the choke point persist() checks for an already-armed autosave", () => {
    it("returns a settled Failure when the confirmed read is truncated, without calling through to writeFile", () => {
      const result = blockedWriteResult(cwd, relativePath, TRUNCATED);

      expect(result).not.toBeNull();
      expect(result?._tag).toBe("Failure");
    });

    it("returns a settled Failure when the read errored, without calling through to writeFile", () => {
      const result = blockedWriteResult(cwd, relativePath, NEVER_CONFIRMED);

      expect(result).not.toBeNull();
      expect(result?._tag).toBe("Failure");
    });

    it("returns null (let persist proceed) once the confirmed read is a safe, non-truncated success", () => {
      expect(blockedWriteResult(cwd, relativePath, SAFE)).toBeNull();
    });
  });
});
