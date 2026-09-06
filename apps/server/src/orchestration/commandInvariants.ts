import {
  makeCommandWorkspaceItemId,
  makeThreadWorkspaceItemId,
  type OrchestrationCommand,
  type OrchestrationProject,
  type OrchestrationReadModel,
  type OrchestrationThread,
  type ProjectId,
  type ProjectScript,
  type ProjectWorkspaceEntry,
  type ProjectWorkspaceItemId,
  type ProjectWorkspaceLayoutErrorTag,
  type ProjectWorkspaceLayoutOperation,
  type ProjectWorkspaceLayoutVersion,
  type ThreadId,
} from "@t3tools/contracts";
import { rankBetween } from "@t3tools/shared/fractional-rank";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";
import * as Effect from "effect/Effect";

import { OrchestrationCommandInvariantError } from "./Errors.ts";

function invariantError(commandType: string, detail: string): OrchestrationCommandInvariantError {
  return new OrchestrationCommandInvariantError({
    commandType,
    detail,
  });
}

function findThreadById(
  readModel: OrchestrationReadModel,
  threadId: ThreadId,
): OrchestrationThread | undefined {
  return readModel.threads.find((thread) => thread.id === threadId);
}

export function findProjectById(
  readModel: OrchestrationReadModel,
  projectId: ProjectId,
): OrchestrationProject | undefined {
  return readModel.projects.find((project) => project.id === projectId);
}

export function listThreadsByProjectId(
  readModel: OrchestrationReadModel,
  projectId: ProjectId,
): ReadonlyArray<OrchestrationThread> {
  return readModel.threads.filter((thread) => thread.projectId === projectId);
}

export function requireProject(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly projectId: ProjectId;
}): Effect.Effect<OrchestrationProject, OrchestrationCommandInvariantError> {
  const project = findProjectById(input.readModel, input.projectId);
  if (project) {
    return Effect.succeed(project);
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Project '${input.projectId}' does not exist for command '${input.command.type}'.`,
    ),
  );
}

export function requireProjectAbsent(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly projectId: ProjectId;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (!findProjectById(input.readModel, input.projectId)) {
    return Effect.void;
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Project '${input.projectId}' already exists and cannot be created twice.`,
    ),
  );
}

export function requireActiveProjectWorkspaceRootAbsent(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly workspaceRoot: string;
  readonly exceptProjectId?: ProjectId;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  const normalizedWorkspaceRoot = normalizeProjectPathForComparison(input.workspaceRoot);
  const existingProject = input.readModel.projects.find(
    (project) =>
      project.deletedAt === null &&
      normalizeProjectPathForComparison(project.workspaceRoot) === normalizedWorkspaceRoot &&
      project.id !== input.exceptProjectId,
  );
  if (existingProject === undefined) {
    return Effect.void;
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Active project '${existingProject.id}' already exists for workspace root '${normalizedWorkspaceRoot}'.`,
    ),
  );
}

export function requireThread(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly threadId: ThreadId;
}): Effect.Effect<OrchestrationThread, OrchestrationCommandInvariantError> {
  const thread = findThreadById(input.readModel, input.threadId);
  if (thread) {
    return Effect.succeed(thread);
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Thread '${input.threadId}' does not exist for command '${input.command.type}'.`,
    ),
  );
}

export function requireThreadArchived(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly threadId: ThreadId;
}): Effect.Effect<OrchestrationThread, OrchestrationCommandInvariantError> {
  return requireThread(input).pipe(
    Effect.flatMap((thread) =>
      thread.archivedAt !== null
        ? Effect.succeed(thread)
        : Effect.fail(
            invariantError(
              input.command.type,
              `Thread '${input.threadId}' is not archived for command '${input.command.type}'.`,
            ),
          ),
    ),
  );
}

export function requireThreadNotArchived(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly threadId: ThreadId;
}): Effect.Effect<OrchestrationThread, OrchestrationCommandInvariantError> {
  return requireThread(input).pipe(
    Effect.flatMap((thread) =>
      thread.archivedAt === null
        ? Effect.succeed(thread)
        : Effect.fail(
            invariantError(
              input.command.type,
              `Thread '${input.threadId}' is already archived and cannot handle command '${input.command.type}'.`,
            ),
          ),
    ),
  );
}

