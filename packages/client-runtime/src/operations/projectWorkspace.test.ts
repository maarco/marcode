import { describe, expect, it } from "vite-plus/test";

import {
  parseProjectWorkspaceLayoutRejection,
  SAMPLE_PROJECT_WORKSPACE_LAYOUT,
  SAMPLE_PROJECT_WORKSPACE_SCRIPT_ID,
  SAMPLE_PROJECT_WORKSPACE_THREAD_ID,
} from "./projectWorkspace.ts";

describe("parseProjectWorkspaceLayoutRejection", () => {
  it("parses the exact wire shape the server produces (see workspaceLayoutRejectionDetail)", () => {
    // Mirrors `OrchestrationCommandInvariantError.message`:
    // `Orchestration command invariant failed (${commandType}): ${detail}`
    // where `detail` is `JSON.stringify({tag, message, currentVersion?})`.
    const message =
      'Orchestration command invariant failed (project.workspace-layout.apply): ' +
      '{"tag":"version-conflict","message":"Expected workspace layout version 3 but the current version is 5.","currentVersion":5}';

    expect(parseProjectWorkspaceLayoutRejection(message)).toEqual({
      tag: "version-conflict",
      message: "Expected workspace layout version 3 but the current version is 5.",
      currentVersion: 5,
    });
  });

  it("omits currentVersion when the server did not include it", () => {
    const message =
      'Orchestration command invariant failed (project.workspace-layout.apply): ' +
      '{"tag":"cycle","message":"Item cannot be its own parent."}';

    const rejection = parseProjectWorkspaceLayoutRejection(message);
    expect(rejection.tag).toBe("cycle");
    expect(rejection.message).toBe("Item cannot be its own parent.");
    expect("currentVersion" in rejection).toBe(false);
  });

  it("round-trips every known ProjectWorkspaceLayoutErrorTag", () => {
    const tags = [
      "version-conflict",
      "cycle",
      "missing-target",
      "duplicate-path",
      "cross-project",
      "invalid-parent",
      "invalid-path",
      "not-persistent",
    ] as const;
    for (const tag of tags) {
      const message = `Orchestration command invariant failed (project.workspace-layout.apply): ${JSON.stringify(
        { tag, message: `rejected: ${tag}` },
      )}`;
      expect(parseProjectWorkspaceLayoutRejection(message).tag).toBe(tag);
    }
  });

  it("falls back to a safe default when the message has no embedded JSON", () => {
    const rejection = parseProjectWorkspaceLayoutRejection("Failed to dispatch orchestration command");
    expect(rejection.tag).toBe("missing-target");
    expect(rejection.message).toBe("Failed to dispatch orchestration command");
  });

  it("falls back to a safe default for malformed embedded JSON", () => {
    const rejection = parseProjectWorkspaceLayoutRejection("prefix {not valid json");
    expect(rejection.tag).toBe("missing-target");
  });

  it("falls back to a safe default when the tag is not a recognized ProjectWorkspaceLayoutErrorTag", () => {
    const message = JSON.stringify({ tag: "not-a-real-tag", message: "x" });
    const rejection = parseProjectWorkspaceLayoutRejection(message);
    expect(rejection.tag).toBe("missing-target");
  });

  it("falls back to a safe default when the embedded object is missing required fields", () => {
    expect(parseProjectWorkspaceLayoutRejection(JSON.stringify({ tag: "cycle" })).tag).toBe(
      "missing-target",
    );
    expect(parseProjectWorkspaceLayoutRejection(JSON.stringify({ message: "x" })).tag).toBe(
      "missing-target",
    );
  });

  it("never throws on adversarial input", () => {
    expect(() => parseProjectWorkspaceLayoutRejection("")).not.toThrow();
    expect(() => parseProjectWorkspaceLayoutRejection("{}")).not.toThrow();
    expect(() => parseProjectWorkspaceLayoutRejection("{{{{")).not.toThrow();
    expect(() =>
      parseProjectWorkspaceLayoutRejection('{"tag":"cycle","message":123}'),
    ).not.toThrow();
    expect(() => parseProjectWorkspaceLayoutRejection('{"tag":null}')).not.toThrow();
  });
});

describe("SAMPLE_PROJECT_WORKSPACE_LAYOUT", () => {
  it("covers every persisted entry kind exactly once", () => {
    const kinds = SAMPLE_PROJECT_WORKSPACE_LAYOUT.map((entry) => entry.kind).toSorted();
    expect(kinds).toEqual(["command", "file", "folder", "thread", "url"]);
  });

  it("nests folder -> file -> thread as documented", () => {
    const folder = SAMPLE_PROJECT_WORKSPACE_LAYOUT.find((entry) => entry.kind === "folder")!;
    const file = SAMPLE_PROJECT_WORKSPACE_LAYOUT.find((entry) => entry.kind === "file")!;
    const thread = SAMPLE_PROJECT_WORKSPACE_LAYOUT.find((entry) => entry.kind === "thread")!;
    expect(folder.parentId).toBeNull();
    expect(file.parentId).toBe(folder.id);
    expect(thread.parentId).toBe(file.id);
  });

  it("uses the real deterministic id convention for thread/command entries", () => {
    const thread = SAMPLE_PROJECT_WORKSPACE_LAYOUT.find((entry) => entry.kind === "thread")!;
    const command = SAMPLE_PROJECT_WORKSPACE_LAYOUT.find((entry) => entry.kind === "command")!;
    expect(thread.id).toBe(`thread:${SAMPLE_PROJECT_WORKSPACE_THREAD_ID}`);
    expect(command.id).toBe(`command:${SAMPLE_PROJECT_WORKSPACE_SCRIPT_ID}`);
  });

  it("has every id unique and every rank non-empty", () => {
    const ids = SAMPLE_PROJECT_WORKSPACE_LAYOUT.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of SAMPLE_PROJECT_WORKSPACE_LAYOUT) {
      expect(entry.rank.length).toBeGreaterThan(0);
    }
  });

  it("gives root-level siblings (folder, command, url) distinct, sortable ranks", () => {
    const rootEntries = SAMPLE_PROJECT_WORKSPACE_LAYOUT.filter((entry) => entry.parentId === null);
    expect(rootEntries.length).toBe(3);
    const ranks = rootEntries.map((entry) => entry.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});
