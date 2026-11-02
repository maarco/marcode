import * as Migrator from "effect/sql/Migrator";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import Migration0001 from "./Migrations/001_OrchestrationEvents.ts";
import Migration0002 from "./Migrations/002_OrchestrationCommandReceipts.ts";
import Migration0003 from "./Migrations/003_CheckpointDiffBlobs.ts";
import Migration0004 from "./Migrations/004_ProviderSessionRuntime.ts";
import Migration0005 from "./Migrations/005_Projections.ts";
import Migration0006 from "./Migrations/006_ProjectionThreadSessionRuntimeModeColumns.ts";
import Migration0007 from "./Migrations/007_ProjectionThreadMessageAttachments.ts";
import Migration0008 from "./Migrations/008_ProjectionThreadActivitySequence.ts";
import Migration0009 from "./Migrations/009_ProviderSessionRuntimeMode.ts";
import Migration0010 from "./Migrations/010_ProjectionThreadsRuntimeMode.ts";
import Migration0011 from "./Migrations/011_OrchestrationThreadCreatedRuntimeMode.ts";
import Migration0012 from "./Migrations/012_ProjectionThreadsInteractionMode.ts";
import Migration0013 from "./Migrations/013_ProjectionThreadProposedPlans.ts";
import Migration0014 from "./Migrations/014_ProjectionThreadProposedPlanImplementation.ts";
import Migration0015 from "./Migrations/015_ProjectionTurnsSourceProposedPlan.ts";
import Migration0016 from "./Migrations/016_CanonicalizeModelSelections.ts";
import Migration0017 from "./Migrations/017_ProjectionThreadsArchivedAt.ts";
import Migration0018 from "./Migrations/018_ProjectionThreadsArchivedAtIndex.ts";
import Migration0019 from "./Migrations/019_ProjectionSnapshotLookupIndexes.ts";
import Migration0020 from "./Migrations/020_AuthAccessManagement.ts";
import Migration0021 from "./Migrations/021_AuthSessionClientMetadata.ts";
import Migration0022 from "./Migrations/022_AuthSessionLastConnectedAt.ts";
import Migration0023 from "./Migrations/023_ProjectionThreadShellSummary.ts";
import Migration0024 from "./Migrations/024_BackfillProjectionThreadShellSummary.ts";
import Migration0025 from "./Migrations/025_CleanupInvalidProjectionPendingApprovals.ts";
import Migration0026 from "./Migrations/026_CanonicalizeModelSelectionOptions.ts";
import Migration0027 from "./Migrations/027_ProviderSessionRuntimeInstanceId.ts";
import Migration0028 from "./Migrations/028_ProjectionThreadSessionInstanceId.ts";
import Migration0029 from "./Migrations/029_ProjectionThreadDetailOrderingIndexes.ts";
import Migration0030 from "./Migrations/030_ProjectionThreadShellArchiveIndexes.ts";
import Migration0031 from "./Migrations/031_AuthAuthorizationScopes.ts";
import Migration0032 from "./Migrations/032_AuthPairingProofKeyThumbprint.ts";
import Migration0033 from "./Migrations/033_ProjectWorkspaceLayout.ts";
import Migration0034 from "./Migrations/034_ProjectionThreadsSettled.ts";
import Migration0035 from "./Migrations/035_ProjectionThreadsSnoozed.ts";
import Migration0036 from "./Migrations/036_ProjectionThreadTitleRegeneration.ts";
import Migration0037 from "./Migrations/037_ProjectionThreadsPinned.ts";
import Migration0038 from "./Migrations/038_ProjectionTurnsKeysetIndex.ts";
import Migration0039 from "./Migrations/039_ProjectionThreadsPinOrderKey.ts";
import Migration0040 from "./Migrations/040_ProjectionProjectsDefaultThreadEnvMode.ts";
import Migration0041 from "./Migrations/041_ProjectionProjectFaviconPath.ts";
import Migration0042 from "./Migrations/042_AuthSessionClientConnection.ts";
import Migration0043 from "./Migrations/043_ProjectionThreadLinkedPullRequest.ts";
import Migration0044 from "./Migrations/044_ProjectionThreadsUnsettledAt.ts";
import Migration0045 from "./Migrations/045_ClearAutomaticProjectModelDefaults.ts";
import Migration0046 from "./Migrations/046_ProjectionProjectsAutoPull.ts";
import Migration0047 from "./Migrations/047_RepairAutomaticSettlementTimestamps.ts";
import Migration0048 from "./Migrations/048_ProjectionProjectIcon.ts";
import Migration0049 from "./Migrations/049_ProjectionThreadBranchPullRequest.ts";
import Migration0050 from "./Migrations/050_ProjectionThreadsActiveOrderKey.ts";
import Migration0051 from "./Migrations/051_ProjectionThreadPullRequests.ts";
import Migration0052 from "./Migrations/052_ProjectionThreadMessageContext.ts";
import Migration0053 from "./Migrations/053_ProjectionThreadTitleState.ts";
import Migration0054 from "./Migrations/054_PullRequestFilesViewed.ts";
import Migration0055 from "./Migrations/055_ProjectionThreadsAutoSettleDisabledAt.ts";
// Upstream 055-076 arrive at Marcode ids 056-077 (+1 offset after 033), filenames keep the upstream number.
import Migration0056 from "./Migrations/055_OrchestrationV2.ts";
import Migration0057 from "./Migrations/056_RemoveRedundantProjectionIndexes.ts";
import Migration0058 from "./Migrations/057_ScheduledTaskWebhooks.ts";
import Migration0059 from "./Migrations/058_WebhookRelayDeliveries.ts";
import Migration0060 from "./Migrations/059_McpAppModelContext.ts";
import Migration0061 from "./Migrations/060_ThreadSnapshotWindowIndexes.ts";
import Migration0062 from "./Migrations/061_PullRequestReviewGuides.ts";
import Migration0063 from "./Migrations/062_ThreadFailureLookupIndex.ts";
import Migration0064 from "./Migrations/063_DropUnusedV1Projections.ts";
import Migration0065 from "./Migrations/064_CanonicalizeThreadPullRequestLinks.ts";
import Migration0066 from "./Migrations/065_CodexUsageNativeTurnIndex.ts";
import Migration0067 from "./Migrations/066_RepairClientSettlementTimestamps.ts";
import Migration0068 from "./Migrations/067_WebhookDedupe.ts";
import Migration0069 from "./Migrations/068_ShellStopRequestIndex.ts";
import Migration0070 from "./Migrations/069_ThreadMessageSearch.ts";
import Migration0071 from "./Migrations/070_PeerLinks.ts";
import Migration0072 from "./Migrations/071_PeerLinkFence.ts";
import Migration0073 from "./Migrations/072_WaitingLinkRequestIndex.ts";
import Migration0074 from "./Migrations/073_ActiveTurnItemIndexes.ts";
import Migration0075 from "./Migrations/074_ExcludeAttachmentPlaceholdersFromSearch.ts";
import Migration0076 from "./Migrations/075_SubagentDeliveryState.ts";
import Migration0077 from "./Migrations/076_ProjectionProjectsPinArchive.ts";
import { marcodeMigrationEntries } from "./marcodeMigrations.ts";