export function requireThreadAbsent(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly threadId: ThreadId;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  // Thread deletion is a soft delete and a draft keeps its client-minted id
  // across retries, so only a live row blocks creation. Projectors reset the
  // thread's rows when the id is created again.
  const existing = findThreadById(input.readModel, input.threadId);
  if (existing === undefined || existing.deletedAt !== null) {
    return Effect.void;
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Thread '${input.threadId}' already exists and cannot be created twice.`,
    ),
  );
}
// --- Workspace layout (unified workspace tree sidebar) ---
//
// Shared, pure domain logic for `project.workspace-layout.apply` /
// `project.workspace-layout-applied`. Both the decider (validate + emit) and
// the projector (in-memory read model + SQL projection, for lifecycle
// pruning and for re-deriving server-computed ranks) call into these same
// helpers so the invariant/placement rules live in exactly one place.

/** Live terminal/browser nodes are synthetic — never persisted entries. */
const WORKSPACE_LAYOUT_LIVE_TERMINAL_PREFIX = "terminal:";
const WORKSPACE_LAYOUT_LIVE_BROWSER_PREFIX = "browser:";

export function isLiveWorkspaceResourceItemId(id: string): boolean {
  return (
    id.startsWith(WORKSPACE_LAYOUT_LIVE_TERMINAL_PREFIX) ||
    id.startsWith(WORKSPACE_LAYOUT_LIVE_BROWSER_PREFIX)
  );
}

/**
 * Encodes a structured workspace-layout rejection into the generic
 * `OrchestrationCommandInvariantError.detail` string.
 *
 * There is no dedicated typed error channel from decider invariant failures
 * through to the WS client — the wire error is the single generic
 * `OrchestrationDispatchCommandError` with a flat `message` string (see
 * `apps/server/src/ws.ts`'s `toDispatchCommandError`, which forwards
 * `Error#message`, and `OrchestrationCommandInvariantError`'s `message`
 * getter, which is `` `Orchestration command invariant failed (${commandType}): ${detail}` ``).
 * Reshaping that generic channel is out of this lane's owned paths
 * (`Errors.ts`/`ws.ts` belong to nobody's explicit lane here and touching
 * them would ripple past this pass's scope), so the tag/message/currentVersion
 * are carried as a JSON object that becomes `detail` verbatim.
 * `packages/client-runtime/src/operations/projectWorkspace.ts` parses this
 * same convention back out into a typed `ProjectWorkspaceLayoutRejection`.
 * Keep both sides in sync if this wire convention ever changes.
 */
export function workspaceLayoutRejectionDetail(rejection: {
  readonly tag: ProjectWorkspaceLayoutErrorTag;
  readonly message: string;
  readonly currentVersion?: ProjectWorkspaceLayoutVersion;
}): string {
  return JSON.stringify(rejection);
}

export function workspaceLayoutInvariantError(input: {
  readonly commandType: string;
  readonly tag: ProjectWorkspaceLayoutErrorTag;
  readonly message: string;
  readonly currentVersion?: ProjectWorkspaceLayoutVersion;
}): OrchestrationCommandInvariantError {
  return new OrchestrationCommandInvariantError({
    commandType: input.commandType,
    detail: workspaceLayoutRejectionDetail({
      tag: input.tag,
      message: input.message,
      ...(input.currentVersion !== undefined ? { currentVersion: input.currentVersion } : {}),
    }),
  });
}

/** Project must exist and not be soft-deleted. */
export function requireActiveProject(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly projectId: ProjectId;
}): Effect.Effect<OrchestrationProject, OrchestrationCommandInvariantError> {
  const project = findProjectById(input.readModel, input.projectId);
  if (project && project.deletedAt === null) {
    return Effect.succeed(project);
  }
  return Effect.fail(
    workspaceLayoutInvariantError({
      commandType: input.command.type,
      tag: "missing-target",
      message: `Project '${input.projectId}' does not exist or is not active.`,
    }),
  );
}

export function requireWorkspaceLayoutVersionMatch(input: {
  readonly command: OrchestrationCommand;
  readonly project: OrchestrationProject;
  readonly expectedVersion: ProjectWorkspaceLayoutVersion;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (input.project.workspaceLayoutVersion === input.expectedVersion) {
    return Effect.void;
  }
  return Effect.fail(
    workspaceLayoutInvariantError({
      commandType: input.command.type,
      tag: "version-conflict",
      message: `Expected workspace layout version ${input.expectedVersion} but the current version is ${input.project.workspaceLayoutVersion}.`,
      currentVersion: input.project.workspaceLayoutVersion,
    }),
  );
}

/**
 * Normalizes a client-supplied workspace-relative attachment path: splits on
 * both `/` and `\`, drops empty/`.` segments, resolves `..` against already
 * -collected segments, and returns `null` when the path is empty, absolute,
 * or escapes above the workspace root via `..`.
 *
 * Deliberately pure string logic only — does not touch the filesystem or
 * require the project's actual `workspaceRoot` value. The spec requires the
 * decider stay pure and not require the path to still exist on disk;
 * existence is the attach dialog's / broken-reference UI's concern, not this
 * invariant's.
 */
export function normalizeWorkspaceRelativePath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    trimmed.startsWith("\\\\") ||
    /^[a-zA-Z]:[/\\]/.test(trimmed)
  ) {
    return null;
  }

  const resolvedSegments: string[] = [];
  for (const segment of trimmed.split(/[/\\]+/)) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (resolvedSegments.length === 0) {
        return null;
      }
      resolvedSegments.pop();
      continue;
    }
    resolvedSegments.push(segment);
  }

  return resolvedSegments.length === 0 ? null : resolvedSegments.join("/");
}

