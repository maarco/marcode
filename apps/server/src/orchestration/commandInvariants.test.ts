import { describe, expect, it } from "vite-plus/test";
import {
  MessageId,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EMPTY_PROJECT_WORKSPACE_LAYOUT,
  INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION,
  ProjectId,
  ProjectWorkspaceItemId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationReadModel,
  type ProjectWorkspaceEntry,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  applyWorkspaceLayoutOperation,
  collectWorkspaceLayoutDescendantIds,
  computeWorkspaceLayoutPlacementRank,
  findThreadById,
  isLiveWorkspaceResourceItemId,
  listThreadsByProjectId,
  normalizeWorkspaceRelativePath,
  removeWorkspaceLayoutEntryById,
  requireNonNegativeInteger,
  requireThread,
  requireThreadAbsent,
} from "./commandInvariants.ts";

const now = "2026-01-01T00:00:00.000Z";

const PROJECT_WORKSPACE_LAYOUT_DEFAULTS = {
  workspaceLayoutVersion: INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION,
  workspaceLayout: EMPTY_PROJECT_WORKSPACE_LAYOUT,
} as const;

const readModel: OrchestrationReadModel = {
  snapshotSequence: 2,
  updatedAt: now,
  projects: [
    {
      id: ProjectId.make("project-a"),
      title: "Project A",
      workspaceRoot: "/tmp/project-a",
      defaultModelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5-codex",
      },
      scripts: [],
      ...PROJECT_WORKSPACE_LAYOUT_DEFAULTS,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: ProjectId.make("project-b"),
      title: "Project B",
      workspaceRoot: "/tmp/project-b",
      defaultModelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5-codex",
      },
      scripts: [],
      ...PROJECT_WORKSPACE_LAYOUT_DEFAULTS,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  ],
  threads: [
    {
      id: ThreadId.make("thread-1"),
      projectId: ProjectId.make("project-a"),
      title: "Thread A",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5-codex",
      },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "full-access",
      branch: null,
      worktreePath: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      latestTurn: null,
      messages: [],
      session: null,
      activities: [],
      proposedPlans: [],
      checkpoints: [],
      deletedAt: null,
    },
    {
      id: ThreadId.make("thread-2"),
      projectId: ProjectId.make("project-b"),
      title: "Thread B",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5-codex",
      },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "full-access",
      branch: null,
      worktreePath: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      latestTurn: null,
      messages: [],
      session: null,
      activities: [],
      proposedPlans: [],
      checkpoints: [],
      deletedAt: null,
    },
  ],
};

const messageSendCommand: OrchestrationCommand = {
  type: "thread.turn.start",
  commandId: CommandId.make("cmd-1"),
  threadId: ThreadId.make("thread-1"),
  message: {
    messageId: MessageId.make("msg-1"),
    role: "user",
    text: "hello",
    attachments: [],
  },
  interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
  runtimeMode: "approval-required",
  createdAt: now,
};

describe("commandInvariants", () => {
  it("finds threads by id and project", () => {
    expect(findThreadById(readModel, ThreadId.make("thread-1"))?.projectId).toBe("project-a");
    expect(findThreadById(readModel, ThreadId.make("missing"))).toBeUndefined();
    expect(
      listThreadsByProjectId(readModel, ProjectId.make("project-b")).map((thread) => thread.id),
    ).toEqual([ThreadId.make("thread-2")]);
  });

  it("requires existing thread", async () => {
    const thread = await Effect.runPromise(
      requireThread({
        readModel,
        command: messageSendCommand,
        threadId: ThreadId.make("thread-1"),
      }),
    );
    expect(thread.id).toBe(ThreadId.make("thread-1"));

    await expect(
      Effect.runPromise(
        requireThread({
          readModel,
          command: messageSendCommand,
          threadId: ThreadId.make("missing"),
        }),
      ),
    ).rejects.toThrow("does not exist");
  });

  it("requires missing thread for create flows", async () => {
    await Effect.runPromise(
      requireThreadAbsent({
        readModel,
        command: {
          type: "thread.create",
          commandId: CommandId.make("cmd-2"),
          threadId: ThreadId.make("thread-3"),
          projectId: ProjectId.make("project-a"),
          title: "new",
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5-codex",
          },
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "full-access",
          branch: null,
          worktreePath: null,
          createdAt: now,
        },
        threadId: ThreadId.make("thread-3"),
      }),
    );

    await expect(
      Effect.runPromise(
        requireThreadAbsent({
          readModel,
          command: {
            type: "thread.create",
            commandId: CommandId.make("cmd-3"),
            threadId: ThreadId.make("thread-1"),
            projectId: ProjectId.make("project-a"),
            title: "dup",
            modelSelection: {
              instanceId: ProviderInstanceId.make("codex"),
              model: "gpt-5-codex",
            },
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt: now,
          },
          threadId: ThreadId.make("thread-1"),
        }),
      ),
    ).rejects.toThrow("already exists");
  });

  it("requires non-negative integers", async () => {
    await Effect.runPromise(
      requireNonNegativeInteger({
        commandType: "thread.checkpoint.revert",
        field: "turnCount",
        value: 0,
      }),
    );

    await expect(
      Effect.runPromise(
        requireNonNegativeInteger({
          commandType: "thread.checkpoint.revert",
          field: "turnCount",
          value: -1,
        }),
      ),
    ).rejects.toThrow("greater than or equal to 0");
  });
});