/**
 * Migration loader with all migrations defined inline.
 *
 * Key format: "{id}_{name}" where:
 * - id: numeric migration ID (determines execution order)
 * - name: descriptive name for the migration
 *
 * Uses Migrator.fromRecord which parses the key format and
 * returns migrations sorted by ID.
 */
// IDs 1-55 are frozen deployed history (including the old Marcode 033 collision) and must
// never be renumbered. Upstream additions append as deployed migrations at Marcode's +1 offset
// (upstream 055-076 are 056-077); new Marcode-only migrations use the 9000+ registry in
// marcodeMigrations.ts instead of being interleaved into this list.
const deployedMigrationEntries = [
  [1, "OrchestrationEvents", Migration0001],
  [2, "OrchestrationCommandReceipts", Migration0002],
  [3, "CheckpointDiffBlobs", Migration0003],
  [4, "ProviderSessionRuntime", Migration0004],
  [5, "Projections", Migration0005],
  [6, "ProjectionThreadSessionRuntimeModeColumns", Migration0006],
  [7, "ProjectionThreadMessageAttachments", Migration0007],
  [8, "ProjectionThreadActivitySequence", Migration0008],
  [9, "ProviderSessionRuntimeMode", Migration0009],
  [10, "ProjectionThreadsRuntimeMode", Migration0010],
  [11, "OrchestrationThreadCreatedRuntimeMode", Migration0011],
  [12, "ProjectionThreadsInteractionMode", Migration0012],
  [13, "ProjectionThreadProposedPlans", Migration0013],
  [14, "ProjectionThreadProposedPlanImplementation", Migration0014],
  [15, "ProjectionTurnsSourceProposedPlan", Migration0015],
  [16, "CanonicalizeModelSelections", Migration0016],
  [17, "ProjectionThreadsArchivedAt", Migration0017],
  [18, "ProjectionThreadsArchivedAtIndex", Migration0018],
  [19, "ProjectionSnapshotLookupIndexes", Migration0019],
  [20, "AuthAccessManagement", Migration0020],
  [21, "AuthSessionClientMetadata", Migration0021],
  [22, "AuthSessionLastConnectedAt", Migration0022],
  [23, "ProjectionThreadShellSummary", Migration0023],
  [24, "BackfillProjectionThreadShellSummary", Migration0024],
  [25, "CleanupInvalidProjectionPendingApprovals", Migration0025],
  [26, "CanonicalizeModelSelectionOptions", Migration0026],
  [27, "ProviderSessionRuntimeInstanceId", Migration0027],
  [28, "ProjectionThreadSessionInstanceId", Migration0028],
  [29, "ProjectionThreadDetailOrderingIndexes", Migration0029],
  [30, "ProjectionThreadShellArchiveIndexes", Migration0030],
  [31, "AuthAuthorizationScopes", Migration0031],
  [32, "AuthPairingProofKeyThumbprint", Migration0032],
  [33, "ProjectWorkspaceLayout", Migration0033],
  [34, "ProjectionThreadsSettled", Migration0034],
  [35, "ProjectionThreadsSnoozed", Migration0035],
  [36, "ProjectionThreadTitleRegeneration", Migration0036],
  [37, "ProjectionThreadsPinned", Migration0037],
  [38, "ProjectionTurnsKeysetIndex", Migration0038],
  [39, "ProjectionThreadsPinOrderKey", Migration0039],
  [40, "ProjectionProjectsDefaultThreadEnvMode", Migration0040],
  [41, "ProjectionProjectFaviconPath", Migration0041],
  [42, "AuthSessionClientConnection", Migration0042],
  [43, "ProjectionThreadLinkedPullRequest", Migration0043],
  [44, "ProjectionThreadsUnsettledAt", Migration0044],
  [45, "ClearAutomaticProjectModelDefaults", Migration0045],
  [46, "ProjectionProjectsAutoPull", Migration0046],
  [47, "RepairAutomaticSettlementTimestamps", Migration0047],
  [48, "ProjectionProjectIcon", Migration0048],
  [49, "ProjectionThreadBranchPullRequest", Migration0049],
  [50, "ProjectionThreadsActiveOrderKey", Migration0050],
  [51, "ProjectionThreadPullRequests", Migration0051],
  [52, "ProjectionThreadMessageContext", Migration0052],
  [53, "ProjectionThreadTitleState", Migration0053],
  [54, "PullRequestFilesViewed", Migration0054],
  [55, "ProjectionThreadsAutoSettleDisabledAt", Migration0055],
  // Preserve this migration's schema. Future V2 schema changes need new migrations.
  [56, "OrchestrationV2", Migration0056],
  [57, "RemoveRedundantProjectionIndexes", Migration0057],
  [58, "ScheduledTaskWebhooks", Migration0058],
  [59, "WebhookRelayDeliveries", Migration0059],
  [60, "McpAppModelContext", Migration0060],
  [61, "ThreadSnapshotWindowIndexes", Migration0061],
  [62, "PullRequestReviewGuides", Migration0062],
  [63, "ThreadFailureLookupIndex", Migration0063],
  [64, "DropUnusedV1Projections", Migration0064],
  [65, "CanonicalizeThreadPullRequestLinks", Migration0065],
  [66, "CodexUsageNativeTurnIndex", Migration0066],
  [67, "RepairClientSettlementTimestamps", Migration0067],
  [68, "WebhookDedupe", Migration0068],
  [69, "ShellStopRequestIndex", Migration0069],
  [70, "ThreadMessageSearch", Migration0070],
  [71, "PeerLinks", Migration0071],
  [72, "PeerLinkFence", Migration0072],
  [73, "WaitingLinkRequestIndex", Migration0073],
  [74, "ActiveTurnItemIndexes", Migration0074],
  [75, "ExcludeAttachmentPlaceholdersFromSearch", Migration0075],
  [76, "SubagentDeliveryState", Migration0076],
  [77, "ProjectionProjectsPinArchive", Migration0077],
] as const;