export function findWorkspaceLayoutEntryById(
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  itemId: ProjectWorkspaceItemId,
): ProjectWorkspaceEntry | undefined {
  return layout.find((entry) => entry.id === itemId);
}

/** Searches every project's layout — used only to distinguish "missing" from "cross-project". */
export function findWorkspaceLayoutEntryInAnyProject(
  readModel: OrchestrationReadModel,
  itemId: ProjectWorkspaceItemId,
): { readonly projectId: ProjectId; readonly entry: ProjectWorkspaceEntry } | undefined {
  for (const project of readModel.projects) {
    const entry = findWorkspaceLayoutEntryById(project.workspaceLayout, itemId);
    if (entry) {
      return { projectId: project.id, entry };
    }
  }
  return undefined;
}

/** Commands and URL shortcuts are leaves in v1; every other kind can host children. */
export function isWorkspaceLayoutContainerKind(kind: ProjectWorkspaceEntry["kind"]): boolean {
  return kind !== "command" && kind !== "url";
}

function sortWorkspaceLayoutEntriesByRank(
  entries: ReadonlyArray<ProjectWorkspaceEntry>,
): ReadonlyArray<ProjectWorkspaceEntry> {
  return entries.toSorted((left, right) =>
    left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0,
  );
}

/**
 * Validates a candidate `parentId` (null means "project root", always
 * valid): rejects live terminal/browser ids, ids that don't exist anywhere,
 * ids that exist but in a different project's layout, and ids that exist in
 * this project but are a leaf kind (command/url) that cannot host children.
 */
export function requireValidWorkspaceLayoutParent(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly project: OrchestrationProject;
  readonly parentId: ProjectWorkspaceItemId | null;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (input.parentId === null) {
    return Effect.void;
  }
  if (isLiveWorkspaceResourceItemId(input.parentId)) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "not-persistent",
        message: `'${input.parentId}' is a live terminal/browser node and cannot be used as a parent.`,
      }),
    );
  }
  const localEntry = findWorkspaceLayoutEntryById(input.project.workspaceLayout, input.parentId);
  if (!localEntry) {
    const elsewhere = findWorkspaceLayoutEntryInAnyProject(input.readModel, input.parentId);
    if (elsewhere) {
      return Effect.fail(
        workspaceLayoutInvariantError({
          commandType: input.command.type,
          tag: "cross-project",
          message: `Parent '${input.parentId}' belongs to a different project ('${elsewhere.projectId}').`,
        }),
      );
    }
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "missing-target",
        message: `Parent '${input.parentId}' does not exist.`,
      }),
    );
  }
  if (!isWorkspaceLayoutContainerKind(localEntry.kind)) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "invalid-parent",
        message: `'${input.parentId}' is a ${localEntry.kind} entry and cannot have children.`,
      }),
    );
  }
  return Effect.void;
}