describe("normalizeWorkspaceRelativePath", () => {
  it("resolves . and .. segments within the path", () => {
    expect(normalizeWorkspaceRelativePath("./src/../src/auth.ts")).toBe("src/auth.ts");
    expect(normalizeWorkspaceRelativePath("src//auth.ts")).toBe("src/auth.ts");
    expect(normalizeWorkspaceRelativePath("src\\auth.ts")).toBe("src/auth.ts");
  });

  it("rejects paths that escape the workspace root", () => {
    expect(normalizeWorkspaceRelativePath("../outside.ts")).toBeNull();
    expect(normalizeWorkspaceRelativePath("src/../../outside.ts")).toBeNull();
  });

  it("rejects absolute and empty paths", () => {
    expect(normalizeWorkspaceRelativePath("/etc/passwd")).toBeNull();
    expect(normalizeWorkspaceRelativePath("C:\\Windows")).toBeNull();
    expect(normalizeWorkspaceRelativePath("\\\\server\\share")).toBeNull();
    expect(normalizeWorkspaceRelativePath("")).toBeNull();
    expect(normalizeWorkspaceRelativePath("   ")).toBeNull();
    expect(normalizeWorkspaceRelativePath(".")).toBeNull();
  });
});

describe("isLiveWorkspaceResourceItemId", () => {
  it("recognizes live terminal/browser ids and rejects persisted ids", () => {
    expect(isLiveWorkspaceResourceItemId("terminal:env-1:thread-1:term-1")).toBe(true);
    expect(isLiveWorkspaceResourceItemId("browser:env-1:thread-1:tab-1")).toBe(true);
    expect(isLiveWorkspaceResourceItemId("thread:thread-1")).toBe(false);
    expect(isLiveWorkspaceResourceItemId("command:script-1")).toBe(false);
    expect(isLiveWorkspaceResourceItemId("some-uuid")).toBe(false);
  });
});

describe("collectWorkspaceLayoutDescendantIds", () => {
  const layout: ReadonlyArray<ProjectWorkspaceEntry> = [
    {
      kind: "folder",
      id: ProjectWorkspaceItemId.make("a"),
      parentId: null,
      rank: "a",
      relativePath: "a",
    },
    {
      kind: "folder",
      id: ProjectWorkspaceItemId.make("b"),
      parentId: ProjectWorkspaceItemId.make("a"),
      rank: "a",
      relativePath: "a/b",
    },
    {
      kind: "folder",
      id: ProjectWorkspaceItemId.make("c"),
      parentId: ProjectWorkspaceItemId.make("b"),
      rank: "a",
      relativePath: "a/b/c",
    },
    {
      kind: "folder",
      id: ProjectWorkspaceItemId.make("sibling"),
      parentId: null,
      rank: "b",
      relativePath: "sibling",
    },
  ];

  it("collects all transitive descendants, not just direct children", () => {
    expect([...collectWorkspaceLayoutDescendantIds(layout, "a" as never)].toSorted()).toEqual([
      "b",
      "c",
    ]);
  });

  it("returns an empty set for a leaf with no children", () => {
    expect([...collectWorkspaceLayoutDescendantIds(layout, "c" as never)]).toEqual([]);
    expect([...collectWorkspaceLayoutDescendantIds(layout, "sibling" as never)]).toEqual([]);
  });
});

describe("computeWorkspaceLayoutPlacementRank", () => {
  const layout: ReadonlyArray<ProjectWorkspaceEntry> = [
    {
      kind: "url",
      id: ProjectWorkspaceItemId.make("first"),
      parentId: null,
      rank: "a",
      label: "First",
      url: "http://a",
    },
    {
      kind: "url",
      id: ProjectWorkspaceItemId.make("second"),
      parentId: null,
      rank: "m",
      label: "Second",
      url: "http://b",
    },
    {
      kind: "url",
      id: ProjectWorkspaceItemId.make("last"),
      parentId: null,
      rank: "z",
      label: "Last",
      url: "http://c",
    },
  ];

  it("computes a rank after the last sibling when beforeId is null", () => {
    const rank = computeWorkspaceLayoutPlacementRank({ layout, parentId: null, beforeId: null });
    expect(rank > "z").toBe(true);
  });

  it("computes a rank strictly between the two siblings around beforeId", () => {
    const rank = computeWorkspaceLayoutPlacementRank({
      layout,
      parentId: null,
      beforeId: ProjectWorkspaceItemId.make("second"),
    });
    expect(rank > "a").toBe(true);
    expect(rank < "m").toBe(true);
  });

  it("computes a rank before the first sibling when beforeId is the first sibling", () => {
    const rank = computeWorkspaceLayoutPlacementRank({
      layout,
      parentId: null,
      beforeId: ProjectWorkspaceItemId.make("first"),
    });
    expect(rank < "a").toBe(true);
  });

  it("excludes the item itself from the sibling scan (re-placement)", () => {
    // Moving "second" to before "last" must not compare it against its own
    // prior rank ("m") — only against "first"/"last".
    const rank = computeWorkspaceLayoutPlacementRank({
      layout,
      parentId: null,
      beforeId: ProjectWorkspaceItemId.make("last"),
      excludeItemId: "second" as never,
    });
    expect(rank > "a").toBe(true);
    expect(rank < "z").toBe(true);
  });
});

