import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  EMPTY_PROJECT_WORKSPACE_LAYOUT,
  INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION,
  makeCommandWorkspaceItemId,
  makeThreadWorkspaceItemId,
  ProjectWorkspaceEntry,
  ProjectWorkspaceItemId,
  ProjectWorkspaceLayoutApplyCommand,
  ProjectWorkspaceLayoutAppliedPayload,
  ProjectWorkspaceLayoutOperation,
  ProjectWorkspaceLayoutRejection,
  ProjectWorkspaceLayoutVersion,
  ProjectWorkspaceRank,
} from "./projectWorkspace.ts";

const decodeItemId = Schema.decodeUnknownEffect(ProjectWorkspaceItemId);
const decodeEntry = Schema.decodeUnknownEffect(ProjectWorkspaceEntry);
const decodeOperation = Schema.decodeUnknownEffect(ProjectWorkspaceLayoutOperation);
const decodeApplyCommand = Schema.decodeUnknownEffect(ProjectWorkspaceLayoutApplyCommand);
const decodeAppliedPayload = Schema.decodeUnknownEffect(ProjectWorkspaceLayoutAppliedPayload);
const decodeRejection = Schema.decodeUnknownEffect(ProjectWorkspaceLayoutRejection);
const decodeVersion = Schema.decodeUnknownEffect(ProjectWorkspaceLayoutVersion);
const decodeRank = Schema.decodeUnknownEffect(ProjectWorkspaceRank);

it("EMPTY_PROJECT_WORKSPACE_LAYOUT and INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION are the documented defaults", () => {
  assert.deepStrictEqual(EMPTY_PROJECT_WORKSPACE_LAYOUT, []);
  assert.strictEqual(INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION, 0);
});

it("makeThreadWorkspaceItemId / makeCommandWorkspaceItemId are deterministic", () => {
  assert.strictEqual(makeThreadWorkspaceItemId("thread-1"), "thread:thread-1");
  assert.strictEqual(makeCommandWorkspaceItemId("script-1"), "command:script-1");
  assert.strictEqual(makeThreadWorkspaceItemId("thread-1"), makeThreadWorkspaceItemId("thread-1"));
});

it.effect("ProjectWorkspaceItemId trims and rejects empty", () =>
  Effect.gen(function* () {
    const trimmed = yield* decodeItemId(" item-1 ");
    assert.strictEqual(trimmed, "item-1");
    const emptyResult = yield* Effect.exit(decodeItemId("   "));
    assert.strictEqual(emptyResult._tag, "Failure");
  }),
);

it.effect("ProjectWorkspaceLayoutVersion rejects negative numbers", () =>
  Effect.gen(function* () {
    const ok = yield* decodeVersion(0);
    assert.strictEqual(ok, 0);
    const failure = yield* Effect.exit(decodeVersion(-1));
    assert.strictEqual(failure._tag, "Failure");
  }),
);

it.effect("ProjectWorkspaceRank trims and rejects empty", () =>
  Effect.gen(function* () {
    const trimmed = yield* decodeRank(" abc ");
    assert.strictEqual(trimmed, "abc");
    const failure = yield* Effect.exit(decodeRank(""));
    assert.strictEqual(failure._tag, "Failure");
  }),
);

it.effect("decodes every ProjectWorkspaceEntry variant", () =>
  Effect.gen(function* () {
    const file = yield* decodeEntry({
      kind: "file",
      id: "file-1",
      parentId: null,
      rank: "a",
      relativePath: "src/index.ts",
    });
    assert.strictEqual(file.kind, "file");

    const folder = yield* decodeEntry({
      kind: "folder",
      id: "folder-1",
      parentId: null,
      rank: "b",
      relativePath: "src",
      label: "Source",
    });
    assert.strictEqual(folder.kind, "folder");

    const thread = yield* decodeEntry({
      kind: "thread",
      id: makeThreadWorkspaceItemId("thread-1"),
      parentId: "folder-1",
      rank: "c",
      threadId: "thread-1",
    });
    assert.strictEqual(thread.kind, "thread");

    const command = yield* decodeEntry({
      kind: "command",
      id: makeCommandWorkspaceItemId("script-1"),
      parentId: null,
      rank: "d",
      scriptId: "script-1",
    });
    assert.strictEqual(command.kind, "command");

    const url = yield* decodeEntry({
      kind: "url",
      id: "url-1",
      parentId: null,
      rank: "e",
      label: "Local app",
      url: "http://localhost:3000",
    });
    assert.strictEqual(url.kind, "url");
  }),
);