/** All descendant ids of `rootId` (children, grandchildren, ...), not including `rootId` itself. */
export function collectWorkspaceLayoutDescendantIds(
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  rootId: ProjectWorkspaceItemId,
): ReadonlySet<ProjectWorkspaceItemId> {
  const childrenByParentId = new Map<ProjectWorkspaceItemId, ProjectWorkspaceItemId[]>();
  for (const entry of layout) {
    if (entry.parentId === null) {
      continue;
    }
    const children = childrenByParentId.get(entry.parentId) ?? [];
    children.push(entry.id);
    childrenByParentId.set(entry.parentId, children);
  }

  const descendants = new Set<ProjectWorkspaceItemId>();
  const stack = [...(childrenByParentId.get(rootId) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || descendants.has(next)) {
      continue;
    }
    descendants.add(next);
    stack.push(...(childrenByParentId.get(next) ?? []));
  }
  return descendants;
}

/** Rejects self-parenting and moving an item under one of its own descendants. */
export function requireNoWorkspaceLayoutCycle(input: {
  readonly command: OrchestrationCommand;
  readonly layout: ReadonlyArray<ProjectWorkspaceEntry>;
  readonly itemId: ProjectWorkspaceItemId;
  readonly parentId: ProjectWorkspaceItemId | null;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (input.parentId === null) {
    return Effect.void;
  }
  if (input.parentId === input.itemId) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "cycle",
        message: `Item '${input.itemId}' cannot be its own parent.`,
      }),
    );
  }
  const descendants = collectWorkspaceLayoutDescendantIds(input.layout, input.itemId);
  if (descendants.has(input.parentId)) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "cycle",
        message: `'${input.parentId}' is a descendant of '${input.itemId}' and cannot become its new parent.`,
      }),
    );
  }
  return Effect.void;
}

/**
 * Validates `beforeId` (null is always valid — "at the end"): rejects live
 * ids, ids that don't exist, and ids that exist but resolve to a different
 * parent than `resultingParentId`. Returns the resolved before-entry (or
 * null) so callers can feed it straight into rank computation.
 */
export function requireWorkspaceLayoutBeforeSharesParent(input: {
  readonly command: OrchestrationCommand;
  readonly layout: ReadonlyArray<ProjectWorkspaceEntry>;
  readonly beforeId: ProjectWorkspaceItemId | null;
  readonly resultingParentId: ProjectWorkspaceItemId | null;
}): Effect.Effect<ProjectWorkspaceEntry | null, OrchestrationCommandInvariantError> {
  if (input.beforeId === null) {
    return Effect.succeed(null);
  }
  if (isLiveWorkspaceResourceItemId(input.beforeId)) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "not-persistent",
        message: `'${input.beforeId}' is a live terminal/browser node and cannot be used as beforeId.`,
      }),
    );
  }
  const beforeEntry = findWorkspaceLayoutEntryById(input.layout, input.beforeId);
  if (!beforeEntry) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "missing-target",
        message: `beforeId '${input.beforeId}' does not exist.`,
      }),
    );
  }
  if (beforeEntry.parentId !== input.resultingParentId) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "invalid-parent",
        message: `beforeId '${input.beforeId}' does not share the resulting parent.`,
      }),
    );
  }
  return Effect.succeed(beforeEntry);
}

/**
 * Computes the rank for placing/moving an item under `parentId`, immediately
 * before `beforeId` (or at the end of the sibling group when `beforeId` is
 * null). `excludeItemId` omits the item itself from the sibling scan — for
 * `move`/re-placement of an already-persisted entry, it must not be compared
 * against its own prior position.
 *
 * Pure and deterministic: given the same layout + parentId + beforeId, this
 * always returns the same rank. That determinism is load-bearing —
 * `move`/`place-resource` events do not carry a computed rank on the wire
 * (the frozen `ProjectWorkspaceLayoutOperation` schema has no field for it);
 * the projector re-derives the identical rank by calling this same function
 * against the same prior layout state the decider validated against.
 */
