import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { ApplicationProjectEvent } from "./applicationEvent.ts";
import { OrchestrationProjectShell } from "./orchestrationProject.ts";
import { ProjectMutation } from "./project.ts";

it("decodes a pre-layout project shell with an empty layout at version 0", () => {
  const shell = Schema.decodeUnknownSync(OrchestrationProjectShell)({
    id: "project-1",
    title: "Project",
    workspaceRoot: "/tmp/project",
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.strictEqual(shell.workspaceLayoutVersion, 0);
  assert.deepStrictEqual(shell.workspaceLayout, []);
});

it("accepts the workspace layout command as a project mutation and its applied event", () => {
  const operation = { type: "remove", itemId: "url-1" } as const;
  Schema.decodeUnknownSync(ProjectMutation)({
    type: "project.workspace-layout.apply",
    commandId: "cmd-1",
    projectId: "project-1",
    expectedVersion: 0,
    operation,
  });
  Schema.decodeUnknownSync(ApplicationProjectEvent)({
    sequence: 1,
    eventId: "event-1",
    aggregateKind: "project",
    aggregateId: "project-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    commandId: "cmd-1",
    causationEventId: null,
    correlationId: "cmd-1",
    metadata: {},
    type: "project.workspace-layout-applied",
    payload: {
      projectId: "project-1",
      operation,
      layoutVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
});
