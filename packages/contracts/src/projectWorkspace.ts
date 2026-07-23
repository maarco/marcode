import * as Schema from "effect/Schema";

import {
  CommandId,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

/**
 * Identifier for one entry in a physical project's persisted sidebar layout.
 *
 * Unique within a single physical project layout. Attachment and shortcut
 * entries use the ambient UUID convention; resource references are
 * deterministic so a synthetic node and its materialized entry share an id:
 * - thread: `thread:<threadId>`
 * - command: `command:<scriptId>`
 */
export const ProjectWorkspaceItemId = TrimmedNonEmptyString.pipe(
  Schema.brand("ProjectWorkspaceItemId"),
);
export type ProjectWorkspaceItemId = typeof ProjectWorkspaceItemId.Type;

/** Starts at 0, increments once per accepted layout command. */
export const ProjectWorkspaceLayoutVersion = NonNegativeInt;
export type ProjectWorkspaceLayoutVersion = typeof ProjectWorkspaceLayoutVersion.Type;

/** Lexically comparable fractional rank used for stable sibling ordering. */
export const ProjectWorkspaceRank = TrimmedNonEmptyString;
export type ProjectWorkspaceRank = typeof ProjectWorkspaceRank.Type;

export const makeThreadWorkspaceItemId = (threadId: string): ProjectWorkspaceItemId =>
  `thread:${threadId}` as ProjectWorkspaceItemId;

export const makeCommandWorkspaceItemId = (scriptId: string): ProjectWorkspaceItemId =>
  `command:${scriptId}` as ProjectWorkspaceItemId;

const EntryBaseFields = {
  id: ProjectWorkspaceItemId,
  parentId: Schema.NullOr(ProjectWorkspaceItemId),
  rank: ProjectWorkspaceRank,
} as const;

export const ProjectWorkspaceFileEntry = Schema.Struct({
  ...EntryBaseFields,
  kind: Schema.Literal("file"),
  relativePath: TrimmedNonEmptyString,
  label: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectWorkspaceFileEntry = typeof ProjectWorkspaceFileEntry.Type;

export const ProjectWorkspaceFolderEntry = Schema.Struct({
  ...EntryBaseFields,
  kind: Schema.Literal("folder"),
  relativePath: TrimmedNonEmptyString,
  label: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectWorkspaceFolderEntry = typeof ProjectWorkspaceFolderEntry.Type;

export const ProjectWorkspaceThreadEntry = Schema.Struct({
  ...EntryBaseFields,
  kind: Schema.Literal("thread"),
  threadId: ThreadId,
});
export type ProjectWorkspaceThreadEntry = typeof ProjectWorkspaceThreadEntry.Type;

export const ProjectWorkspaceCommandEntry = Schema.Struct({
  ...EntryBaseFields,
  kind: Schema.Literal("command"),
  scriptId: TrimmedNonEmptyString,
});
export type ProjectWorkspaceCommandEntry = typeof ProjectWorkspaceCommandEntry.Type;

export const ProjectWorkspaceUrlEntry = Schema.Struct({
  ...EntryBaseFields,
  kind: Schema.Literal("url"),
  label: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
});
export type ProjectWorkspaceUrlEntry = typeof ProjectWorkspaceUrlEntry.Type;

export const ProjectWorkspaceEntry = Schema.Union([
  ProjectWorkspaceFileEntry,
  ProjectWorkspaceFolderEntry,
  ProjectWorkspaceThreadEntry,
  ProjectWorkspaceCommandEntry,
  ProjectWorkspaceUrlEntry,
]);
export type ProjectWorkspaceEntry = typeof ProjectWorkspaceEntry.Type;

export const ProjectWorkspaceEntryKind = Schema.Literals([
  "file",
  "folder",
  "thread",
  "command",
  "url",
]);
export type ProjectWorkspaceEntryKind = typeof ProjectWorkspaceEntryKind.Type;

/** Path attachment kinds. Threads/commands/urls are placed, not attached. */
export const ProjectWorkspacePathKind = Schema.Literals(["file", "folder"]);
export type ProjectWorkspacePathKind = typeof ProjectWorkspacePathKind.Type;

export const ProjectWorkspaceLayoutOperation = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("attach-path"),
    entry: Schema.Union([ProjectWorkspaceFileEntry, ProjectWorkspaceFolderEntry]),
  }),
  Schema.Struct({
    type: Schema.Literal("add-url"),
    entry: ProjectWorkspaceUrlEntry,
  }),
  Schema.Struct({
    type: Schema.Literal("place-resource"),
    resource: Schema.Union([
      Schema.Struct({ kind: Schema.Literal("thread"), threadId: ThreadId }),
      Schema.Struct({ kind: Schema.Literal("command"), scriptId: TrimmedNonEmptyString }),
    ]),
    parentId: Schema.NullOr(ProjectWorkspaceItemId),
    beforeId: Schema.NullOr(ProjectWorkspaceItemId),
  }),
  Schema.Struct({
    type: Schema.Literal("move"),
    itemId: ProjectWorkspaceItemId,
    parentId: Schema.NullOr(ProjectWorkspaceItemId),
    beforeId: Schema.NullOr(ProjectWorkspaceItemId),
  }),
  Schema.Struct({
    type: Schema.Literal("rename"),
    itemId: ProjectWorkspaceItemId,
    label: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("remove"),
    itemId: ProjectWorkspaceItemId,
  }),
]);
export type ProjectWorkspaceLayoutOperation = typeof ProjectWorkspaceLayoutOperation.Type;

export const ProjectWorkspaceLayoutApplyCommand = Schema.Struct({
  type: Schema.Literal("project.workspace-layout.apply"),
  commandId: CommandId,
  projectId: ProjectId,
  expectedVersion: ProjectWorkspaceLayoutVersion,
  operation: ProjectWorkspaceLayoutOperation,
});
export type ProjectWorkspaceLayoutApplyCommand = typeof ProjectWorkspaceLayoutApplyCommand.Type;

export const ProjectWorkspaceLayoutAppliedPayload = Schema.Struct({
  projectId: ProjectId,
  operation: ProjectWorkspaceLayoutOperation,
  layoutVersion: ProjectWorkspaceLayoutVersion,
  updatedAt: TrimmedNonEmptyString,
});
export type ProjectWorkspaceLayoutAppliedPayload = typeof ProjectWorkspaceLayoutAppliedPayload.Type;

/**
 * Client-facing rejection reasons. The server maps its internal invariant
 * errors onto these tags so the web client can render a specific message and
 * decide between refresh-and-retry and a hard stop.
 */
export const ProjectWorkspaceLayoutErrorTag = Schema.Literals([
  "version-conflict",
  "cycle",
  "missing-target",
  "duplicate-path",
  "cross-project",
  "invalid-parent",
  "invalid-path",
  "not-persistent",
]);
export type ProjectWorkspaceLayoutErrorTag = typeof ProjectWorkspaceLayoutErrorTag.Type;

export const ProjectWorkspaceLayoutRejection = Schema.Struct({
  tag: ProjectWorkspaceLayoutErrorTag,
  message: TrimmedNonEmptyString,
  /** Present on `version-conflict` so the client can resync without a full refetch. */
  currentVersion: Schema.optional(ProjectWorkspaceLayoutVersion),
});
export type ProjectWorkspaceLayoutRejection = typeof ProjectWorkspaceLayoutRejection.Type;

export const EMPTY_PROJECT_WORKSPACE_LAYOUT: ReadonlyArray<ProjectWorkspaceEntry> = [];
export const INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION = 0;