export function computeWorkspaceLayoutPlacementRank(input: {
  readonly layout: ReadonlyArray<ProjectWorkspaceEntry>;
  readonly parentId: ProjectWorkspaceItemId | null;
  readonly beforeId: ProjectWorkspaceItemId | null;
  readonly excludeItemId?: ProjectWorkspaceItemId;
}): string {
  const siblings = sortWorkspaceLayoutEntriesByRank(
    input.layout.filter(
      (entry) => entry.parentId === input.parentId && entry.id !== input.excludeItemId,
    ),
  );

  if (input.beforeId === null) {
    return rankBetween(siblings.at(-1)?.rank ?? null, null);
  }

  const beforeIndex = siblings.findIndex((entry) => entry.id === input.beforeId);
  if (beforeIndex === -1) {
    // Defensive fallback only — validated callers always find beforeId in
    // this exact sibling set. Keep this a total function rather than
    // throwing on a state that should already be unreachable.
    return rankBetween(siblings.at(-1)?.rank ?? null, null);
  }
  const before = siblings[beforeIndex]!;
  const after = beforeIndex > 0 ? siblings[beforeIndex - 1] : undefined;
  return rankBetween(after?.rank ?? null, before.rank);
}

export function findWorkspaceLayoutDuplicatePath(
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  normalizedRelativePath: string,
): ProjectWorkspaceEntry | undefined {
  return layout.find(
    (entry) =>
      (entry.kind === "file" || entry.kind === "folder") &&
      entry.relativePath === normalizedRelativePath,
  );
}

export function requireWorkspaceLayoutThreadTarget(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
}): Effect.Effect<OrchestrationThread, OrchestrationCommandInvariantError> {
  const thread = findThreadById(input.readModel, input.threadId);
  if (!thread || thread.deletedAt !== null) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "missing-target",
        message: `Thread '${input.threadId}' does not exist or has been deleted.`,
      }),
    );
  }
  if (thread.projectId !== input.projectId) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "cross-project",
        message: `Thread '${input.threadId}' belongs to a different project ('${thread.projectId}').`,
      }),
    );
  }
  return Effect.succeed(thread);
}

export function requireWorkspaceLayoutScriptTarget(input: {
  readonly command: OrchestrationCommand;
  readonly project: OrchestrationProject;
  readonly scriptId: string;
}): Effect.Effect<ProjectScript, OrchestrationCommandInvariantError> {
  const script = input.project.scripts.find((candidate) => candidate.id === input.scriptId);
  if (!script) {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "missing-target",
        message: `Script '${input.scriptId}' does not exist on project '${input.project.id}'.`,
      }),
    );
  }
  return Effect.succeed(script);
}

/**
 * Only file/folder/url entries carry a `label` field in the persisted union
 * — thread rename goes through `thread.meta.update` and command rename goes
 * through the project script editor, so those kinds are not eligible here.
 */
