/**
 * Pure, deterministic merge of persisted workspace layout + live project
 * threads + project scripts + live terminals + live preview tabs + indexed
 * path health into the `UnifiedWorkspaceNode` tree the sidebar renders.
 *
 * Spec: docs/specs/unified-workspace-tree-sidebar.md §6.3, §7.
 *
 * No React import. No I/O — every live/runtime fact is passed in already
 * resolved by `useUnifiedWorkspaceProject.ts`.
 */
import {
  makeCommandWorkspaceItemId,
  makeThreadWorkspaceItemId,
  type ProjectScript,
  type ProjectWorkspaceEntry,
} from "@t3tools/contracts";
import type { SidebarThreadSortOrder } from "@t3tools/contracts/settings";
import { sortThreads } from "@t3tools/client-runtime/state/thread-sort";
import { resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";

import { faviconUrlForOrigin } from "~/lib/favicon";

import { compareUnifiedWorkspaceRanks, qualifyUnifiedWorkspaceNodeId } from "./treeOperations";
import type {
  UnifiedWorkspaceActivation,
  UnifiedWorkspaceDiagnostic,
  UnifiedWorkspaceNode,
  UnifiedWorkspaceStatus,
} from "./types";

export interface UnifiedWorkspaceThreadInput {
  readonly threadId: string;
  readonly title: string;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestUserMessageAt: string | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
}

export interface UnifiedWorkspaceTerminalInput {
  readonly threadId: string;
  readonly terminalId: string;
  /** Server-computed display title (`TerminalSummary.label`). */
  readonly label: string;
  readonly hasRunningSubprocess: boolean;
  readonly updatedAt: string;
  /** Discovered local-server port mapped to this terminal, if any. */
  readonly discoveredPort: number | null;
}

export interface UnifiedWorkspacePreviewTabInput {
  readonly threadId: string;
  readonly tabId: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly loading: boolean;
  readonly updatedAt: string;
}

export interface BuildUnifiedWorkspaceTreeInput {
  readonly environmentId: string;
  readonly projectId: string;
  readonly layout: readonly ProjectWorkspaceEntry[];
  readonly scripts: readonly ProjectScript[];
  readonly threads: readonly UnifiedWorkspaceThreadInput[];
  readonly terminals: readonly UnifiedWorkspaceTerminalInput[];
  readonly previewTabs: readonly UnifiedWorkspacePreviewTabInput[];
  readonly threadSortOrder: SidebarThreadSortOrder;
  /** Every currently-indexed project-relative path. `null` = index not loaded yet (assume healthy). */
  readonly knownPaths: ReadonlySet<string> | null;
}

export interface BuildUnifiedWorkspaceTreeResult {
  readonly roots: readonly UnifiedWorkspaceNode[];
  readonly diagnostics: readonly UnifiedWorkspaceDiagnostic[];
}

function entryCanHaveChildren(kind: ProjectWorkspaceEntry["kind"]): boolean {
  return kind === "file" || kind === "folder" || kind === "thread";
}

function basename(relativePath: string): string {
  const trimmed = relativePath.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
}

/** Dedupe by id, keeping the first occurrence (deterministic given array order). */
function dedupeEntries(
  layout: readonly ProjectWorkspaceEntry[],
  diagnostics: UnifiedWorkspaceDiagnostic[],
  qualify: (itemId: string) => string,
): Map<string, ProjectWorkspaceEntry> {
  const byId = new Map<string, ProjectWorkspaceEntry>();
  for (const entry of layout) {
    if (byId.has(entry.id)) {
      diagnostics.push({
        code: "duplicate-id",
        nodeId: qualify(entry.id),
        detail: `Duplicate workspace item id "${entry.id}"; keeping the first occurrence.`,
      });
      continue;
    }
    byId.set(entry.id, entry);
  }
  return byId;
}

/** Root-falls-back missing/invalid parents. Cycle-breaking happens separately, after this. */
function resolveEffectiveParents(
  entriesById: ReadonlyMap<string, ProjectWorkspaceEntry>,
  diagnostics: UnifiedWorkspaceDiagnostic[],
  qualify: (itemId: string) => string,
): Map<string, string | null> {
  const effectiveParents = new Map<string, string | null>();
  for (const entry of entriesById.values()) {
    if (entry.parentId === null) {
      effectiveParents.set(entry.id, null);
      continue;
    }
    const parentEntry = entriesById.get(entry.parentId);
    if (!parentEntry) {
      diagnostics.push({
        code: "missing-parent",
        nodeId: qualify(entry.id),
        detail: `Parent "${entry.parentId}" not found; falling back to project root.`,
      });
      effectiveParents.set(entry.id, null);
      continue;
    }
    if (!entryCanHaveChildren(parentEntry.kind)) {
      diagnostics.push({
        code: "invalid-target",
        nodeId: qualify(entry.id),
        detail: `Parent "${entry.parentId}" (${parentEntry.kind}) cannot have children; falling back to project root.`,
      });
      effectiveParents.set(entry.id, null);
      continue;
    }
    effectiveParents.set(entry.id, entry.parentId);
  }
  return effectiveParents;
}

/**
 * Mutates `effectiveParents` in place, forcing the first entry in each cycle
 * to root. Breaking one member is sufficient to break the whole cycle for
 * every other member (their walk now terminates through the fixed entry).
 */
function breakCycles(
  entriesById: ReadonlyMap<string, ProjectWorkspaceEntry>,
  effectiveParents: Map<string, string | null>,
  diagnostics: UnifiedWorkspaceDiagnostic[],
  qualify: (itemId: string) => string,
): void {
  for (const id of entriesById.keys()) {
    const seen = new Set<string>([id]);
    let current = effectiveParents.get(id) ?? null;
    let cyclic = false;
    while (current !== null) {
      if (seen.has(current)) {
        cyclic = true;
        break;
      }
      seen.add(current);
      current = effectiveParents.get(current) ?? null;
    }
    if (cyclic) {
      diagnostics.push({
        code: "cycle",
        nodeId: qualify(id),
        detail: "Placement cycle detected; falling back to project root.",
      });
      effectiveParents.set(id, null);
    }
  }
}

/**
 * Entries that must not render: stale thread/command references (deleted
 * underlying resource) and archived threads. Stale entries get a diagnostic;
 * archived threads are expected and silent. Either way their persisted
 * children are reparented (see `resolveDisplayParent`), never dropped.
 */
function computeHiddenEntries(
  entriesById: ReadonlyMap<string, ProjectWorkspaceEntry>,
  threadsById: ReadonlyMap<string, UnifiedWorkspaceThreadInput>,
  scriptsById: ReadonlyMap<string, ProjectScript>,
  diagnostics: UnifiedWorkspaceDiagnostic[],
  qualify: (itemId: string) => string,
): Set<string> {
  const hidden = new Set<string>();
  for (const entry of entriesById.values()) {
    if (entry.kind === "thread") {
      const thread = threadsById.get(entry.threadId);
      if (!thread || thread.deletedAt !== null) {
        hidden.add(entry.id);
        diagnostics.push({
          code: "stale-entry",
          nodeId: qualify(entry.id),
          detail: `Thread "${entry.threadId}" no longer exists; hiding placement and reparenting its children.`,
        });
        continue;
      }
      if (thread.archivedAt !== null) {
        hidden.add(entry.id);
      }
      continue;
    }
    if (entry.kind === "command" && !scriptsById.has(entry.scriptId)) {
      hidden.add(entry.id);
      diagnostics.push({
        code: "stale-entry",
        nodeId: qualify(entry.id),
        detail: `Command "${entry.scriptId}" no longer exists; hiding placement and reparenting its children.`,
      });
    }
  }
  return hidden;
}

/** Walks up past hidden ancestors (cycle-safe) to find the nearest visible parent, or root. */
function resolveDisplayParent(
  id: string,
  effectiveParents: ReadonlyMap<string, string | null>,
  hidden: ReadonlySet<string>,
): string | null {
  const seen = new Set<string>();
  let current = effectiveParents.get(id) ?? null;
  while (current !== null && hidden.has(current) && !seen.has(current)) {
    seen.add(current);
    current = effectiveParents.get(current) ?? null;
  }
  return current;
}

function groupByDisplayParent(
  entriesById: ReadonlyMap<string, ProjectWorkspaceEntry>,
  effectiveParents: ReadonlyMap<string, string | null>,
  hidden: ReadonlySet<string>,
): Map<string | null, ProjectWorkspaceEntry[]> {
  const groups = new Map<string | null, ProjectWorkspaceEntry[]>();
  for (const [id, entry] of entriesById) {
    if (hidden.has(id)) continue;
    const parent = resolveDisplayParent(id, effectiveParents, hidden);
    const list = groups.get(parent);
    if (list) list.push(entry);
    else groups.set(parent, [entry]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => compareUnifiedWorkspaceRanks(a.rank, b.rank));
  }
  return groups;
}

interface BuildContext {
  readonly environmentId: string;
  readonly qualify: (itemId: string) => string;
  readonly threadsById: ReadonlyMap<string, UnifiedWorkspaceThreadInput>;
  readonly scriptsById: ReadonlyMap<string, ProjectScript>;
  readonly childrenByParent: ReadonlyMap<string | null, ProjectWorkspaceEntry[]>;
  readonly terminalsByThread: ReadonlyMap<string, UnifiedWorkspaceTerminalInput[]>;
  readonly previewTabsByThread: ReadonlyMap<string, UnifiedWorkspacePreviewTabInput[]>;
  readonly knownPaths: ReadonlySet<string> | null;
}

type LiveChildEntry =
  | { readonly kind: "terminal"; readonly updatedAt: string; readonly localId: string }
  | { readonly kind: "browser"; readonly updatedAt: string; readonly localId: string };

function buildTerminalNode(
  terminal: UnifiedWorkspaceTerminalInput,
  threadId: string,
  parentId: string,
  depth: number,
  ctx: BuildContext,
): UnifiedWorkspaceNode {
  const itemId = `terminal:${ctx.environmentId}:${threadId}:${terminal.terminalId}`;
  const status: UnifiedWorkspaceStatus =
    terminal.discoveredPort !== null
      ? { kind: "port", port: terminal.discoveredPort }
      : {
          kind: "terminal",
          terminalId: terminal.terminalId,
          running: terminal.hasRunningSubprocess,
        };
  return {
    id: ctx.qualify(itemId),
    kind: "terminal",
    label: resolveTerminalSessionLabel(terminal.terminalId, { label: terminal.label }),
    parentId,
    depth,
    children: [],
    isLive: true,
    isBroken: false,
    canHaveChildren: false,
    canMove: false,
    canRename: false,
    canRemove: false,
    activation: { kind: "terminal", threadId, terminalId: terminal.terminalId },
    status,
  };
}

function buildBrowserNode(
  tab: UnifiedWorkspacePreviewTabInput,
  threadId: string,
  parentId: string,
  depth: number,
  ctx: BuildContext,
): UnifiedWorkspaceNode {
  const itemId = `browser:${ctx.environmentId}:${threadId}:${tab.tabId}`;
  const label = tab.title?.trim() || tab.url?.trim() || "New Tab";
  const iconUrl = tab.url ? (faviconUrlForOrigin(tab.url) ?? undefined) : undefined;
  return {
    id: ctx.qualify(itemId),
    kind: "browser",
    label,
    parentId,
    depth,
    children: [],
    isLive: true,
    isBroken: false,
    canHaveChildren: false,
    canMove: false,
    canRename: false,
    canRemove: false,
    activation: { kind: "browser", threadId, tabId: tab.tabId },
    status: { kind: "browser", tabId: tab.tabId, loading: tab.loading },
    ...(iconUrl ? { iconUrl } : {}),
    ...(tab.url ? { tooltip: tab.url } : {}),
  };
}

/** Terminal + browser children merged and ordered by update time, id tiebreak (spec §7 rule 5). */
function buildLiveChildrenForThread(
  threadId: string,
  parentId: string,
  depth: number,
  ctx: BuildContext,
): UnifiedWorkspaceNode[] {
  const terminals = ctx.terminalsByThread.get(threadId) ?? [];
  const tabs = ctx.previewTabsByThread.get(threadId) ?? [];
  const merged: LiveChildEntry[] = [
    ...terminals.map((t) => ({
      kind: "terminal" as const,
      updatedAt: t.updatedAt,
      localId: t.terminalId,
    })),
    ...tabs.map((t) => ({ kind: "browser" as const, updatedAt: t.updatedAt, localId: t.tabId })),
  ].toSorted(
    (a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.localId.localeCompare(b.localId),
  );

  return merged.map((entry) => {
    if (entry.kind === "terminal") {
      const terminal = terminals.find((t) => t.terminalId === entry.localId)!;
      return buildTerminalNode(terminal, threadId, parentId, depth, ctx);
    }
    const tab = tabs.find((t) => t.tabId === entry.localId)!;
    return buildBrowserNode(tab, threadId, parentId, depth, ctx);
  });
}

function buildEntryActivation(entry: ProjectWorkspaceEntry): UnifiedWorkspaceActivation {
  switch (entry.kind) {
    case "file":
      return { kind: "file", relativePath: entry.relativePath };
    case "folder":
      return { kind: "folder", relativePath: entry.relativePath };
    case "thread":
      return { kind: "thread", threadId: entry.threadId };
    case "command":
      return { kind: "command", scriptId: entry.scriptId };
    case "url":
      return { kind: "url", url: entry.url };
  }
}

function buildNode(
  entry: ProjectWorkspaceEntry,
  parentId: string | null,
  depth: number,
  ctx: BuildContext,
): UnifiedWorkspaceNode {
  const qualifiedId = ctx.qualify(entry.id);
  const childEntries = ctx.childrenByParent.get(entry.id) ?? [];
  const persistedChildren = childEntries.map((child) =>
    buildNode(child, qualifiedId, depth + 1, ctx),
  );

  let label: string;
  let status: UnifiedWorkspaceStatus | null = null;
  let isBroken = false;
  let iconUrl: string | undefined;
  let tooltip: string | undefined;
  let liveChildren: UnifiedWorkspaceNode[] = [];

  switch (entry.kind) {
    case "file":
    case "folder": {
      label = entry.label ?? basename(entry.relativePath);
      isBroken = ctx.knownPaths !== null && !ctx.knownPaths.has(entry.relativePath);
      tooltip = isBroken ? `Path not found: ${entry.relativePath}` : entry.relativePath;
      if (isBroken) status = { kind: "broken", relativePath: entry.relativePath };
      break;
    }
    case "thread": {
      const thread = ctx.threadsById.get(entry.threadId);
      label = thread?.title ?? entry.threadId;
      tooltip = label;
      if (thread) {
        status = {
          kind: "thread",
          threadId: entry.threadId,
          hasPendingApprovals: thread.hasPendingApprovals,
          hasPendingUserInput: thread.hasPendingUserInput,
        };
      }
      liveChildren = buildLiveChildrenForThread(entry.threadId, qualifiedId, depth + 1, ctx);
      break;
    }
    case "command": {
      const script = ctx.scriptsById.get(entry.scriptId);
      label = script?.name ?? entry.scriptId;
      tooltip = script?.command;
      break;
    }
    case "url": {
      label = entry.label;
      tooltip = entry.url;
      iconUrl = faviconUrlForOrigin(entry.url) ?? undefined;
      break;
    }
  }

  return {
    id: qualifiedId,
    kind: entry.kind,
    label,
    parentId,
    depth,
    children: [...persistedChildren, ...liveChildren],
    isLive: false,
    isBroken,
    canHaveChildren: entryCanHaveChildren(entry.kind),
    canMove: true,
    canRename: entry.kind === "file" || entry.kind === "folder" || entry.kind === "url",
    canRemove: entry.kind !== "thread",
    activation: buildEntryActivation(entry),
    status,
    ...(iconUrl ? { iconUrl } : {}),
    ...(tooltip ? { tooltip } : {}),
  };
}

function buildSyntheticThreadNode(
  thread: UnifiedWorkspaceThreadInput,
  ctx: BuildContext,
): UnifiedWorkspaceNode {
  const qualifiedId = ctx.qualify(makeThreadWorkspaceItemId(thread.threadId));
  return {
    id: qualifiedId,
    kind: "thread",
    label: thread.title,
    parentId: null,
    depth: 0,
    children: buildLiveChildrenForThread(thread.threadId, qualifiedId, 1, ctx),
    isLive: false,
    isBroken: false,
    canHaveChildren: true,
    canMove: true,
    canRename: false,
    canRemove: false,
    activation: { kind: "thread", threadId: thread.threadId },
    status: {
      kind: "thread",
      threadId: thread.threadId,
      hasPendingApprovals: thread.hasPendingApprovals,
      hasPendingUserInput: thread.hasPendingUserInput,
    },
    tooltip: thread.title,
  };
}

function buildSyntheticCommandNode(script: ProjectScript, ctx: BuildContext): UnifiedWorkspaceNode {
  return {
    id: ctx.qualify(makeCommandWorkspaceItemId(script.id)),
    kind: "command",
    label: script.name,
    parentId: null,
    depth: 0,
    children: [],
    isLive: false,
    isBroken: false,
    canHaveChildren: false,
    canMove: true,
    canRename: false,
    canRemove: true,
    activation: { kind: "command", scriptId: script.id },
    status: null,
    tooltip: script.command,
  };
}

export function buildUnifiedWorkspaceTree(
  input: BuildUnifiedWorkspaceTreeInput,
): BuildUnifiedWorkspaceTreeResult {
  const diagnostics: UnifiedWorkspaceDiagnostic[] = [];
  const qualify = (itemId: string) =>
    qualifyUnifiedWorkspaceNodeId(input.environmentId, input.projectId, itemId);

  const entriesById = dedupeEntries(input.layout, diagnostics, qualify);
  const effectiveParents = resolveEffectiveParents(entriesById, diagnostics, qualify);
  breakCycles(entriesById, effectiveParents, diagnostics, qualify);

  const threadsById = new Map(input.threads.map((thread) => [thread.threadId, thread]));
  const scriptsById = new Map(input.scripts.map((script) => [script.id, script]));
  const hidden = computeHiddenEntries(entriesById, threadsById, scriptsById, diagnostics, qualify);
  const childrenByParent = groupByDisplayParent(entriesById, effectiveParents, hidden);

  const placedThreadIds = new Set<string>();
  const placedScriptIds = new Set<string>();
  for (const [id, entry] of entriesById) {
    if (hidden.has(id)) continue;
    if (entry.kind === "thread") placedThreadIds.add(entry.threadId);
    if (entry.kind === "command") placedScriptIds.add(entry.scriptId);
  }

  const terminalsByThread = new Map<string, UnifiedWorkspaceTerminalInput[]>();
  for (const terminal of input.terminals) {
    const list = terminalsByThread.get(terminal.threadId);
    if (list) list.push(terminal);
    else terminalsByThread.set(terminal.threadId, [terminal]);
  }
  const previewTabsByThread = new Map<string, UnifiedWorkspacePreviewTabInput[]>();
  for (const tab of input.previewTabs) {
    const list = previewTabsByThread.get(tab.threadId);
    if (list) list.push(tab);
    else previewTabsByThread.set(tab.threadId, [tab]);
  }

  const ctx: BuildContext = {
    environmentId: input.environmentId,
    qualify,
    threadsById,
    scriptsById,
    childrenByParent,
    terminalsByThread,
    previewTabsByThread,
    knownPaths: input.knownPaths,
  };

  const rankedRoots = (childrenByParent.get(null) ?? []).map((entry) =>
    buildNode(entry, null, 0, ctx),
  );

  const unplacedThreads = input.threads.filter(
    (thread) =>
      thread.archivedAt === null &&
      thread.deletedAt === null &&
      !placedThreadIds.has(thread.threadId),
  );
  const sortedUnplacedThreads = sortThreads(
    unplacedThreads.map((thread) => ({ ...thread, id: thread.threadId })),
    input.threadSortOrder,
  );
  const syntheticThreadNodes = sortedUnplacedThreads.map((thread) =>
    buildSyntheticThreadNode(thread, ctx),
  );

  const unplacedScripts = input.scripts.filter((script) => !placedScriptIds.has(script.id));
  const syntheticCommandNodes = unplacedScripts.map((script) =>
    buildSyntheticCommandNode(script, ctx),
  );

  return {
    roots: [...rankedRoots, ...syntheticCommandNodes, ...syntheticThreadNodes],
    diagnostics,
  };
}