export const migrationEntries = [...deployedMigrationEntries, ...marcodeMigrationEntries] as const;

export const migrationManifest = migrationEntries.map(([id, name]) => [id, name] as const);

const makeMigrationLoader = (throughId?: number) =>
  Migrator.fromRecord(
    Object.fromEntries(
      migrationEntries
        .filter(([id]) => throughId === undefined || id <= throughId)
        .map(([id, name, migration]) => [`${id}_${name}`, migration]),
    ),
  );

// Upstream 055 (OrchestrationV2) is Marcode id 056: Marcode ids run +1 after 033.
const FIRST_V2_MIGRATION_ID = 56;

// The migrator only runs ids above the highest recorded id, and Marcode installs may record ids
// far above 77 (9000+ registry). Ids 56+ that are not recorded at all are therefore applied by
// `applyUnrecordedMigrationsBelowLatest`; only an id recorded under a DIFFERENT name is a real
// collision (a database written by another build) and is rejected here.
const assertV2MigrationsCanRun = Effect.fn("assertV2MigrationsCanRun")(function* (
  throughId?: number,
) {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
  `;
  if (tables.length === 0) return;
  const recorded = yield* sql<{
    readonly migration_id: number;
    readonly name: string;
  }>`SELECT migration_id, name FROM effect_sql_migrations`;
  const latestRecordedId = Math.max(0, ...recorded.map((row) => row.migration_id));
  const recordedNames = new Map(recorded.map((row) => [row.migration_id, row.name]));
  const skipped = migrationEntries.flatMap(([id, name]) => {
    if (
      id < FIRST_V2_MIGRATION_ID ||
      id > latestRecordedId ||
      (throughId !== undefined && id > throughId)
    )
      return [];
    const recordedName = recordedNames.get(id);
    if (recordedName === undefined || recordedName === name) return [];
    return [`${id}_${name} (recorded: ${recordedName})`];
  });
  if (skipped.length === 0) return;
  return yield* new Migrator.MigrationError({
    kind: "BadState",
    message: `This database's migration history collides with required schema migrations: ${skipped.join(", ")}. Those ids are already recorded under other names, so this build cannot apply its own migrations at those ids. It was probably written by a different build. Start the build that wrote it, or report this migration history so an upgrade path can be added.`,
  });
});

