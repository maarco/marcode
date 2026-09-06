import {
  ProjectId,
  ProjectWorkspaceItemId,
  ThreadId,
  TurnId,
  ProviderInstanceId,
  OrchestrationProposedPlanId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Statement from "effect/unstable/sql/Statement";

import { SqlitePersistenceMemory } from "./Sqlite.ts";
import { ProjectionProjectRepositoryLive } from "./ProjectionProjects.ts";
import { ProjectionThreadRepositoryLive } from "./ProjectionThreads.ts";
import { ProjectionThreadProposedPlanRepositoryLive } from "./ProjectionThreadProposedPlans.ts";
import { ProjectionProjectRepository } from "../Services/ProjectionProjects.ts";
import { ProjectionThreadRepository } from "../Services/ProjectionThreads.ts";
import { ProjectionThreadProposedPlanRepository } from "../Services/ProjectionThreadProposedPlans.ts";

const projectionRepositoriesLayer = it.layer(
  Layer.mergeAll(
    ProjectionProjectRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    ProjectionThreadRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    ProjectionThreadProposedPlanRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
  ),
);

projectionRepositoriesLayer("Projection repositories", (it) => {
  it.effect("selects the latest-turn plan before checking implementation status", () =>
    Effect.gen(function* () {
      const plans = yield* ProjectionThreadProposedPlanRepository;
      const threadId = ThreadId.make("thread-plan-status");
      const latestTurnId = TurnId.make("turn-plan-status-current");
      const firstPlan = {
        planId: "plan-status-first",
        threadId,
        turnId: latestTurnId,
        planMarkdown: "# First plan",
        implementedAt: null,
        implementationThreadId: null,
        createdAt: "2026-03-24T00:00:01.000Z",
        updatedAt: "2026-03-24T00:00:01.000Z",
      };
      yield* plans.upsert(firstPlan);
      yield* plans.upsert({
        ...firstPlan,
        planId: "plan-status-implemented",
        implementedAt: "2026-03-24T00:00:02.000Z",
        createdAt: "2026-03-24T00:00:02.000Z",
        updatedAt: "2026-03-24T00:00:02.000Z",
      });
      yield* plans.upsert({
        ...firstPlan,
        planId: "plan-status-other-turn",
        turnId: TurnId.make("turn-plan-status-old"),
        updatedAt: "2026-03-24T00:00:10.000Z",
      });

      assert.isFalse(yield* plans.hasActionableByThreadId({ threadId, latestTurnId }));
      assert.isTrue(yield* plans.hasActionableByThreadId({ threadId, latestTurnId: null }));

      yield* plans.upsert({ ...firstPlan, updatedAt: "2026-03-24T00:00:03.000Z" });
      assert.isTrue(yield* plans.hasActionableByThreadId({ threadId, latestTurnId }));
    }),
  );

  it.effect("falls back within the thread when the latest turn has no plan", () =>
    Effect.gen(function* () {
      const plans = yield* ProjectionThreadProposedPlanRepository;
      const threadId = ThreadId.make("thread-plan-fallback");
      const latestTurnId = TurnId.make("turn-plan-fallback-missing");
      assert.isFalse(yield* plans.hasActionableByThreadId({ threadId, latestTurnId }));
      assert.isFalse(yield* plans.hasActionableByThreadId({ threadId, latestTurnId: null }));

      const firstPlan = {
        planId: "plan-fallback-without-turn",
        threadId,
        turnId: null,
        planMarkdown: "# Old plan",
        implementedAt: "2026-03-24T00:00:01.000Z",
        implementationThreadId: null,
        createdAt: "2026-03-24T00:00:01.000Z",
        updatedAt: "2026-03-24T00:00:01.000Z",
      };
      yield* plans.upsert(firstPlan);
      yield* plans.upsert({
        ...firstPlan,
        planId: "plan-fallback-with-turn",
        turnId: TurnId.make("turn-plan-fallback-old"),
        implementedAt: null,
        updatedAt: "2026-03-24T00:00:02.000Z",
      });
      yield* plans.upsert({
        ...firstPlan,
        planId: "plan-fallback-other-thread",
        threadId: ThreadId.make("thread-plan-fallback-other"),
        turnId: latestTurnId,
        updatedAt: "2026-03-24T00:00:03.000Z",
      });

      assert.isTrue(yield* plans.hasActionableByThreadId({ threadId, latestTurnId }));
      assert.isTrue(yield* plans.hasActionableByThreadId({ threadId, latestTurnId: null }));
    }),
  );

  it.effect("preserves locale ordering and stable ties when selecting plan status", () =>
    Effect.gen(function* () {
      const plans = yield* ProjectionThreadProposedPlanRepository;
      const timestamp = "2026-03-24T00:00:00.000Z";
      const cases = [
        {
          name: "mixed-case-ids",
          expected: "plan-A".localeCompare("plan-a") > 0,
          rows: [
            {
              planId: "plan-a",
              implementedAt: timestamp,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            { planId: "plan-A", implementedAt: null, createdAt: timestamp, updatedAt: timestamp },
          ],
        },
        {
          name: "equivalent-ids",
          expected: true,
          rows: [
            {
              planId: "plan-\u00e9",
              implementedAt: timestamp,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            {
              planId: "plan-e\u0301",
              implementedAt: null,
              createdAt: "2026-03-24T00:00:01.000Z",
              updatedAt: timestamp,
            },
          ],
        },
        {
          name: "timestamp-formats",
          expected: "2026-03-24T00:00:00+00:00".localeCompare("2026-03-24T00:00:00-01:00") > 0,
          rows: [
            {
              planId: "plan-minus",
              implementedAt: timestamp,
              createdAt: timestamp,
              updatedAt: "2026-03-24T00:00:00-01:00",
            },
            {
              planId: "plan-plus",
              implementedAt: null,
              createdAt: timestamp,
              updatedAt: "2026-03-24T00:00:00+00:00",
            },
          ],
        },
      ];
      for (const testCase of cases) {
        const threadId = ThreadId.make(`thread-plan-order-${testCase.name}`);
        const latestTurnId = TurnId.make(`turn-plan-order-${testCase.name}`);
        for (const plan of testCase.rows) {
          yield* plans.upsert({
            ...plan,
            planId: `${testCase.name}-${plan.planId}`,
            threadId,
            turnId: latestTurnId,
            planMarkdown: "# Plan",
            implementationThreadId: null,
          });
        }
        assert.strictEqual(
          yield* plans.hasActionableByThreadId({ threadId, latestTurnId }),
          testCase.expected,
          testCase.name,
        );
        assert.strictEqual(
          yield* plans.hasActionableByThreadId({ threadId, latestTurnId: null }),
          testCase.expected,
          testCase.name,
        );
      }
    }),
  );

  it.effect("returns only current-turn status metadata when old plans have large bodies", () =>
    Effect.gen(function* () {
      const plans = yield* ProjectionThreadProposedPlanRepository;
      const sql = yield* SqlClient.SqlClient;
      const threadId = ThreadId.make("thread-plan-metadata");
      const latestTurnId = TurnId.make("turn-plan-metadata-current");
      const updatedAt = "2026-03-24T00:00:00.000Z";
      yield* sql`
        WITH RECURSIVE history(n) AS (
          SELECT 1 UNION ALL SELECT n + 1 FROM history WHERE n < 256
        )
        INSERT INTO projection_thread_proposed_plans (
          plan_id, thread_id, turn_id, plan_markdown, implemented_at,
          implementation_thread_id, created_at, updated_at
        )
        SELECT 'plan-metadata-old-' || n, ${threadId}, 'turn-plan-metadata-old',
          ${"# Old plan\n".repeat(1024)}, ${updatedAt}, NULL, ${updatedAt}, ${updatedAt}
        FROM history
      `;
      yield* plans.upsert({
        planId: "plan-metadata-current",
        threadId,
        turnId: latestTurnId,
        planMarkdown: "# Current plan",
        implementedAt: null,
        implementationThreadId: null,
        createdAt: updatedAt,
        updatedAt,
      });
      const statements: Array<Statement.Statement<unknown>> = [];
      const actionable = yield* plans.hasActionableByThreadId({ threadId, latestTurnId }).pipe(
        Effect.provideService(Statement.CurrentTransformer, (statement) => {
          statements.push(statement);
          return Effect.succeed(statement);
        }),
      );
      assert.isTrue(actionable);
      assert.strictEqual(statements.length, 1);
      const statement = statements[0];
      if (statement === undefined) return yield* Effect.die("Expected a plan status query.");
      assert.deepEqual(yield* statement, [
        { planId: "plan-metadata-current", implementedAt: null, updatedAt },
      ]);
    }),
  );

  it.effect("reads only the requested plan in its thread", () =>
    Effect.gen(function* () {
      const plans = yield* ProjectionThreadProposedPlanRepository;
      const sql = yield* SqlClient.SqlClient;
      const threadId = ThreadId.make("plan-query-thread");
      const planId = OrchestrationProposedPlanId.make("plan-query-target");
      yield* plans.upsert({
        planId,
        threadId,
        turnId: null,
        planMarkdown: "Keep this plan",
        implementedAt: "2026-03-01T00:01:00.000Z",
        implementationThreadId: ThreadId.make("implementation-thread"),
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:01:00.000Z",
      });
      // An unrelated old row must not be loaded or decoded by the exact lookup.
      yield* sql`
        INSERT INTO projection_thread_proposed_plans (
          plan_id, thread_id, turn_id, plan_markdown, implemented_at,
          implementation_thread_id, created_at, updated_at
        ) VALUES (
          'unrelated-plan', ${threadId}, NULL, '', NULL, NULL,
          '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'
        )
      `;
      const plan = Option.getOrThrow(yield* plans.getByPlanId({ threadId, planId }));
      assert.equal(plan.planMarkdown, "Keep this plan");
      assert.equal(plan.implementedAt, "2026-03-01T00:01:00.000Z");
      assert.isTrue(
        Option.isNone(
          yield* plans.getByPlanId({
            threadId: ThreadId.make("another-thread"),
            planId,
          }),
        ),
      );
    }),
  );

  it.effect("stores SQL NULL for missing project model options", () =>
    Effect.gen(function* () {
      const projects = yield* ProjectionProjectRepository;
      const sql = yield* SqlClient.SqlClient;

      yield* projects.upsert({
        projectId: ProjectId.make("project-null-options"),
        title: "Null options project",
        workspaceRoot: "/tmp/project-null-options",
        defaultModelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.4",
        },
        defaultThreadEnvMode: null,
        autoPull: false,
        scripts: [],
        workspaceLayoutVersion: 0,
        workspaceLayout: [],
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        deletedAt: null,
      });

      const rows = yield* sql<{
        readonly defaultModelSelection: string | null;
      }>`
        SELECT default_model_selection_json AS "defaultModelSelection"
        FROM projection_projects
        WHERE project_id = 'project-null-options'
      `;
      const row = rows[0];
      if (!row) {
        return yield* Effect.die("Expected projection_projects row to exist.");
      }

      assert.strictEqual(
        row.defaultModelSelection,
        // @effect-diagnostics-next-line preferSchemaOverJson:off
        JSON.stringify({
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.4",
        }),
      );

      const persisted = yield* projects.getById({
        projectId: ProjectId.make("project-null-options"),
      });
      assert.deepStrictEqual(Option.getOrNull(persisted)?.defaultModelSelection, {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
      });
    }),
  );

  it.effect("stores and reads back the workspace layout version and entries as JSON", () =>
    Effect.gen(function* () {
      const projects = yield* ProjectionProjectRepository;
      const sql = yield* SqlClient.SqlClient;

      const layout = [
        {
          kind: "folder" as const,
          id: ProjectWorkspaceItemId.make("folder-1"),
          parentId: null,
          rank: "a",
          relativePath: "src",
        },
        {
          kind: "file" as const,
          id: ProjectWorkspaceItemId.make("file-1"),
          parentId: ProjectWorkspaceItemId.make("folder-1"),
          rank: "a",
          relativePath: "src/index.ts",
        },
      ];

      yield* projects.upsert({
        projectId: ProjectId.make("project-with-layout"),
        title: "Project with layout",
        workspaceRoot: "/tmp/project-with-layout",
        defaultModelSelection: null,
        defaultThreadEnvMode: null,
        autoPull: false,
        scripts: [],
        workspaceLayoutVersion: 3,
        workspaceLayout: layout,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        deletedAt: null,
      });

      const rows = yield* sql<{
        readonly workspaceLayoutVersion: number;
        readonly workspaceLayout: string;
      }>`
        SELECT
          workspace_layout_version AS "workspaceLayoutVersion",
          workspace_layout_json AS "workspaceLayout"
        FROM projection_projects
        WHERE project_id = 'project-with-layout'
      `;
      const row = rows[0];
      if (!row) {
        return yield* Effect.die("Expected projection_projects row to exist.");
      }
      assert.strictEqual(row.workspaceLayoutVersion, 3);
      // @effect-diagnostics-next-line preferSchemaOverJson:off
      assert.deepStrictEqual(JSON.parse(row.workspaceLayout), layout);

      const persisted = yield* projects.getById({
        projectId: ProjectId.make("project-with-layout"),
      });
      const persistedProject = Option.getOrNull(persisted);
      assert.strictEqual(persistedProject?.workspaceLayoutVersion, 3);
      assert.deepStrictEqual(persistedProject?.workspaceLayout, layout);
    }),
  );

  it.effect(
    "defaults workspace layout version to 0 and layout to empty when omitted by an older writer",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        // Simulates a row written before migration 033's DEFAULT-backed
        // columns existed, by inserting through the legacy column set only.
        yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, default_model_selection_json,
          scripts_json, created_at, updated_at, deleted_at
        ) VALUES (
          'project-legacy-row', 'Legacy row', '/tmp/project-legacy-row', NULL,
          '[]', '2026-03-24T00:00:00.000Z', '2026-03-24T00:00:00.000Z', NULL
        )
      `;

        const projects = yield* ProjectionProjectRepository;
        const persisted = yield* projects.getById({
          projectId: ProjectId.make("project-legacy-row"),
        });
        const persistedProject = Option.getOrNull(persisted);
        assert.strictEqual(persistedProject?.workspaceLayoutVersion, 0);
        assert.deepStrictEqual(persistedProject?.workspaceLayout, []);
      }),
  );

  it.effect("stores JSON for thread model options", () =>
    Effect.gen(function* () {
      const threads = yield* ProjectionThreadRepository;
      const sql = yield* SqlClient.SqlClient;

      yield* threads.upsert({
        threadId: ThreadId.make("thread-null-options"),
        projectId: ProjectId.make("project-null-options"),
        title: "Null options thread",
        modelSelection: {
          instanceId: ProviderInstanceId.make("claudeAgent"),
          model: "claude-opus-4-6",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurnId: null,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        unsettledAt: null,
        snoozedUntil: null,
        snoozedAt: null,
        pinnedAt: null,
        latestUserMessageAt: null,
        pendingApprovalCount: 0,
        pendingUserInputCount: 0,
        hasActionableProposedPlan: 0,
        deletedAt: null,
      });

      const rows = yield* sql<{
        readonly modelSelection: string | null;
      }>`
        SELECT model_selection_json AS "modelSelection"
        FROM projection_threads
        WHERE thread_id = 'thread-null-options'
      `;
      const row = rows[0];
      if (!row) {
        return yield* Effect.die("Expected projection_threads row to exist.");
      }

      assert.strictEqual(
        row.modelSelection,
        // @effect-diagnostics-next-line preferSchemaOverJson:off
        JSON.stringify({
          instanceId: ProviderInstanceId.make("claudeAgent"),
          model: "claude-opus-4-6",
        }),
      );

      const persisted = yield* threads.getById({
        threadId: ThreadId.make("thread-null-options"),
      });
      assert.deepStrictEqual(Option.getOrNull(persisted)?.modelSelection, {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        model: "claude-opus-4-6",
      });
    }),
  );

  it.effect("round-trips non-null settlement values through the thread row", () =>
    Effect.gen(function* () {
      const threads = yield* ProjectionThreadRepository;

      yield* threads.upsert({
        threadId: ThreadId.make("thread-settled"),
        projectId: ProjectId.make("project-1"),
        title: "Settled thread",
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.4",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurnId: null,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-25T00:00:00.000Z",
        archivedAt: null,
        settledOverride: "settled",
        settledAt: "2026-03-25T00:00:00.000Z",
        unsettledAt: null,
        snoozedUntil: "2026-03-26T09:00:00.000Z",
        snoozedAt: "2026-03-25T00:00:00.000Z",
        pinnedAt: "2026-03-25T00:00:00.000Z",
        latestUserMessageAt: null,
        pendingApprovalCount: 0,
        pendingUserInputCount: 0,
        hasActionableProposedPlan: 0,
        deletedAt: null,
      });

      const persisted = yield* threads.getById({
        threadId: ThreadId.make("thread-settled"),
      });
      const row = Option.getOrNull(persisted);
      if (!row) {
        return yield* Effect.die("Expected settled projection_threads row to exist.");
      }
      assert.strictEqual(row.settledOverride, "settled");
      assert.strictEqual(row.settledAt, "2026-03-25T00:00:00.000Z");
      assert.strictEqual(row.snoozedUntil, "2026-03-26T09:00:00.000Z");
      assert.strictEqual(row.snoozedAt, "2026-03-25T00:00:00.000Z");
      assert.strictEqual(row.pinnedAt, "2026-03-25T00:00:00.000Z");

      // Un-settle to the keep-active pin and wake the snooze; confirm the
      // flips persist.
      yield* threads.upsert({
        ...row,
        settledOverride: "active",
        settledAt: null,
        unsettledAt: "2026-03-26T00:00:00.000Z",
        snoozedUntil: null,
        snoozedAt: null,
        pinnedAt: null,
      });
      const repersisted = yield* threads.getById({
        threadId: ThreadId.make("thread-settled"),
      });
      const updated = Option.getOrNull(repersisted);
      assert.strictEqual(updated?.settledOverride, "active");
      assert.strictEqual(updated?.settledAt, null);
      assert.strictEqual(updated?.unsettledAt, "2026-03-26T00:00:00.000Z");
      assert.strictEqual(updated?.snoozedUntil, null);
      assert.strictEqual(updated?.snoozedAt, null);
      assert.strictEqual(updated?.pinnedAt, null);
    }),
  );

  it.effect("round-trips manual and branch pull requests through the thread row", () =>
    Effect.gen(function* () {
      const threads = yield* ProjectionThreadRepository;
      const linkedPullRequest = {
        projectId: ProjectId.make("project-linked-pr"),
        repository: "pingdotgg/t3code",
        number: 42,
        url: "https://github.com/pingdotgg/t3code/pull/42",
      };
      const branchPullRequest = {
        ...linkedPullRequest,
        number: 43,
        url: "https://github.com/pingdotgg/t3code/pull/43",
      };

      yield* threads.upsert({
        threadId: ThreadId.make("thread-linked-pr"),
        projectId: ProjectId.make("project-linked-pr"),
        title: "Linked pull request",
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.4",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        linkedPullRequest,
        branchPullRequest,
        latestTurnId: null,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        unsettledAt: null,
        snoozedUntil: null,
        snoozedAt: null,
        pinnedAt: null,
        latestUserMessageAt: null,
        pendingApprovalCount: 0,
        pendingUserInputCount: 0,
        hasActionableProposedPlan: 0,
        deletedAt: null,
      });

      const persisted = yield* threads.getById({ threadId: ThreadId.make("thread-linked-pr") });
      assert.deepStrictEqual(Option.getOrNull(persisted)?.linkedPullRequest, linkedPullRequest);
      assert.deepStrictEqual(Option.getOrNull(persisted)?.branchPullRequest, branchPullRequest);

      const listed = yield* threads.listByProjectId({ projectId: linkedPullRequest.projectId });
      assert.deepStrictEqual(listed[0]?.branchPullRequest, branchPullRequest);

      const row = Option.getOrNull(persisted);
      if (row === null) return yield* Effect.die("Expected linked thread row to exist.");
      yield* threads.upsert({ ...row, linkedPullRequest: null });

      const cleared = yield* threads.getById({ threadId: ThreadId.make("thread-linked-pr") });
      assert.strictEqual(Option.getOrNull(cleared)?.linkedPullRequest, null);
      assert.deepStrictEqual(Option.getOrNull(cleared)?.branchPullRequest, branchPullRequest);

      yield* threads.upsert({ ...row, branchPullRequest: null });
      const branchCleared = yield* threads.getById({ threadId: row.threadId });
      assert.strictEqual(Option.getOrNull(branchCleared)?.branchPullRequest, null);
      assert.deepStrictEqual(Option.getOrNull(branchCleared)?.linkedPullRequest, linkedPullRequest);
    }),
  );
});