export function requireWorkspaceLayoutRenameableEntry(input: {
  readonly command: OrchestrationCommand;
  readonly entry: ProjectWorkspaceEntry;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (input.entry.kind === "thread" || input.entry.kind === "command") {
    return Effect.fail(
      workspaceLayoutInvariantError({
        commandType: input.command.type,
        tag: "missing-target",
        message: `'${input.entry.id}' is a ${input.entry.kind} entry; rename it through its own ${
          input.entry.kind === "thread" ? "thread rename" : "command edit"
        } flow instead.`,
      }),
    );
  }
  return Effect.void;
}

/**
 * Removes `itemId` from the layout (no-op if absent — deleting a thread/script
 * that was never placed is the common case). Reparents its direct children to
 * its own parent (the "grandparent"), appended after the grandparent's
 * existing children in the removed node's original child order, so:
 *  - no child is ever left pointing at a parentId that no longer exists;
 *  - the reparented children's relative order among themselves is preserved;
 *  - appending (rather than interleaving) can never collide with an existing
 *    sibling's rank.
 *
 * Used for both the explicit `remove` operation and server-side lifecycle
 * pruning (deleting a thread or a script prunes its layout entry).
 */
export function removeWorkspaceLayoutEntryById(
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  itemId: ProjectWorkspaceItemId,
): ReadonlyArray<ProjectWorkspaceEntry> {
  const target = layout.find((entry) => entry.id === itemId);
  if (!target) {
    return layout;
  }

  const remaining = layout.filter((entry) => entry.id !== itemId);
  const directChildren = sortWorkspaceLayoutEntriesByRank(
    remaining.filter((entry) => entry.parentId === itemId),
  );
  if (directChildren.length === 0) {
    return remaining;
  }

  const grandparentId = target.parentId;
  const existingGrandparentSiblings = sortWorkspaceLayoutEntriesByRank(
    remaining.filter((entry) => entry.parentId === grandparentId),
  );
  let previousRank = existingGrandparentSiblings.at(-1)?.rank ?? null;
  const reparentedById = new Map<ProjectWorkspaceItemId, ProjectWorkspaceEntry>();
  for (const child of directChildren) {
    const nextRank = rankBetween(previousRank, null);
    reparentedById.set(child.id, { ...child, parentId: grandparentId, rank: nextRank });
    previousRank = nextRank;
  }

  return remaining.map((entry) => reparentedById.get(entry.id) ?? entry);
}

/**
 * Applies a validated (decider-normalized) `ProjectWorkspaceLayoutOperation`
 * to a project's current layout, producing the new layout array.
 *
 * Pure and deterministic — shared by the in-memory read-model projector
 * (`projector.ts`, used within a single command-decide batch) and the
 * SQL-backed projection pipeline (`Layers/ProjectionPipeline.ts`), so both
 * apply the identical mutation given the identical prior state. This is what
 * makes it safe for `move`/`place-resource` to omit their server-computed
 * rank from the wire event: both projection paths recompute it here, from
 * the same prior layout the decider validated against.
 */
export function applyWorkspaceLayoutOperation(
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  operation: ProjectWorkspaceLayoutOperation,
): ReadonlyArray<ProjectWorkspaceEntry> {
  switch (operation.type) {
    case "attach-path":
    case "add-url":
      return [...layout, operation.entry];

    case "place-resource": {
      const itemId =
        operation.resource.kind === "thread"
          ? makeThreadWorkspaceItemId(operation.resource.threadId)
          : makeCommandWorkspaceItemId(operation.resource.scriptId);
      const rank = computeWorkspaceLayoutPlacementRank({
        layout,
        parentId: operation.parentId,
        beforeId: operation.beforeId,
        excludeItemId: itemId,
      });
      const existing = findWorkspaceLayoutEntryById(layout, itemId);
      if (existing) {
        return layout.map((entry) =>
          entry.id === itemId ? { ...entry, parentId: operation.parentId, rank } : entry,
        );
      }
      const newEntry: ProjectWorkspaceEntry =
        operation.resource.kind === "thread"
          ? {
              kind: "thread",
              id: itemId,
              parentId: operation.parentId,
              rank,
              threadId: operation.resource.threadId,
            }
          : {
              kind: "command",
              id: itemId,
              parentId: operation.parentId,
              rank,
              scriptId: operation.resource.scriptId,
            };
      return [...layout, newEntry];
    }

    case "move": {
      const rank = computeWorkspaceLayoutPlacementRank({
        layout,
        parentId: operation.parentId,
        beforeId: operation.beforeId,
        excludeItemId: operation.itemId,
      });
      return layout.map((entry) =>
        entry.id === operation.itemId ? { ...entry, parentId: operation.parentId, rank } : entry,
      );
    }

    case "rename":
      return layout.map((entry) => {
        if (entry.id !== operation.itemId) {
          return entry;
        }
        // Decider invariants (requireWorkspaceLayoutRenameableEntry) already
        // reject rename for thread/command kinds; this guard just keeps the
        // spread below type-safe without asserting it can't happen.
        if (entry.kind === "thread" || entry.kind === "command") {
          return entry;
        }
        return { ...entry, label: operation.label };
      });

    case "remove":
      return removeWorkspaceLayoutEntryById(layout, operation.itemId);
  }
}
