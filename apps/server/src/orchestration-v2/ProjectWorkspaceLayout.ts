/**
 * Marcode-owned: unified workspace tree sidebar layout rules.
 *
 * Pure, synchronous domain logic for `project.workspace-layout.apply` and the
 * `project.workspace-layout-applied` event. Ported from the pre-v2
 * `orchestration/commandInvariants.ts` + `decider.ts`; the rules are unchanged.
 * `ProjectCommands.ts` calls `decideWorkspaceLayoutOperation` (validate +
 * normalize), `ProjectStore.ts` calls `applyWorkspaceLayoutOperation` and the
 * pruning helpers when it projects events, so the invariant and placement
 * rules live in exactly one place.
 *
 * Rank determinism is load-bearing: `move`/`place-resource` events do not carry
 * a computed rank on the wire, the projection re-derives it from the same
 * prior layout the decision validated against.
 */
import {
  makeCommandWorkspaceItemId,
  makeThreadWorkspaceItemId,
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
import * as Result from "effect/Result";

export interface WorkspaceLayoutRejection {
  readonly tag: ProjectWorkspaceLayoutErrorTag;
  readonly message: string;
  readonly currentVersion?: ProjectWorkspaceLayoutVersion;
}

/**
 * The wire convention the client parses back out of the error message
 * (`parseProjectWorkspaceLayoutRejection` in packages/client-runtime): a JSON
 * object of `{tag, message, currentVersion?}`.
 */
export const workspaceLayoutRejectionDetail = (rejection: WorkspaceLayoutRejection): string =>
  JSON.stringify(rejection);

/** What the planner needs to know about state outside the project being edited. */
export interface WorkspaceLayoutLookups {
  /** The thread named by a `place-resource` thread operation; undefined when unknown or deleted. */
  readonly thread?: { readonly projectId: ProjectId; readonly deleted: boolean } | undefined;
  /** Layouts of every other project, used only to tell "missing" from "cross-project". */
  readonly otherProjectLayouts?: ReadonlyArray<{
    readonly projectId: ProjectId;
    readonly layout: ReadonlyArray<ProjectWorkspaceEntry>;
  }>;
}

export interface WorkspaceLayoutProjectState {
  readonly projectId: ProjectId;
  readonly scripts: ReadonlyArray<ProjectScript>;
  readonly workspaceLayout: ReadonlyArray<ProjectWorkspaceEntry>;
  readonly workspaceLayoutVersion: ProjectWorkspaceLayoutVersion;
}

// Live terminal/browser nodes are synthetic, never persisted entries.
const LIVE_TERMINAL_PREFIX = "terminal:";
const LIVE_BROWSER_PREFIX = "browser:";

export const isLiveWorkspaceResourceItemId = (id: string): boolean =>
  id.startsWith(LIVE_TERMINAL_PREFIX) || id.startsWith(LIVE_BROWSER_PREFIX);

/**
 * Normalizes a client-supplied workspace-relative path. Returns `null` for
 * empty, absolute, or root-escaping paths. Pure string logic: the decision
 * must not touch the filesystem.
 */
export function normalizeWorkspaceRelativePath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) return null;
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    trimmed.startsWith("\\\\") ||
    /^[a-zA-Z]:[/\\]/.test(trimmed)
  ) {
    return null;
  }
  const resolved: string[] = [];
  for (const segment of trimmed.split(/[/\\]+/)) {
    if (segment.length === 0 || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.length === 0 ? null : resolved.join("/");
}

export const findWorkspaceLayoutEntryById = (
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  itemId: ProjectWorkspaceItemId,
): ProjectWorkspaceEntry | undefined => layout.find((entry) => entry.id === itemId);

/** Commands and URL shortcuts are leaves; every other kind can host children. */
const isContainerKind = (kind: ProjectWorkspaceEntry["kind"]): boolean =>
  kind !== "command" && kind !== "url";

const sortByRank = (
  entries: ReadonlyArray<ProjectWorkspaceEntry>,
): ReadonlyArray<ProjectWorkspaceEntry> =>
  entries.toSorted((left, right) =>
    left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0,
  );

/** All descendant ids of `rootId`, not including `rootId` itself. */
export function collectWorkspaceLayoutDescendantIds(
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  rootId: ProjectWorkspaceItemId,
): ReadonlySet<ProjectWorkspaceItemId> {
  const childrenByParentId = new Map<ProjectWorkspaceItemId, ProjectWorkspaceItemId[]>();
  for (const entry of layout) {
    if (entry.parentId === null) continue;
    const children = childrenByParentId.get(entry.parentId) ?? [];
    children.push(entry.id);
    childrenByParentId.set(entry.parentId, children);
  }
  const descendants = new Set<ProjectWorkspaceItemId>();
  const stack = [...(childrenByParentId.get(rootId) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || descendants.has(next)) continue;
    descendants.add(next);
    stack.push(...(childrenByParentId.get(next) ?? []));
  }
  return descendants;
}

/**
 * Rank for placing/moving an item under `parentId`, immediately before
 * `beforeId` (or last when null). `excludeItemId` omits the moving item from
 * the sibling scan.
 */
export function computeWorkspaceLayoutPlacementRank(input: {
  readonly layout: ReadonlyArray<ProjectWorkspaceEntry>;
  readonly parentId: ProjectWorkspaceItemId | null;
  readonly beforeId: ProjectWorkspaceItemId | null;
  readonly excludeItemId?: ProjectWorkspaceItemId;
}): string {
  const siblings = sortByRank(
    input.layout.filter(
      (entry) => entry.parentId === input.parentId && entry.id !== input.excludeItemId,
    ),
  );
  if (input.beforeId === null) return rankBetween(siblings.at(-1)?.rank ?? null, null);
  const beforeIndex = siblings.findIndex((entry) => entry.id === input.beforeId);
  if (beforeIndex === -1) {
    // Defensive: validated callers always find beforeId. Stay total rather than throw.
    return rankBetween(siblings.at(-1)?.rank ?? null, null);
  }
  const before = siblings[beforeIndex]!;
  const after = beforeIndex > 0 ? siblings[beforeIndex - 1] : undefined;
  return rankBetween(after?.rank ?? null, before.rank);
}

/**
 * Removes `itemId` (no-op when absent). Its direct children are reparented to
 * its own parent, appended after that parent's existing children in their
 * original order, so no child is orphaned and ranks cannot collide.
 */
export function removeWorkspaceLayoutEntryById(
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  itemId: ProjectWorkspaceItemId,
): ReadonlyArray<ProjectWorkspaceEntry> {
  const target = layout.find((entry) => entry.id === itemId);
  if (!target) return layout;
  const remaining = layout.filter((entry) => entry.id !== itemId);
  const directChildren = sortByRank(remaining.filter((entry) => entry.parentId === itemId));
  if (directChildren.length === 0) return remaining;

  const grandparentId = target.parentId;
  let previousRank =
    sortByRank(remaining.filter((entry) => entry.parentId === grandparentId)).at(-1)?.rank ?? null;
  const reparentedById = new Map<ProjectWorkspaceItemId, ProjectWorkspaceEntry>();
  for (const child of directChildren) {
    const nextRank = rankBetween(previousRank, null);
    reparentedById.set(child.id, { ...child, parentId: grandparentId, rank: nextRank });
    previousRank = nextRank;
  }
  return remaining.map((entry) => reparentedById.get(entry.id) ?? entry);
}

/** Lifecycle pruning for project script edits: a dropped script prunes its command entry. */
export function pruneRemovedScriptEntries(input: {
  readonly layout: ReadonlyArray<ProjectWorkspaceEntry>;
  readonly previousScripts: ReadonlyArray<ProjectScript>;
  readonly nextScripts: ReadonlyArray<ProjectScript>;
}): ReadonlyArray<ProjectWorkspaceEntry> {
  return input.previousScripts
    .filter((script) => !input.nextScripts.some((next) => next.id === script.id))
    .reduce(
      (layout, script) =>
        removeWorkspaceLayoutEntryById(layout, makeCommandWorkspaceItemId(script.id)),
      input.layout,
    );
}

export const pruneThreadEntry = (
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  threadId: ThreadId,
): ReadonlyArray<ProjectWorkspaceEntry> =>
  removeWorkspaceLayoutEntryById(layout, makeThreadWorkspaceItemId(threadId));

const resourceItemIdOf = (
  resource: Extract<ProjectWorkspaceLayoutOperation, { type: "place-resource" }>["resource"],
): ProjectWorkspaceItemId =>
  resource.kind === "thread"
    ? makeThreadWorkspaceItemId(resource.threadId)
    : makeCommandWorkspaceItemId(resource.scriptId);

/**
 * Applies a validated (decision-normalized) operation to a layout. Shared by
 * every projection path so each applies the identical mutation to identical
 * prior state.
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
      const itemId = resourceItemIdOf(operation.resource);
      const rank = computeWorkspaceLayoutPlacementRank({
        layout,
        parentId: operation.parentId,
        beforeId: operation.beforeId,
        excludeItemId: itemId,
      });
      if (findWorkspaceLayoutEntryById(layout, itemId)) {
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
        if (entry.id !== operation.itemId) return entry;
        // Decision already rejects thread/command renames; keep the spread type-safe.
        if (entry.kind === "thread" || entry.kind === "command") return entry;
        return { ...entry, label: operation.label };
      });

    case "remove":
      return removeWorkspaceLayoutEntryById(layout, operation.itemId);
  }
}

type Rejected = WorkspaceLayoutRejection | undefined;

const reject = (
  tag: ProjectWorkspaceLayoutErrorTag,
  message: string,
): WorkspaceLayoutRejection => ({ tag, message });

/** Candidate parent (null = project root, always valid). */
function checkParent(
  project: WorkspaceLayoutProjectState,
  lookups: WorkspaceLayoutLookups,
  parentId: ProjectWorkspaceItemId | null,
): Rejected {
  if (parentId === null) return undefined;
  if (isLiveWorkspaceResourceItemId(parentId)) {
    return reject(
      "not-persistent",
      `'${parentId}' is a live terminal/browser node and cannot be used as a parent.`,
    );
  }
  const local = findWorkspaceLayoutEntryById(project.workspaceLayout, parentId);
  if (!local) {
    const elsewhere = lookups.otherProjectLayouts?.find(
      (other) => findWorkspaceLayoutEntryById(other.layout, parentId) !== undefined,
    );
    return elsewhere
      ? reject(
          "cross-project",
          `Parent '${parentId}' belongs to a different project ('${elsewhere.projectId}').`,
        )
      : reject("missing-target", `Parent '${parentId}' does not exist.`);
  }
  return isContainerKind(local.kind)
    ? undefined
    : reject("invalid-parent", `'${parentId}' is a ${local.kind} entry and cannot have children.`);
}

/** Self-parenting and moving an item under one of its own descendants. */
function checkNoCycle(
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  itemId: ProjectWorkspaceItemId,
  parentId: ProjectWorkspaceItemId | null,
): Rejected {
  if (parentId === null) return undefined;
  if (parentId === itemId) return reject("cycle", `Item '${itemId}' cannot be its own parent.`);
  return collectWorkspaceLayoutDescendantIds(layout, itemId).has(parentId)
    ? reject(
        "cycle",
        `'${parentId}' is a descendant of '${itemId}' and cannot become its new parent.`,
      )
    : undefined;
}

/** `beforeId` (null = "at the end") must exist and share the resulting parent. */
function checkBeforeSharesParent(
  layout: ReadonlyArray<ProjectWorkspaceEntry>,
  beforeId: ProjectWorkspaceItemId | null,
  resultingParentId: ProjectWorkspaceItemId | null,
): Rejected {
  if (beforeId === null) return undefined;
  if (isLiveWorkspaceResourceItemId(beforeId)) {
    return reject(
      "not-persistent",
      `'${beforeId}' is a live terminal/browser node and cannot be used as beforeId.`,
    );
  }
  const beforeEntry = findWorkspaceLayoutEntryById(layout, beforeId);
  if (!beforeEntry) return reject("missing-target", `beforeId '${beforeId}' does not exist.`);
  return beforeEntry.parentId === resultingParentId
    ? undefined
    : reject("invalid-parent", `beforeId '${beforeId}' does not share the resulting parent.`);
}

/**
 * Validates one `project.workspace-layout.apply` operation against the
 * project's current layout and returns the operation to embed in the event.
 * `attach-path` comes back with its normalized relative path; every other
 * operation passes through unchanged.
 */
export function decideWorkspaceLayoutOperation(input: {
  readonly project: WorkspaceLayoutProjectState;
  readonly expectedVersion: ProjectWorkspaceLayoutVersion;
  readonly operation: ProjectWorkspaceLayoutOperation;
  readonly lookups?: WorkspaceLayoutLookups;
}): Result.Result<ProjectWorkspaceLayoutOperation, WorkspaceLayoutRejection> {
  const { project, operation } = input;
  const lookups = input.lookups ?? {};
  const layout = project.workspaceLayout;
  const fail = (rejection: WorkspaceLayoutRejection) => Result.fail(rejection);

  if (project.workspaceLayoutVersion !== input.expectedVersion) {
    return fail({
      tag: "version-conflict",
      message: `Expected workspace layout version ${input.expectedVersion} but the current version is ${project.workspaceLayoutVersion}.`,
      currentVersion: project.workspaceLayoutVersion,
    });
  }

  switch (operation.type) {
    case "attach-path": {
      const normalized = normalizeWorkspaceRelativePath(operation.entry.relativePath);
      if (normalized === null) {
        return fail(
          reject(
            "invalid-path",
            `'${operation.entry.relativePath}' is not a valid workspace-relative path.`,
          ),
        );
      }
      const badParent = checkParent(project, lookups, operation.entry.parentId);
      if (badParent) return fail(badParent);
      const duplicate = layout.find(
        (entry) =>
          (entry.kind === "file" || entry.kind === "folder") && entry.relativePath === normalized,
      );
      if (duplicate) {
        return fail(
          reject(
            "duplicate-path",
            `'${normalized}' is already attached (existing item '${duplicate.id}').`,
          ),
        );
      }
      return Result.succeed({
        ...operation,
        entry: { ...operation.entry, relativePath: normalized },
      });
    }

    case "add-url": {
      const badParent = checkParent(project, lookups, operation.entry.parentId);
      return badParent ? fail(badParent) : Result.succeed(operation);
    }

    case "place-resource": {
      const badParent = checkParent(project, lookups, operation.parentId);
      if (badParent) return fail(badParent);
      if (operation.resource.kind === "thread") {
        const thread = lookups.thread;
        if (!thread || thread.deleted) {
          return fail(
            reject(
              "missing-target",
              `Thread '${operation.resource.threadId}' does not exist or has been deleted.`,
            ),
          );
        }
        if (thread.projectId !== project.projectId) {
          return fail(
            reject(
              "cross-project",
              `Thread '${operation.resource.threadId}' belongs to a different project ('${thread.projectId}').`,
            ),
          );
        }
      } else {
        const scriptId = operation.resource.scriptId;
        if (!project.scripts.some((script) => script.id === scriptId)) {
          return fail(
            reject(
              "missing-target",
              `Script '${scriptId}' does not exist on project '${project.projectId}'.`,
            ),
          );
        }
      }
      const badCycle = checkNoCycle(
        layout,
        resourceItemIdOf(operation.resource),
        operation.parentId,
      );
      if (badCycle) return fail(badCycle);
      const badBefore = checkBeforeSharesParent(layout, operation.beforeId, operation.parentId);
      return badBefore ? fail(badBefore) : Result.succeed(operation);
    }

    case "move": {
      if (isLiveWorkspaceResourceItemId(operation.itemId)) {
        return fail(
          reject(
            "not-persistent",
            `'${operation.itemId}' is a live terminal/browser node and cannot be moved.`,
          ),
        );
      }
      if (!findWorkspaceLayoutEntryById(layout, operation.itemId)) {
        return fail(reject("missing-target", `Item '${operation.itemId}' does not exist.`));
      }
      if (operation.beforeId !== null && operation.beforeId === operation.itemId) {
        return fail(
          reject("invalid-parent", `Item '${operation.itemId}' cannot be placed before itself.`),
        );
      }
      const bad =
        checkParent(project, lookups, operation.parentId) ??
        checkNoCycle(layout, operation.itemId, operation.parentId) ??
        checkBeforeSharesParent(layout, operation.beforeId, operation.parentId);
      return bad ? fail(bad) : Result.succeed(operation);
    }

    case "rename": {
      const existing = findWorkspaceLayoutEntryById(layout, operation.itemId);
      if (!existing) {
        return fail(reject("missing-target", `Item '${operation.itemId}' does not exist.`));
      }
      // Thread rename goes through thread metadata, command rename through the script editor.
      if (existing.kind === "thread" || existing.kind === "command") {
        return fail(
          reject(
            "missing-target",
            `'${existing.id}' is a ${existing.kind} entry; rename it through its own ${
              existing.kind === "thread" ? "thread rename" : "command edit"
            } flow instead.`,
          ),
        );
      }
      return Result.succeed(operation);
    }

    case "remove": {
      return findWorkspaceLayoutEntryById(layout, operation.itemId)
        ? Result.succeed(operation)
        : fail(reject("missing-target", `Item '${operation.itemId}' does not exist.`));
    }
  }
}
