/**
 * Marcode: projection of `project.workspace-layout-applied` plus the lifecycle
 * pruning rules (deleted thread, dropped script) in ProjectStoreV2, backed by
 * the real projection_projects columns.
 */
import { assert, it } from "@effect/vitest";
import {
  EventId,
  ProjectId,
  type ProjectScript,
  ProjectWorkspaceItemId,
  type ProjectWorkspaceLayoutOperation,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectStore from "./ProjectStore.ts";

const at = "2026-03-24T00:00:00.000Z";
const itemId = ProjectWorkspaceItemId.make;
const script: ProjectScript = {
  id: "dev",
  name: "Dev",
  command: "vp run dev",
  icon: "play",
  runOnWorktreeCreate: false,
};

const base = (projectId: ProjectId, sequence: number) =>
  ({
    sequence,
    eventId: EventId.make(`event-${projectId}-${sequence}`),
    aggregateKind: "project",
    aggregateId: projectId,
    occurredAt: at,
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
  }) as const;

it.layer(ProjectStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)))(
  "ProjectStoreV2 workspace layout",
  (it) => {
    const seed = Effect.fn("seed")(function* (name: string) {
      const projects = yield* ProjectStore.ProjectStoreV2;
      const projectId = ProjectId.make(name);
      yield* projects.apply({
        ...base(projectId, 1),
        type: "project.created",
        payload: {
          projectId,
          title: name,
          workspaceRoot: `/tmp/${name}`,
          defaultModelSelection: null,
          scripts: [script],
          createdAt: at,
          updatedAt: at,
        },
      });
      return { projects, projectId };
    });

    const applyOp = (
      projects: ProjectStore.ProjectStoreV2["Service"],
      projectId: ProjectId,
      sequence: number,
      operation: ProjectWorkspaceLayoutOperation,
    ) =>
      projects.apply({
        ...base(projectId, sequence),
        type: "project.workspace-layout-applied",
        payload: { projectId, operation, layoutVersion: sequence - 1, updatedAt: at },
      });

    it.effect("starts at version 0 with an empty layout and exposes it on the shell", () =>
      Effect.gen(function* () {
        const { projects, projectId } = yield* seed("layout-initial");
        const shell = Option.getOrThrow(yield* projects.getShell(projectId));
        assert.strictEqual(shell.workspaceLayoutVersion, 0);
        assert.deepStrictEqual(shell.workspaceLayout, []);
      }),
    );

    it.effect("applies operations in order, bumps the version, and reparents on remove", () =>
      Effect.gen(function* () {
        const { projects, projectId } = yield* seed("layout-ops");
        yield* applyOp(projects, projectId, 2, {
          type: "attach-path",
          entry: { kind: "folder", id: itemId("folder"), parentId: null, rank: "a", relativePath: "src" },
        });
        yield* applyOp(projects, projectId, 3, {
          type: "attach-path",
          entry: {
            kind: "file",
            id: itemId("file"),
            parentId: itemId("folder"),
            rank: "a",
            relativePath: "src/a.ts",
          },
        });
        yield* applyOp(projects, projectId, 4, { type: "rename", itemId: itemId("folder"), label: "Source" });
        yield* applyOp(projects, projectId, 5, { type: "remove", itemId: itemId("folder") });
        const shell = Option.getOrThrow(yield* projects.getShell(projectId));
        assert.strictEqual(shell.workspaceLayoutVersion, 4);
        assert.deepStrictEqual(
          shell.workspaceLayout.map((entry) => [entry.id, entry.parentId]),
          [["file", null]],
        );
      }),
    );

    it.effect("pruneThreadFromLayout drops a placed thread without bumping the version", () =>
      Effect.gen(function* () {
        const { projects, projectId } = yield* seed("layout-thread-prune");
        yield* applyOp(projects, projectId, 2, {
          type: "place-resource",
          resource: { kind: "thread", threadId: ThreadId.make("thread-1") },
          parentId: null,
          beforeId: null,
        });
        yield* projects.pruneThreadFromLayout({ projectId, threadId: ThreadId.make("thread-1") });
        const shell = Option.getOrThrow(yield* projects.getShell(projectId));
        assert.deepStrictEqual(shell.workspaceLayout, []);
        assert.strictEqual(shell.workspaceLayoutVersion, 1);
      }),
    );

    it.effect("dropping a script in project.meta-updated prunes its command entry", () =>
      Effect.gen(function* () {
        const { projects, projectId } = yield* seed("layout-script-prune");
        yield* applyOp(projects, projectId, 2, {
          type: "place-resource",
          resource: { kind: "command", scriptId: "dev" },
          parentId: null,
          beforeId: null,
        });
        yield* projects.apply({
          ...base(projectId, 3),
          type: "project.meta-updated",
          payload: { projectId, scripts: [], updatedAt: at },
        });
        const shell = Option.getOrThrow(yield* projects.getShell(projectId));
        assert.deepStrictEqual(shell.workspaceLayout, []);
      }),
    );
  },
);
