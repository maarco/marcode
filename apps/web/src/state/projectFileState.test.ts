import type { ProjectReadFileResult } from "@t3tools/contracts";
import { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  clearProjectFileQueryData,
  getOptimisticProjectFileQueryData,
  getProjectFileQueryAtom,
} from "~/components/files/projectFilesQueryState";
import { appAtomRegistry } from "~/rpc/atomRegistry";

import {
  applyProjectFileEdit,
  blockedWriteResult,
  isConfirmedReadWritable,
} from "./projectFileState";

const environmentId = EnvironmentId.make("environment-project-file-state-write-gate-test");
const cwd = "/repo";
const relativePath = "big.txt";

/** Stuff a confirmed (server-read) result directly into the query atom, or
 * `null` to simulate a read that never succeeded (e.g. a binary rejection). */
function seedConfirmedRead(result: ProjectReadFileResult | null): void {
  const atom = getProjectFileQueryAtom(environmentId, cwd, relativePath);
  appAtomRegistry.set(
    atom,
    result === null
      ? AsyncResult.failure(Cause.fail(new Error("read failed")))
      : AsyncResult.success(result),
  );
}

describe("write gate (P0: a truncated/failed confirmed read must block writes at the choke point)", () => {
  afterEach(() => {
    clearProjectFileQueryData(environmentId, cwd, relativePath);
    vi.unstubAllGlobals();
  });

  describe("isConfirmedReadWritable", () => {
    it("is false with no confirmed read at all", () => {
      seedConfirmedRead(null);
      expect(isConfirmedReadWritable(environmentId, cwd, relativePath)).toBe(false);
    });

    it("is false for a truncated confirmed read", () => {
      seedConfirmedRead({
        relativePath,
        contents: "partial",
        byteLength: 4_000_000,
        truncated: true,
      });
      expect(isConfirmedReadWritable(environmentId, cwd, relativePath)).toBe(false);
    });

    it("is true for a successful, non-truncated confirmed read", () => {
      seedConfirmedRead({ relativePath, contents: "hello", byteLength: 5, truncated: false });
      expect(isConfirmedReadWritable(environmentId, cwd, relativePath)).toBe(true);
    });
  });

  describe("applyProjectFileEdit — this is what update() calls", () => {
    it("P0: refuses to apply an edit over a truncated confirmed read", () => {
      vi.stubGlobal("window", {});
      seedConfirmedRead({
        relativePath,
        contents: "partial",
        byteLength: 4_000_000,
        truncated: true,
      });
      const change = vi.fn();

      const applied = applyProjectFileEdit(environmentId, cwd, relativePath, "malicious edit", {
        change,
      });

      expect(applied).toBe(false);
      expect(change).not.toHaveBeenCalled();
      // and, just as important: it must not resurrect `truncated: false` into
      // the overlay — that would be the self-destroying-guard failure mode.
      expect(getOptimisticProjectFileQueryData(environmentId, cwd, relativePath)).toBeNull();
    });

    it("P0: refuses to apply an edit when the file never had a successful read (e.g. binary rejection)", () => {
      vi.stubGlobal("window", {});
      seedConfirmedRead(null);
      const change = vi.fn();

      const applied = applyProjectFileEdit(
        environmentId,
        cwd,
        relativePath,
        "typed into a blank buffer",
        {
          change,
        },
      );

      expect(applied).toBe(false);
      expect(change).not.toHaveBeenCalled();
    });

    it("applies the edit normally once the confirmed read is a safe, non-truncated success", () => {
      vi.stubGlobal("window", {});
      seedConfirmedRead({ relativePath, contents: "hello", byteLength: 5, truncated: false });
      const change = vi.fn();

      const applied = applyProjectFileEdit(environmentId, cwd, relativePath, "hello world", {
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
      seedConfirmedRead({
        relativePath,
        contents: "partial",
        byteLength: 4_000_000,
        truncated: true,
      });

      const result = blockedWriteResult(environmentId, cwd, relativePath);

      expect(result).not.toBeNull();
      expect(result?._tag).toBe("Failure");
    });

    it("returns a settled Failure when the file never had a successful read", () => {
      seedConfirmedRead(null);

      const result = blockedWriteResult(environmentId, cwd, relativePath);

      expect(result).not.toBeNull();
      expect(result?._tag).toBe("Failure");
    });

    it("returns null (let persist proceed) once the confirmed read is a safe, non-truncated success", () => {
      seedConfirmedRead({ relativePath, contents: "hello", byteLength: 5, truncated: false });

      expect(blockedWriteResult(environmentId, cwd, relativePath)).toBeNull();
    });
  });
});