// Runs every migration with id >= FIRST_V2_MIGRATION_ID that is unrecorded but lower than the
// highest recorded id, which the migrator itself would skip forever. Each runs exactly once: its
// row is inserted in the same transaction, so the next start sees it recorded.
const applyUnrecordedMigrationsBelowLatest = Effect.fn("applyUnrecordedMigrationsBelowLatest")(
  function* (throughId?: number) {
    const sql = yield* SqlClient.SqlClient;
    const tables = yield* sql`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
    `;
    if (tables.length === 0) return [];
    const recorded = yield* sql<{
      readonly migration_id: number;
    }>`SELECT migration_id FROM effect_sql_migrations`;
    const recordedIds = new Set(recorded.map((row) => row.migration_id));
    const latestRecordedId = Math.max(0, ...recordedIds);
    const pending = migrationEntries.filter(
      ([id]) =>
        id >= FIRST_V2_MIGRATION_ID &&
        id < latestRecordedId &&
        !recordedIds.has(id) &&
        (throughId === undefined || id <= throughId),
    );
    if (pending.length === 0) return [];
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const [id, name, migration] of pending) {
          yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${id}, ${name})`;
          // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- migrations fail with arbitrary errors, re-wrapped as MigrationError below.
          yield* (migration as Effect.Effect<unknown, unknown, SqlClient.SqlClient>).pipe(
            Effect.catch((error) =>
              Effect.die(
                new Migrator.MigrationError({
                  cause: error,
                  kind: "Failed",
                  message: `Migration "${id}_${name}" failed`,
                }),
              ),
            ),
          );
        }
        return pending.map(([id, name]) => [id, name] as const);
      }),
    );
  },
);

const run = Migrator.make({});

export interface RunMigrationsOptions {
  readonly toMigrationInclusive?: number | undefined;
}

export const runMigrations = Effect.fn("runMigrations")(function* ({
  toMigrationInclusive,
}: RunMigrationsOptions = {}) {
  const includesV2 =
    toMigrationInclusive === undefined || toMigrationInclusive >= FIRST_V2_MIGRATION_ID;
  if (includesV2) {
    yield* assertV2MigrationsCanRun(toMigrationInclusive);
  }
  const lowerMigrations = includesV2
    ? yield* applyUnrecordedMigrationsBelowLatest(toMigrationInclusive)
    : [];
  const executedMigrations = [
    ...lowerMigrations,
    ...(yield* run({ loader: makeMigrationLoader(toMigrationInclusive) })),
  ];
  const migrations = executedMigrations.map(([id, name]) => `${id}_${name}`);
  yield* migrations.length === 0
    ? Effect.logDebug("Database schema is current")
    : Effect.log("Migrations ran successfully").pipe(Effect.annotateLogs({ migrations }));

  const sql = yield* SqlClient.SqlClient;
  const recorded = yield* sql<{
    readonly migration_id: number;
    readonly name: string;
  }>`SELECT migration_id, name FROM effect_sql_migrations`;
  const manifestNames = new Map<number, string>(migrationEntries.map(([id, name]) => [id, name]));
  const divergent = recorded.flatMap((row) => {
    const expected = manifestNames.get(row.migration_id);
    if (expected === undefined) {
      return [`${row.migration_id}:${row.name} (unknown to this build)`];
    }
    return expected === row.name
      ? []
      : [`${row.migration_id}:${row.name} (this build: ${expected})`];
  });
  if (divergent.length > 0) {
    yield* Effect.logWarning(
      "Database migration history diverges from this build; recorded migration ids are skipped, not reconciled by name.",
    ).pipe(Effect.annotateLogs({ divergent }));
  }
  return executedMigrations;
});