describe("removeWorkspaceLayoutEntryById", () => {
  it("is a no-op when the item is not present", () => {
    const layout: ReadonlyArray<ProjectWorkspaceEntry> = [
      {
        kind: "url",
        id: ProjectWorkspaceItemId.make("x"),
        parentId: null,
        rank: "a",
        label: "X",
        url: "http://x",
      },
    ];
    expect(removeWorkspaceLayoutEntryById(layout, "does-not-exist" as never)).toBe(layout);
  });

  it("removes a leaf with no children", () => {
    const layout: ReadonlyArray<ProjectWorkspaceEntry> = [
      {
        kind: "url",
        id: ProjectWorkspaceItemId.make("x"),
        parentId: null,
        rank: "a",
        label: "X",
        url: "http://x",
      },
    ];
    expect(removeWorkspaceLayoutEntryById(layout, "x" as never)).toEqual([]);
  });

  it("reparents children to the removed node's own parent, preserving their relative order", () => {
    const layout: ReadonlyArray<ProjectWorkspaceEntry> = [
      {
        kind: "folder",
        id: ProjectWorkspaceItemId.make("root-sibling"),
        parentId: null,
        rank: "a",
        relativePath: "existing",
      },
      {
        kind: "folder",
        id: ProjectWorkspaceItemId.make("mid"),
        parentId: null,
        rank: "b",
        relativePath: "mid",
      },
      {
        kind: "file",
        id: ProjectWorkspaceItemId.make("child-1"),
        parentId: ProjectWorkspaceItemId.make("mid"),
        rank: "a",
        relativePath: "mid/1.ts",
      },
      {
        kind: "file",
        id: ProjectWorkspaceItemId.make("child-2"),
        parentId: ProjectWorkspaceItemId.make("mid"),
        rank: "b",
        relativePath: "mid/2.ts",
      },
    ];
    const result = removeWorkspaceLayoutEntryById(layout, "mid" as never);
    expect(result.some((entry) => entry.id === "mid")).toBe(false);
    const child1 = result.find((entry) => entry.id === "child-1")!;
    const child2 = result.find((entry) => entry.id === "child-2")!;
    expect(child1.parentId).toBeNull();
    expect(child2.parentId).toBeNull();
    // relative order preserved, and both sort after the pre-existing root sibling
    expect(child1.rank < child2.rank).toBe(true);
    const rootSibling = result.find((entry) => entry.id === "root-sibling")!;
    expect(rootSibling.rank < child1.rank).toBe(true);
  });
});

describe("applyWorkspaceLayoutOperation", () => {
  it("appends new entries for attach-path and add-url", () => {
    const result = applyWorkspaceLayoutOperation([], {
      type: "attach-path",
      entry: {
        kind: "file",
        id: ProjectWorkspaceItemId.make("f"),
        parentId: null,
        rank: "a",
        relativePath: "a.ts",
      },
    });
    expect(result).toEqual([
      { kind: "file", id: "f", parentId: null, rank: "a", relativePath: "a.ts" },
    ]);
  });

  it("materializes a place-resource entry with a computed rank, then re-places it on a second call", () => {
    const afterPlace = applyWorkspaceLayoutOperation([], {
      type: "place-resource",
      resource: { kind: "thread", threadId: "thread-1" as never },
      parentId: null,
      beforeId: null,
    });
    expect(afterPlace.length).toBe(1);
    expect(afterPlace[0]?.id).toBe("thread:thread-1");

    const afterReplace = applyWorkspaceLayoutOperation(afterPlace, {
      type: "place-resource",
      resource: { kind: "thread", threadId: "thread-1" as never },
      parentId: "some-folder" as never,
      beforeId: null,
    });
    expect(afterReplace.length).toBe(1); // upsert, not a duplicate
    expect(afterReplace[0]?.parentId).toBe("some-folder");
  });

  it("delegates remove to removeWorkspaceLayoutEntryById", () => {
    const layout: ReadonlyArray<ProjectWorkspaceEntry> = [
      {
        kind: "url",
        id: ProjectWorkspaceItemId.make("x"),
        parentId: null,
        rank: "a",
        label: "X",
        url: "http://x",
      },
    ];
    expect(applyWorkspaceLayoutOperation(layout, { type: "remove", itemId: "x" as never })).toEqual(
      [],
    );
  });
});
