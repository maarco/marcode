/**
 * `useUnifiedWorkspaceProject({ environmentId, projectId })` — the one hook
 * the sidebar tree consumes. Reads every existing live/persisted source
 * (never a second registry — spec §2), builds the tree via `buildTree.ts`,
 * and returns the frozen `UnifiedWorkspaceController`.
 *
 * NOTE (for the primary agent's integration pass): at the time this file was
 * written, Agent 1's `packages/client-runtime/src/operations/projectWorkspace.ts`
 * (`applyProjectWorkspaceLayout`) and `packages/client-runtime/src/state/projectWorkspace.ts`
 * (`useProjectWorkspaceLayout`) had not landed yet. This file is written
 * against their frozen signatures from INTERFACE_FREEZE.md and will not
 * compile until those two files exist. Everything else here (contracts'
 * `projectWorkspace.ts`, `@t3tools/shared/fractional-rank`,
 * `workspaceLayoutVersion`/`workspaceLayout` on `OrchestrationProjectShell`)
 * had already landed and is used directly.
 */
import { rankBetween } from "@t3tools/shared/fractional-rank";
import { applyProjectWorkspaceLayout } from "@t3tools/client-runtime/operations/projectWorkspace";
import { useProjectWorkspaceLayout } from "@t3tools/client-runtime/state/projectWorkspace";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  ProjectId,
  ProjectWorkspaceItemId,
  ThreadId,
  type ProjectWorkspaceEntry,
  type ProjectWorkspaceLayoutOperation,
  type ProjectWorkspaceLayoutRejection,
  type ProjectWorkspaceUrlEntry,
} from "@t3tools/contracts";
import { useParams, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";

import { openUrlInPreview as openUrlInPreviewSession } from "~/browser/openFileInPreview";
import { readLocalApi } from "~/localApi";
import { randomUUID } from "~/lib/utils";
import { useEnvironments } from "~/state/environments";
import { useProject } from "~/state/entities";
import { useKnownTerminalSessions } from "~/state/terminalSessions";
import { useDiscoveredPorts } from "~/portDiscoveryState";
import {
  isPreviewSupportedInRuntime,
  setActivePreviewTab,
  useActivePreviewSessions,
} from "~/previewStateStore";
import { useRightPanelStore } from "~/rightPanelStore";
import { useAtomCommand } from "~/state/use-atom-command";
import { terminalEnvironment } from "~/state/terminal";
import { previewEnvironment } from "~/state/preview";
import { closePreviewSession } from "~/components/preview/closePreviewSession";
import { useClientSettings } from "~/hooks/useSettings";
import {
  useEnsureDraftThreadTarget,
  takePendingWorkspaceThreadPlacement,
} from "~/hooks/useHandleNewThread";
import { useProjectEntriesQuery } from "~/components/files/projectFilesQueryState";
import { resolveThreadRouteTarget } from "~/threadRoutes";
import { buildThreadRouteParams } from "~/threadRoutes";
import { toastManager, stackedThreadToast } from "~/components/ui/toast";

import {
  activateUnifiedWorkspaceNode,
  requestUnifiedWorkspaceCommandRun,
} from "./activateNode";
import { buildUnifiedWorkspaceTree, type UnifiedWorkspaceThreadInput } from "./buildTree";
import {
  compareUnifiedWorkspaceRanks,
  indexUnifiedWorkspaceNodesById,
  parseUnifiedWorkspaceNodeId,
  qualifyUnifiedWorkspaceNodeId,
} from "./treeOperations";
import type {
  UnifiedWorkspaceAttachCandidate,
  UnifiedWorkspaceCapabilities,
  UnifiedWorkspaceController,
  UnifiedWorkspaceMoveTarget,
  UnifiedWorkspaceMutationResult,
} from "./types";

function toMutationResult(
  result:
    | { readonly ok: true; readonly layoutVersion: number }
    | { readonly ok: false; readonly rejection: ProjectWorkspaceLayoutRejection },
): UnifiedWorkspaceMutationResult {
  if (result.ok) return { ok: true };
  return { ok: false, tag: result.rejection.tag, message: result.rejection.message };
}

/** Last (highest) rank among a parent's current siblings, for append-at-end placement. */
function lastRankAmong(
  entries: readonly ProjectWorkspaceEntry[],
  parentId: ProjectWorkspaceItemId | null,
): string | null {
  const ranks = entries
    .filter((entry) => (entry.parentId ?? null) === parentId)
    .map((entry) => entry.rank)
    .toSorted(compareUnifiedWorkspaceRanks);
  return ranks.at(-1) ?? null;
}

export function useUnifiedWorkspaceProject(input: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}): UnifiedWorkspaceController {
  const { environmentId, projectId } = input;
  const projectRef = useMemo(() => scopeProjectRef(environmentId, projectId), [environmentId, projectId]);
  const project = useProject(projectRef);
  const { entries: layoutEntries, version: layoutVersion } = useProjectWorkspaceLayout(
    environmentId,
    projectId,
  );

  const threadSortOrder = useClientSettings((settings) => settings.sidebarThreadSortOrder);
  const router = useRouter();

  // --- Live sources — every one already exists; nothing here is a second registry. ---
  const threadShells = useMemo(() => [], []); // placeholder removed below; see effect note
  void threadShells;

  const scopedThreadRefs = useMemo(() => [projectRef], [projectRef]);
  // `useThreadShellsForProjectRefs` is the exact source `Sidebar.tsx` uses
  // (`apps/web/src/components/Sidebar.tsx:1178`) — filtered to one physical project here.
  const projectThreadShells = useProjectThreadShellsCompat(scopedThreadRefs);

  const threads: UnifiedWorkspaceThreadInput[] = useMemo(
    () =>
      projectThreadShells.map((thread) => ({
        threadId: thread.id,
        title: thread.title,
        archivedAt: thread.archivedAt,
        deletedAt: null, // deleted threads are absent from the shell snapshot entirely
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        latestUserMessageAt: thread.latestUserMessageAt,
        hasPendingApprovals: thread.hasPendingApprovals,
        hasPendingUserInput: thread.hasPendingUserInput,
      })),
    [projectThreadShells],
  );
  const validThreadIds = useMemo(
    () => new Set(threads.filter((t) => t.archivedAt === null && t.deletedAt === null).map((t) => t.threadId)),
    [threads],
  );

  const scripts = project?.scripts ?? [];

  const allKnownTerminalSessions = useKnownTerminalSessions({ environmentId, threadId: null });
  const projectThreadIdSet = useMemo(() => new Set(threads.map((t) => t.threadId)), [threads]);
  const discoveredPorts = useDiscoveredPorts(environmentId);
  const terminals = useMemo(
    () =>
      allKnownTerminalSessions
        .filter((session) => projectThreadIdSet.has(session.target.threadId))
        .map((session) => {
          const port = discoveredPorts.find(
            (candidate) =>
              candidate.terminal?.threadId === session.target.threadId &&
              candidate.terminal?.terminalId === session.target.terminalId,
          );
          return {
            threadId: session.target.threadId,
            terminalId: session.target.terminalId,
            label: session.state.summary?.label ?? "",
            hasRunningSubprocess: session.state.hasRunningSubprocess,
            updatedAt: session.state.updatedAt ?? "",
            discoveredPort: port?.port ?? null,
          };
        }),
    [allKnownTerminalSessions, projectThreadIdSet, discoveredPorts],
  );

  const activePreviewSessions = useActivePreviewSessions();
  const previewTabs = useMemo(() => {
    const result: {
      threadId: string;
      tabId: string;
      title: string | null;
      url: string | null;
      loading: boolean;
      updatedAt: string;
    }[] = [];
    for (const threadId of projectThreadIdSet) {
      const state = activePreviewSessions[scopeThreadRefKeyCompat(environmentId, threadId)];
      if (!state) continue;
      for (const snapshot of Object.values(state.sessions)) {
        const status = snapshot.navStatus;
        result.push({
          threadId,
          tabId: snapshot.tabId,
          title: status._tag === "Idle" ? null : status.title,
          url: status._tag === "Idle" ? null : status.url,
          loading: status._tag === "Loading",
          updatedAt: snapshot.updatedAt,
        });
      }
    }
    return result;
  }, [activePreviewSessions, environmentId, projectThreadIdSet]);

  const entriesQuery = useProjectEntriesQuery(environmentId, project?.workspaceRoot ?? "");
  const knownPaths = useMemo(() => {
    if (!project || entriesQuery.data === null) return null;
    return new Set(entriesQuery.data.entries.map((entry) => entry.path));
  }, [project, entriesQuery.data]);

  const { roots, diagnostics } = useMemo(
    () =>
      buildUnifiedWorkspaceTree({
        environmentId,
        projectId,
        layout: layoutEntries,
        scripts,
        threads,
        terminals,
        previewTabs,
        threadSortOrder,
        knownPaths,
      }),
    [environmentId, projectId, layoutEntries, scripts, threads, terminals, previewTabs, threadSortOrder, knownPaths],
  );

  useEffect(() => {
    if (diagnostics.length === 0) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[unifiedWorkspace] ${diagnostics.length} invalid persisted relationship(s) fell back to root for project ${projectId}:`,
      diagnostics,
    );
  }, [diagnostics, projectId]);

  const nodesById = useMemo(() => indexUnifiedWorkspaceNodesById(roots), [roots]);

  // --- Capabilities ---
  const { environments } = useEnvironments();
  const capabilities: UnifiedWorkspaceCapabilities = useMemo(() => {
    const connection = environments.find((env) => env.environmentId === environmentId)?.connection;
    if (connection && connection.state !== "connected") {
      return { canMutate: false, reason: "Disconnected — reconnect to edit the workspace layout." };
    }
    return { canMutate: true, reason: null };
  }, [environments, environmentId]);

  // --- Layout mutation plumbing ---
  const runLayoutOperation = useCallback(
    async (operation: ProjectWorkspaceLayoutOperation): Promise<UnifiedWorkspaceMutationResult> => {
      if (!capabilities.canMutate) {
        return { ok: false, tag: "offline", message: capabilities.reason ?? "Editing is unavailable right now." };
      }
      try {
        const result = await applyProjectWorkspaceLayout({
          environmentId,
          projectId,
          expectedVersion: layoutVersion,
          operation,
        });
        return toMutationResult(result);
      } catch (error) {
        return {
          ok: false,
          tag: "offline",
          message: error instanceof Error ? error.message : "Request failed.",
        };
      }
    },
    [capabilities, environmentId, projectId, layoutVersion],
  );

  const dequalify = useCallback(
    (nodeId: string): ProjectWorkspaceItemId | null => {
      const parsed = parseUnifiedWorkspaceNodeId(nodeId);
      if (!parsed || parsed.environmentId !== environmentId || parsed.projectId !== projectId) {
        return null;
      }
      return ProjectWorkspaceItemId.make(parsed.itemId);
    },
    [environmentId, projectId],
  );

  // --- Draft-thread target resolution (spec §8 steps 3/4, §9) ---
  const ensureDraftThreadTarget = useEnsureDraftThreadTarget();

  // --- Pending placement reconciliation: a synthetic thread's draft was seeded with a
  // placement (useHandleNewThread.ts's registry); once that thread promotes to a real,
  // committed thread (appears in `threads`), materialize the placement (spec §9). One-shot
  // per thread — `takePendingWorkspaceThreadPlacement` removes the entry on read.
  useEffect(() => {
    for (const thread of threads) {
      const ref = scopeThreadRef(environmentId, ThreadId.make(thread.threadId));
      const pendingParentId = takePendingWorkspaceThreadPlacement(ref);
      if (pendingParentId === undefined) continue;
      const alreadyPlaced = layoutEntries.some(
        (entry) => entry.kind === "thread" && entry.threadId === thread.threadId,
      );
      if (alreadyPlaced) continue;
      void applyProjectWorkspaceLayout({
        environmentId,
        projectId,
        expectedVersion: layoutVersion,
        operation: {
          type: "place-resource",
          resource: { kind: "thread", threadId: ThreadId.make(thread.threadId) },
          parentId: pendingParentId ? ProjectWorkspaceItemId.make(pendingParentId) : null,
          beforeId: null,
        },
      }).catch((error: unknown) => {
        console.error("[unifiedWorkspace] failed to materialize a new thread's placement", error);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Couldn't place the new thread",
            description:
              "It's visible at the project root instead. " +
              (error instanceof Error ? error.message : "Please move it manually."),
          }),
        );
      });
    }
    // Only re-run when the live thread set or layout actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, layoutEntries, environmentId, projectId, layoutVersion]);

  // --- Route-derived "active thread" (spec §8 step 1) ---
  const routeParams = useParams({ strict: false });
  const routeTarget = resolveThreadRouteTarget(routeParams);
  const activeThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const activeThread = useMemo(
    () => (activeThreadRef ? projectThreadShells.find((t) => t.id === activeThreadRef.threadId) : null),
    [activeThreadRef, projectThreadShells],
  );

  // --- "Most recently active" recency map (spec §8 step 2) ---
  const threadRecencyById = useVisitedRecencyCompat(environmentId, threads);

  // --- Terminal open command (shared by ops.openTerminal and the drawer elsewhere) ---
  const openTerminalCommand = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const closeTerminalCommand = useAtomCommand(terminalEnvironment.close, { reportFailure: false });
  const openPreviewCommand = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const closePreviewCommand = useAtomCommand(previewEnvironment.close, { reportFailure: false });

  const activationOps = useMemo(
    () => ({
      navigateToThread: (threadId: string) => {
        void router.navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(scopeThreadRef(environmentId, ThreadId.make(threadId))),
        });
      },
      ensureDraftThread: (draftInput: { parentId: string | null }) => {
        const rawParentId = draftInput.parentId ? dequalify(draftInput.parentId) : null;
        const result = ensureDraftThreadTarget(projectRef, {
          parentId: rawParentId,
          applyPlacementOnReuse: false,
        });
        return { draftId: result.draftId, threadId: result.threadId };
      },
      openFile: (threadId: string, relativePath: string) => {
        useRightPanelStore.getState().openFile(scopeThreadRef(environmentId, ThreadId.make(threadId)), relativePath);
      },
      openFilesSurface: (threadId: string) => {
        useRightPanelStore.getState().open(scopeThreadRef(environmentId, ThreadId.make(threadId)), "files");
      },
      openTerminal: (threadId: string, terminalId: string) => {
        const ref = scopeThreadRef(environmentId, ThreadId.make(threadId));
        useRightPanelStore.getState().openTerminal(ref, terminalId);
        // Best-effort attach; if the terminal is already running server-side this is a no-op
        // beyond re-establishing the stream, matching the drawer's own open-on-activate behavior.
        const cwd = project?.workspaceRoot;
        if (cwd) {
          void openTerminalCommand({ environmentId, input: { threadId: ThreadId.make(threadId), terminalId, cwd } });
        }
      },
      openBrowser: (threadId: string, tabId: string) => {
        const ref = scopeThreadRef(environmentId, ThreadId.make(threadId));
        useRightPanelStore.getState().openBrowser(ref, tabId);
        setActivePreviewTab(ref, tabId);
      },
      runCommand: (threadId: string, scriptId: string) => {
        requestUnifiedWorkspaceCommandRun({ environmentId, threadId, scriptId });
      },
      openUrlInPreview: (threadId: string, url: string) => {
        void openUrlInPreviewSession({
          threadRef: scopeThreadRef(environmentId, ThreadId.make(threadId)),
          url,
          openPreview: openPreviewCommand,
        });
      },
      openUrlExternally: (url: string) => {
        const api = readLocalApi();
        if (api) void api.shell.openExternal(url);
        else window.open(url, "_blank", "noopener,noreferrer");
      },
    }),
    [
      router,
      environmentId,
      dequalify,
      ensureDraftThreadTarget,
      projectRef,
      project?.workspaceRoot,
      openTerminalCommand,
      openPreviewCommand,
    ],
  );

  const runtimeSupportsEmbeddedPreview = isPreviewSupportedInRuntime();

  const activateNode = useCallback(
    (nodeId: string) => {
      const node = nodesById.get(nodeId);
      if (!node) return;
      activateUnifiedWorkspaceNode({
        node,
        nodesById,
        projectId,
        activeThreadId: activeThread?.id ?? null,
        activeThreadProjectId: activeThread?.projectId ?? null,
        threadRecencyById,
        validThreadIds,
        runtimeSupportsEmbeddedPreview,
        ops: activationOps,
      });
    },
    [nodesById, projectId, activeThread, threadRecencyById, validThreadIds, runtimeSupportsEmbeddedPreview, activationOps],
  );

  const runCommand = useCallback(
    (nodeId: string) => {
      // Same dispatch path as clicking the node — spec §8 Command and the context-menu
      // "Run" action are the same operation, just triggered differently.
      activateNode(nodeId);
    },
    [activateNode],
  );

  const closeLiveNode = useCallback(
    (nodeId: string) => {
      const node = nodesById.get(nodeId);
      if (!node) return;
      if (node.activation.kind === "terminal") {
        void closeTerminalCommand({
          environmentId,
          input: { threadId: ThreadId.make(node.activation.threadId), terminalId: node.activation.terminalId },
        });
        return;
      }
      if (node.activation.kind === "browser") {
        const ref = scopeThreadRef(environmentId, ThreadId.make(node.activation.threadId));
        const state = activePreviewSessions[scopeThreadRefKeyCompat(environmentId, node.activation.threadId)];
        const snapshot = state?.sessions[node.activation.tabId] ?? null;
        void closePreviewSession({
          closePreview: closePreviewCommand,
          snapshot,
          tabId: node.activation.tabId,
          threadRef: ref,
        });
      }
    },
    [nodesById, environmentId, closeTerminalCommand, activePreviewSessions, closePreviewCommand],
  );

  const moveNode = useCallback(
    async (target: UnifiedWorkspaceMoveTarget): Promise<UnifiedWorkspaceMutationResult> => {
      const node = nodesById.get(target.nodeId);
      if (!node || !node.canMove) {
        return { ok: false, tag: "unsupported", message: "This item can't be moved." };
      }
      const itemId = dequalify(target.nodeId);
      if (!itemId) return { ok: false, tag: "invalid-parent", message: "Unknown item." };
      const parentItemId = target.parentId ? dequalify(target.parentId) : null;
      if (target.parentId && !parentItemId) {
        return { ok: false, tag: "invalid-parent", message: "Unknown destination." };
      }
      const beforeItemId = target.beforeId ? dequalify(target.beforeId) : null;
      if (target.beforeId && !beforeItemId) {
        return { ok: false, tag: "invalid-parent", message: "Unknown position." };
      }

      const isPersisted = layoutEntries.some((entry) => entry.id === itemId);
      if (!isPersisted) {
        // Synthetic thread/command being placed for the first time (spec §6.3).
        if (node.activation.kind === "thread") {
          return runLayoutOperation({
            type: "place-resource",
            resource: { kind: "thread", threadId: ThreadId.make(node.activation.threadId) },
            parentId: parentItemId,
            beforeId: beforeItemId,
          });
        }
        if (node.activation.kind === "command") {
          return runLayoutOperation({
            type: "place-resource",
            resource: { kind: "command", scriptId: node.activation.scriptId },
            parentId: parentItemId,
            beforeId: beforeItemId,
          });
        }
      }
      return runLayoutOperation({ type: "move", itemId, parentId: parentItemId, beforeId: beforeItemId });
    },
    [nodesById, dequalify, layoutEntries, runLayoutOperation],
  );

  const attachPath = useCallback(
    async (attachInput: {
      kind: "file" | "folder";
      relativePath: string;
      parentId: string | null;
    }): Promise<UnifiedWorkspaceMutationResult> => {
      const parentItemId = attachInput.parentId ? dequalify(attachInput.parentId) : null;
      if (attachInput.parentId && !parentItemId) {
        return { ok: false, tag: "invalid-parent", message: "Unknown destination." };
      }
      const rank = rankBetween(lastRankAmong(layoutEntries, parentItemId), null);
      const id = ProjectWorkspaceItemId.make(randomUUID());
      return runLayoutOperation({
        type: "attach-path",
        entry:
          attachInput.kind === "file"
            ? { kind: "file", id, parentId: parentItemId, rank, relativePath: attachInput.relativePath }
            : { kind: "folder", id, parentId: parentItemId, rank, relativePath: attachInput.relativePath },
      });
    },
    [dequalify, layoutEntries, runLayoutOperation],
  );

  const addUrlShortcut = useCallback(
    async (urlInput: {
      label: string;
      url: string;
      parentId: string | null;
    }): Promise<UnifiedWorkspaceMutationResult> => {
      const parentItemId = urlInput.parentId ? dequalify(urlInput.parentId) : null;
      if (urlInput.parentId && !parentItemId) {
        return { ok: false, tag: "invalid-parent", message: "Unknown destination." };
      }
      const rank = rankBetween(lastRankAmong(layoutEntries, parentItemId), null);
      const entry: ProjectWorkspaceUrlEntry = {
        kind: "url",
        id: ProjectWorkspaceItemId.make(randomUUID()),
        parentId: parentItemId,
        rank,
        label: urlInput.label,
        url: urlInput.url,
      };
      return runLayoutOperation({ type: "add-url", entry });
    },
    [dequalify, layoutEntries, runLayoutOperation],
  );

  const renameNode = useCallback(
    async (nodeId: string, label: string): Promise<UnifiedWorkspaceMutationResult> => {
      const node = nodesById.get(nodeId);
      if (!node || !node.canRename) {
        return { ok: false, tag: "unsupported", message: "This item can't be renamed." };
      }
      const itemId = dequalify(nodeId);
      if (!itemId) return { ok: false, tag: "invalid-parent", message: "Unknown item." };
      return runLayoutOperation({ type: "rename", itemId, label });
    },
    [nodesById, dequalify, runLayoutOperation],
  );

  const removeNode = useCallback(
    async (nodeId: string): Promise<UnifiedWorkspaceMutationResult> => {
      const node = nodesById.get(nodeId);
      if (!node || !node.canRemove) {
        return { ok: false, tag: "unsupported", message: "This item can't be removed from the sidebar." };
      }
      const itemId = dequalify(nodeId);
      if (!itemId) return { ok: false, tag: "invalid-parent", message: "Unknown item." };
      return runLayoutOperation({ type: "remove", itemId });
    },
    [nodesById, dequalify, runLayoutOperation],
  );

  const createThread = useCallback(
    (createInput: { parentId: string | null }) => {
      const rawParentId = createInput.parentId ? dequalify(createInput.parentId) : null;
      ensureDraftThreadTarget(projectRef, { parentId: rawParentId, applyPlacementOnReuse: true });
    },
    [dequalify, ensureDraftThreadTarget, projectRef],
  );

  const pinBrowserShortcut = useCallback(
    async (nodeId: string): Promise<UnifiedWorkspaceMutationResult> => {
      const node = nodesById.get(nodeId);
      if (!node || node.activation.kind !== "browser") {
        return { ok: false, tag: "unsupported", message: "This item isn't a live browser tab." };
      }
      const url = node.tooltip;
      if (!url) {
        return { ok: false, tag: "unsupported", message: "This tab doesn't have a URL yet." };
      }
      const rank = rankBetween(lastRankAmong(layoutEntries, null), null);
      const entry: ProjectWorkspaceUrlEntry = {
        kind: "url",
        id: ProjectWorkspaceItemId.make(randomUUID()),
        parentId: null,
        rank,
        label: node.label,
        url,
      };
      return runLayoutOperation({ type: "add-url", entry });
    },
    [nodesById, layoutEntries, runLayoutOperation],
  );

  const listAttachCandidates = useCallback(
    (kind: "file" | "folder"): readonly UnifiedWorkspaceAttachCandidate[] => {
      if (!entriesQuery.data) return [];
      const attachedPaths = new Set(
        layoutEntries
          .filter((entry): entry is Extract<ProjectWorkspaceEntry, { kind: "file" | "folder" }> =>
            entry.kind === kind,
          )
          .map((entry) => entry.relativePath),
      );
      return entriesQuery.data.entries
        .filter((entry) => (kind === "file" ? entry.kind === "file" : entry.kind === "directory"))
        .map((entry) => ({
          relativePath: entry.path,
          kind,
          alreadyAttached: attachedPaths.has(entry.path),
        }));
    },
    [entriesQuery.data, layoutEntries],
  );

  return {
    roots,
    layoutVersion,
    capabilities,
    diagnostics,
    activateNode,
    moveNode,
    attachPath,
    addUrlShortcut,
    renameNode,
    removeNode,
    createThread,
    runCommand,
    pinBrowserShortcut,
    closeLiveNode,
    listAttachCandidates,
  };
}

/**
 * Thin compatibility shims kept at the bottom so the hook body above reads
 * top-to-bottom as the real data flow. Each wraps an already-existing
 * source — no new state, no second registry.
 */
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useUiStateStore } from "~/uiStateStore";

function useProjectThreadShellsCompat(refs: ReadonlyArray<ScopedProjectRef>) {
  return useThreadShellsForProjectRefs(refs);
}

function scopeThreadRefKeyCompat(environmentId: EnvironmentId, threadId: string): string {
  return scopedThreadKey(scopeThreadRef(environmentId, ThreadId.make(threadId)));
}

function useVisitedRecencyCompat(
  environmentId: EnvironmentId,
  threads: readonly UnifiedWorkspaceThreadInput[],
): ReadonlyMap<string, string> {
  const visitedAtByThreadKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const thread of threads) {
      const key = scopeThreadRefKeyCompat(environmentId, thread.threadId);
      const visitedAt = visitedAtByThreadKey[key];
      if (visitedAt) map.set(thread.threadId, visitedAt);
    }
    return map;
  }, [threads, visitedAtByThreadKey, environmentId]);
}
