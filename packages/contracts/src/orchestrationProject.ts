import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { RepositoryIdentity, ThreadEnvMode } from "./environment.ts";
import { ModelSelection } from "./modelSelection.ts";
import { ProjectScript, ReceivedProjectIcon } from "./project.ts";
// ── Marcode fork seam ── sidebar workspace layout rides on the project shell.
import {
  EMPTY_PROJECT_WORKSPACE_LAYOUT,
  INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION,
  ProjectWorkspaceEntry,
  ProjectWorkspaceLayoutVersion,
} from "./projectWorkspace.ts";

export const OrchestrationProjectShell = Schema.Struct({
  id: ProjectId,
  title: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  repositoryIdentity: Schema.optional(Schema.NullOr(RepositoryIdentity)),
  defaultModelSelection: Schema.NullOr(ModelSelection),
  defaultThreadEnvMode: Schema.optional(Schema.NullOr(ThreadEnvMode)),
  // Opt-in because background sync performs network I/O and may move the checkout.
  autoPull: Schema.optional(Schema.Boolean),
  faviconPath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  projectIcon: Schema.optional(Schema.NullOr(ReceivedProjectIcon)),
  scripts: Schema.Array(ProjectScript),
  // Pinned projects lead project pickers; archived ones leave them. Optional so older servers decode.
  pinnedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  archivedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  // Marcode: both decode with defaults so shells from older servers still decode.
  workspaceLayoutVersion: ProjectWorkspaceLayoutVersion.pipe(
    Schema.withDecodingDefault(Effect.succeed(INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION)),
  ),
  workspaceLayout: Schema.Array(ProjectWorkspaceEntry).pipe(
    Schema.withDecodingDefault(Effect.succeed(EMPTY_PROJECT_WORKSPACE_LAYOUT)),
  ),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrchestrationProjectShell = typeof OrchestrationProjectShell.Type;