it.effect("rejects an entry with an unknown kind", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeEntry({
        kind: "not-a-real-kind",
        id: "x",
        parentId: null,
        rank: "a",
      }),
    );
    assert.strictEqual(result._tag, "Failure");
  }),
);

it.effect("decodes every ProjectWorkspaceLayoutOperation variant", () =>
  Effect.gen(function* () {
    const attach = yield* decodeOperation({
      type: "attach-path",
      entry: {
        kind: "file",
        id: "file-1",
        parentId: null,
        rank: "a",
        relativePath: "README.md",
      },
    });
    assert.strictEqual(attach.type, "attach-path");

    const addUrl = yield* decodeOperation({
      type: "add-url",
      entry: {
        kind: "url",
        id: "url-1",
        parentId: null,
        rank: "b",
        label: "Local app",
        url: "http://localhost:3000",
      },
    });
    assert.strictEqual(addUrl.type, "add-url");

    const placeThread = yield* decodeOperation({
      type: "place-resource",
      resource: { kind: "thread", threadId: "thread-1" },
      parentId: null,
      beforeId: null,
    });
    assert.strictEqual(placeThread.type, "place-resource");

    const placeCommand = yield* decodeOperation({
      type: "place-resource",
      resource: { kind: "command", scriptId: "script-1" },
      parentId: "folder-1",
      beforeId: "item-2",
    });
    assert.strictEqual(placeCommand.type, "place-resource");

    const move = yield* decodeOperation({
      type: "move",
      itemId: "item-1",
      parentId: null,
      beforeId: null,
    });
    assert.strictEqual(move.type, "move");

    const rename = yield* decodeOperation({
      type: "rename",
      itemId: "item-1",
      label: "New label",
    });
    assert.strictEqual(rename.type, "rename");

    const remove = yield* decodeOperation({
      type: "remove",
      itemId: "item-1",
    });
    assert.strictEqual(remove.type, "remove");
  }),
);

it.effect("decodes a full ProjectWorkspaceLayoutApplyCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeApplyCommand({
      type: "project.workspace-layout.apply",
      commandId: "cmd-1",
      projectId: "project-1",
      expectedVersion: 0,
      operation: {
        type: "remove",
        itemId: "item-1",
      },
    });
    assert.strictEqual(parsed.type, "project.workspace-layout.apply");
    assert.strictEqual(parsed.expectedVersion, 0);
  }),
);

it.effect("decodes a ProjectWorkspaceLayoutAppliedPayload", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeAppliedPayload({
      projectId: "project-1",
      operation: { type: "remove", itemId: "item-1" },
      layoutVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.strictEqual(parsed.layoutVersion, 1);
  }),
);

it.effect(
  "decodes every ProjectWorkspaceLayoutErrorTag and preserves optional currentVersion",
  () =>
    Effect.gen(function* () {
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
        const parsed = yield* decodeRejection({
          tag,
          message: `rejected: ${tag}`,
        });
        assert.strictEqual(parsed.tag, tag);
        assert.strictEqual(parsed.currentVersion, undefined);
      }

      const withVersion = yield* decodeRejection({
        tag: "version-conflict",
        message: "stale version",
        currentVersion: 5,
      });
      assert.strictEqual(withVersion.currentVersion, 5);
    }),
);

it.effect("rejects an unknown ProjectWorkspaceLayoutErrorTag", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeRejection({
        tag: "not-a-real-tag",
        message: "x",
      }),
    );
    assert.strictEqual(result._tag, "Failure");
  }),
);
