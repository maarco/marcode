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
import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { ApplyProjectWorkspaceLayoutResult } from "@t3tools/client-runtime/operations/project-workspace";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { rankBetween } from "@t3tools/shared/fractional-rank";
import {
  ProjectWorkspaceItemId,
  ThreadId,
  type EnvironmentId,
  type ProjectId,
  type ProjectWorkspaceEntry,
  type ProjectWorkspaceLayoutOperation,
  type ProjectWorkspaceUrlEntry,
  type ScopedProjectRef,
  EMPTY_PROJECT_WORKSPACE_LAYOUT,
  INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION,
} from "@t3tools/contracts";
import { useParams, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { openUrlInPreview as openUrlInPreviewSession } from "~/browser/openFileInPreview";
import { useProjectEntriesQuery } from "~/components/files/projectFilesQueryState";
import { closePreviewSession } from "~/components/preview/closePreviewSession";
import { useEditorStore } from "~/editor/editor-store";
import { openFileInFloatingEditor } from "~/editor/open-floating-file";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import {
  takePendingWorkspaceThreadPlacement,
  useEnsureDraftThreadTarget,
} from "~/hooks/useHandleNewThread";
import { useClientSettings } from "~/hooks/useSettings";
import { randomUUID } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { useDiscoveredPorts } from "~/portDiscoveryState";
import {
  isPreviewSupportedInRuntime,
  setActivePreviewTab,
  useActivePreviewSessions,
} from "~/previewStateStore";
import { useRightPanelStore } from "~/rightPanelStore";
import { useProject, useThreadShellsForProjectRefs } from "~/state/entities";
import { previewEnvironment } from "~/state/preview";
import { projectEnvironment } from "~/state/projects";
import { terminalEnvironment } from "~/state/terminal";
import { useKnownTerminalSessions } from "~/state/terminalSessions";
import { useAtomCommand } from "~/state/use-atom-command";
import { useComposerDraftStore } from "~/composerDraftStore";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  resolveThreadRouteTarget,
} from "~/threadRoutes";
import { useUiStateStore } from "~/uiStateStore";

import { activateUnifiedWorkspaceNode, requestUnifiedWorkspaceCommandRun } from "./activateNode";
import {
  buildUnifiedWorkspaceTree,
  EMPTY_AMBIENT_ENTRIES,
  EMPTY_EXPANDED_AMBIENT_DIRS,
  toggleExpandedAmbientDir,
  type UnifiedWorkspaceThreadInput,
} from "./buildTree";
import {
  compareUnifiedWorkspaceRanks,
  indexUnifiedWorkspaceNodesById,
  parseUnifiedWorkspaceNodeId,
  resolveUnifiedWorkspaceAmbientMaterializationChain,
} from "./treeOperations";
import type {
  UnifiedWorkspaceAttachCandidate,
  UnifiedWorkspaceController,
  UnifiedWorkspaceMoveTarget,
  UnifiedWorkspaceMutationResult,
} from "./types";

function toMutationResult(
  result: ApplyProjectWorkspaceLayoutResult,
): UnifiedWorkspaceMutationResult {
  if (result.ok) return { ok: true };
  return { ok: false, tag: result.rejection.tag, message: result.rejection.message };
}

/**
 * Resolves the settled `AtomCommandResult` from the `applyWorkspaceLayout` atom command
 * (`useAtomCommand` — see `~/state/use-atom-command`) into the controller's
 * `UnifiedWorkspaceMutationResult` shape.
 *
 * This is the fix for a real bug: `applyProjectWorkspaceLayout` (operations/projectWorkspace.ts)
 * is an `Effect.Effect<...>`, not a `Promise`. Calling it directly and `await`-ing or
 * `.then`/`.catch`-ing the result never runs the Effect — it resolves to the Effect object
 * itself, so `result.ok` is `undefined` and downstream code reading `result.rejection.tag`
 * throws `Cannot read properties of undefined (reading 'tag')`. Every mutation (attach, add
 * URL, move, rename, remove, place-resource) routed through the broken direct call. The fix
 * runs it through `createEnvironmentCommand`/`useAtomCommand` (the pattern every other command
 * in this codebase uses — see `CommandPalette.tsx`'s `createProject` usage), which actually
 * executes the Effect and settles it into an `AtomCommandResult`.
 *
 * A `Failure` tag here is always a connection-level problem (offline, RPC unavailable, auth) —
 * `applyProjectWorkspaceLayout` never fails its Effect for an expected rejection (stale
 * version, cycle, duplicate path, ...); those travel through the `Success` value's
 * `{ok:false, rejection}` branch instead, so both branches funnel through `toMutationResult`.
 */
function resolveLayoutCommandResult(
  result: AtomCommandResult<ApplyProjectWorkspaceLayoutResult, unknown>,
): UnifiedWorkspaceMutationResult {
  if (result._tag === "Success") return toMutationResult(result.value);
  if (isAtomCommandInterrupted(result)) {
    return { ok: false, tag: "offline", message: "The request was interrupted." };
  }
  const error = squashAtomCommandFailure(result);
  return {
    ok: false,
    tag: "offline",
    message: error instanceof Error ? error.message : "Request failed.",
  };
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

function threadRefKey(environmentId: EnvironmentId, threadId: string): string {
  return scopedThreadKey(scopeThreadRef(environmentId, ThreadId.make(threadId)));
}

/**
 * Recency source for spec §8 step 2 ("most recently active descendant
 * thread"): the existing per-thread last-visited tracker already used
 * elsewhere in the sidebar (`uiStateStore.ts`'s `threadLastVisitedAtById`,
 * written by `markThreadVisited`), not a new registry.
 */
function useThreadRecencyById(
  environmentId: EnvironmentId,
  threads: readonly UnifiedWorkspaceThreadInput[],
): ReadonlyMap<string, string> {
  const visitedAtByThreadKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const thread of threads) {
      const visitedAt = visitedAtByThreadKey[threadRefKey(environmentId, thread.threadId)];
      if (visitedAt) map.set(thread.threadId, visitedAt);
    }
    return map;
  }, [threads, visitedAtByThreadKey, environmentId]);
}

export function useUnifiedWorkspaceProject(input: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}): UnifiedWorkspaceController {
  const { environmentId, projectId } = input;
  const projectRef = useMemo(
    () => scopeProjectRef(environmentId, projectId),
    [environmentId, projectId],
  );
  const project = useProject(projectRef);
  // The layout already rides on the physical project shell, so there is nothing
  // to fetch and no second store to keep in sync — read it straight off `project`.
  const layoutEntries = project?.workspaceLayout ?? EMPTY_PROJECT_WORKSPACE_LAYOUT;
  const layoutVersion = project?.workspaceLayoutVersion ?? INITIAL_PROJECT_WORKSPACE_LAYOUT_VERSION;

  const threadSortOrder = useClientSettings((settings) => settings.sidebarThreadSortOrder);
  const router = useRouter();

  // --- Live sources — every one already exists; nothing here is a second registry. ---

  // Exact source `Sidebar.tsx` uses (`useThreadShellsForProjectRefs(project.memberProjectRefs)`
  // at apps/web/src/components/Sidebar.tsx:1178), scoped here to one physical project.
  const scopedProjectRefs = useMemo<readonly ScopedProjectRef[]>(() => [projectRef], [projectRef]);
  const projectThreadShells = useThreadShellsForProjectRefs(scopedProjectRefs);

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
    () =>
      new Set(
        threads.filter((t) => t.archivedAt === null && t.deletedAt === null).map((t) => t.threadId),
      ),
    [threads],
  );
  const projectThreadIdSet = useMemo(() => new Set(threads.map((t) => t.threadId)), [threads]);

  const scripts = project?.scripts ?? [];

  // `useKnownTerminalSessions` with `threadId: null` returns every terminal known in this
  // environment (`apps/web/src/state/terminalSessions.ts:51`); filtered client-side to this
  // project's threads below — no project-scoped selector existed, and none was needed.
  const allKnownTerminalSessions = useKnownTerminalSessions({ environmentId, threadId: null });
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

  // `useActivePreviewSessions` already indexes every thread with a live preview session
  // across the whole app (`apps/web/src/previewStateStore.ts:153`); filtered to this
  // project's threads below.
  const activePreviewSessions = useActivePreviewSessions();
  const previewTabs = useMemo(() => {
    const result: Array<{
      threadId: string;
      tabId: string;
      title: string | null;
      url: string | null;
      loading: boolean;
      updatedAt: string;
    }> = [];
    for (const threadId of projectThreadIdSet) {
      const state = activePreviewSessions[threadRefKey(environmentId, threadId)];
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

  // `useProjectEntriesQuery` is the exact file-index source the floating
  // editor's file tree reads
  // (`apps/web/src/components/files/projectFilesQueryState.ts:123`).
  const entriesQuery = useProjectEntriesQuery(environmentId, project?.workspaceRoot ?? "");
  const knownPaths = useMemo(() => {
    if (!project || entriesQuery.data === null) return null;
    return new Set(entriesQuery.data.entries.map((entry) => entry.path));
  }, [project, entriesQuery.data]);
  // Same query as `knownPaths` above — the ambient (unattached) file/folder
  // nodes the tree now shows by default (spec override of §4) are projected
  // from this one existing index, not a second one (spec §2).
  const ambientEntries = entriesQuery.data?.entries ?? EMPTY_AMBIENT_ENTRIES;
  const ambientEntriesTruncated = entriesQuery.data?.truncated ?? false;

  // Which ambient folders the sidebar's disclosure arrow has asked to reveal
  // (`toggleAmbientFolder` below) — one level deep per entry, per
  // `expandedAmbientDirs` on `BuildUnifiedWorkspaceTreeInput`. Ephemeral UI
  // state only: never a `ProjectWorkspaceEntry`, never written to the layout,
  // reset on remount exactly like `collapsedIds` in `UnifiedWorkspaceTree.tsx`.
  const [expandedAmbientDirs, setExpandedAmbientDirs] = useState<ReadonlySet<string>>(
    EMPTY_EXPANDED_AMBIENT_DIRS,
  );

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
        ambientEntries,
        ambientEntriesTruncated,
        expandedAmbientDirs,
      }),
    [
      environmentId,
      projectId,
      layoutEntries,
      scripts,
      threads,
      terminals,
      previewTabs,
      threadSortOrder,
      knownPaths,
      ambientEntries,
      ambientEntriesTruncated,
      expandedAmbientDirs,
    ],
  );

  useEffect(() => {
    if (diagnostics.length === 0) return;
    console.warn(
      `[unifiedWorkspace] ${diagnostics.length} invalid persisted relationship(s) fell back to root for project ${projectId}:`,
      diagnostics,
    );
  }, [diagnostics, projectId]);

  const nodesById = useMemo(() => indexUnifiedWorkspaceNodesById(roots), [roots]);

  // Capabilities: no concrete "server lacks layout command capability" signal exists yet
  // (old vs. new server both decode `workspaceLayoutVersion: 0, workspaceLayout: []`
  // identically — see spec §6.2/§17). Defaulting to mutable; a real capability/version
  // check can be layered in once Agent 1 or the primary agent exposes one.
  const capabilities = useMemo(() => ({ canMutate: true, reason: null }), []);

  // --- Layout mutation plumbing ---
  const applyWorkspaceLayoutCommand = useAtomCommand(projectEnvironment.applyWorkspaceLayout, {
    reportFailure: false,
  });

  const runLayoutOperation = useCallback(
    async (
      operation: ProjectWorkspaceLayoutOperation,
      // Defaults to the hook's current (render-time) layout version. A
      // caller that issues more than one operation per gesture — `moveNode`
      // materializing an ambient ancestor chain before the move itself —
      // passes the version explicitly, advanced by one per prior success in
      // the same gesture, since React state won't reflect an
      // in-flight-within-this-callback mutation until the next render.
      expectedVersionOverride?: number,
    ): Promise<UnifiedWorkspaceMutationResult> => {
      if (!capabilities.canMutate) {
        return {
          ok: false,
          tag: "offline",
          message: capabilities.reason ?? "Editing is unavailable right now.",
        };
      }
      const result = await applyWorkspaceLayoutCommand({
        environmentId,
        input: {
          environmentId,
          projectId,
          expectedVersion: expectedVersionOverride ?? layoutVersion,
          operation,
        },
      });
      return resolveLayoutCommandResult(result);
    },
    [capabilities, environmentId, projectId, layoutVersion, applyWorkspaceLayoutCommand],
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

  // Pending placement reconciliation (spec §9) is now a deliberate no-op: a
  // thread layout placement can never render (thread nodes are hidden from
  // the tree — buildTree.ts's `computeHiddenEntries` — the classic
  // thread-list card owns thread display now), so materializing one would be
  // a wasted round-trip that writes a layout entry no one will ever see.
  // Still drain the registry so a promoted draft's pending entry doesn't sit
  // there forever — `takePendingWorkspaceThreadPlacement` removes it on read,
  // and the registry's own contract (useHandleNewThread.ts) only relies on
  // that drain for a thread that actually promotes; an abandoned draft's
  // entry was already never cleaned up, unchanged by this.
  useEffect(() => {
    for (const thread of threads) {
      const ref = scopeThreadRef(environmentId, ThreadId.make(thread.threadId));
      takePendingWorkspaceThreadPlacement(ref);
    }
  }, [threads, environmentId]);

  // --- Route-derived "active thread" (spec §8 step 1) ---
  const routeParams = useParams({ strict: false });
  const routeTarget = resolveThreadRouteTarget(routeParams);
  const activeThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const activeThread = useMemo(
    () =>
      activeThreadRef
        ? (projectThreadShells.find((t) => t.id === activeThreadRef.threadId) ?? null)
        : null,
    [activeThreadRef, projectThreadShells],
  );

  const threadRecencyById = useThreadRecencyById(environmentId, threads);

  const closeTerminalCommand = useAtomCommand(terminalEnvironment.close, { reportFailure: false });
  const openPreviewCommand = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const closePreviewCommand = useAtomCommand(previewEnvironment.close, { reportFailure: false });

  const activationOps = useMemo(
    () => ({
      navigateToThread: (threadId: string) => {
        const threadRef = scopeThreadRef(environmentId, ThreadId.make(threadId));
        // If this thread is an unpromoted draft, route to the draft view
        // instead of the server thread route (which would 404).
        const draftStore = useComposerDraftStore.getState();
        const draftThread = draftStore.getDraftThreadByRef(threadRef);
        if (draftThread && draftThread.promotedTo == null) {
          const draftId = draftStore.findDraftIdByThreadRef(threadRef);
          if (draftId) {
            void router.navigate({
              to: "/draft/$draftId",
              params: buildDraftThreadRouteParams(draftId),
            });
            return;
          }
        }
        void router.navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(threadRef),
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
        const targetThread = projectThreadShells.find((thread) => thread.id === threadId);
        const workspacePath = targetThread?.worktreePath ?? project?.workspaceRoot;
        // No right-panel fallback here: the right panel needs
        // `activeProject && activeWorkspaceRoot` to render at all
        // (ChatView.tsx), and `activeWorkspaceRoot` is derived the same way
        // (`activeThreadWorktreePath ?? activeProjectCwd`) — so a null
        // `workspacePath` here is exactly the condition under which the
        // panel would render nothing anyway. Surface a toast instead of
        // silently swallowing the click.
        if (!workspacePath) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Couldn't open the file",
              description: "This project has no workspace.",
            }),
          );
          return;
        }
        openFileInFloatingEditor({
          environmentId,
          workspacePath,
          relativePath,
          assetThreadId: ThreadId.make(threadId),
        });
      },
      // `threadId` is unused: folder activation just opens the pill's file
      // sidebar, not a per-thread surface. Kept in the op's own call site
      // (activateNode.ts) because it's part of the shared
      // UnifiedWorkspaceActivationOps interface.
      openFilesSurface: () => {
        // Known and accepted loss: the folder itself is not expanded or
        // scrolled to. The pill's tree keeps `expanded` in component-local
        // `useState` (editor/file-tree.tsx), so there is no cross-component
        // reveal API, and building one is out of scope for this migration
        // (docs/specs/single-editing-surface.md, migration site B).
        useEditorStore.getState().openOverlay();
        useEditorStore.getState().setSidebarView("files");
      },
      openTerminal: (threadId: string, terminalId: string) => {
        // Right-panel surface only — the PTY session is already running server-side
        // (this node only exists because it's live); spec §8 does not call for re-issuing
        // `terminal.open`, only for surfacing the existing session.
        useRightPanelStore
          .getState()
          .openTerminal(scopeThreadRef(environmentId, ThreadId.make(threadId)), terminalId);
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
      openPreviewCommand,
      projectThreadShells,
      project,
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
    [
      nodesById,
      projectId,
      activeThread,
      threadRecencyById,
      validThreadIds,
      runtimeSupportsEmbeddedPreview,
      activationOps,
    ],
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
          input: {
            threadId: ThreadId.make(node.activation.threadId),
            terminalId: node.activation.terminalId,
          },
        });
        return;
      }
      if (node.activation.kind === "browser") {
        const ref = scopeThreadRef(environmentId, ThreadId.make(node.activation.threadId));
        const state = activePreviewSessions[threadRefKey(environmentId, node.activation.threadId)];
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

  const toggleAmbientFolder = useCallback(
    (nodeId: string) => {
      const node = nodesById.get(nodeId);
      if (!node || !node.isAmbient || node.activation.kind !== "folder") return;
      const relativePath = node.activation.relativePath;
      setExpandedAmbientDirs((prev) => toggleExpandedAmbientDir(prev, relativePath));
    },
    [nodesById],
  );

  const moveNode = useCallback(
    async (target: UnifiedWorkspaceMoveTarget): Promise<UnifiedWorkspaceMutationResult> => {
      const node = nodesById.get(target.nodeId);
      if (!node || !node.canMove) {
        return { ok: false, tag: "unsupported", message: "This item can't be moved." };
      }
      const itemId = dequalify(target.nodeId);
      if (!itemId) return { ok: false, tag: "invalid-parent", message: "Unknown item." };

      // An ambient (disk-projected) destination folder has no persisted
      // `ProjectWorkspaceEntry` behind it — the server's "parent exists"
      // invariant correctly rejects it as a raw move target. Materialize the
      // whole ambient ancestor chain (root-most first — moving into
      // `apps/desktop` when neither is attached yet materializes `apps`
      // first, then `desktop` under it) via `attach-path` before resolving
      // the real parentId, the same "materialize on first move" contract
      // spec §6.3 already applies to a synthetic thread/command being placed
      // for the first time (below). `expectedVersion` is tracked locally and
      // advanced by one per successful attach — the decider always accepts
      // at the exact expected version and advances it by exactly one, so
      // this is computable without waiting for a re-render to see the bumped
      // `layoutVersion` state.
      let parentItemId: ProjectWorkspaceItemId | null;
      let expectedVersion = layoutVersion;
      const ambientChain = resolveUnifiedWorkspaceAmbientMaterializationChain(
        target.parentId,
        nodesById,
      );

      if (ambientChain.length === 0) {
        parentItemId = target.parentId ? dequalify(target.parentId) : null;
        if (target.parentId && !parentItemId) {
          return { ok: false, tag: "invalid-parent", message: "Unknown destination." };
        }
      } else {
        const anchorNodeId = ambientChain[0]!.parentId;
        parentItemId = anchorNodeId ? dequalify(anchorNodeId) : null;
        if (anchorNodeId && !parentItemId) {
          return { ok: false, tag: "invalid-parent", message: "Unknown destination." };
        }
        // Running copy of layout entries so rank computation for a deeper
        // ambient folder sees one materialized earlier in this same chain.
        let runningEntries = layoutEntries;
        for (const ambientNode of ambientChain) {
          if (ambientNode.activation.kind !== "folder") {
            return { ok: false, tag: "invalid-parent", message: "Unknown destination." };
          }
          const relativePath = ambientNode.activation.relativePath;
          // Idempotence: an ambient node is guaranteed to have no persisted
          // counterpart at tree-build time (`buildTree.ts` always prefers a
          // persisted entry over its ambient projection for the same path),
          // so a match here only happens if another client attached the
          // same path concurrently between this render and this call —
          // reuse it instead of double-attaching (the server rejects a true
          // duplicate path anyway).
          const existing = runningEntries.find(
            (entry): entry is Extract<ProjectWorkspaceEntry, { kind: "folder" }> =>
              entry.kind === "folder" && entry.relativePath === relativePath,
          );
          if (existing) {
            parentItemId = existing.id;
            continue;
          }
          const newId = ProjectWorkspaceItemId.make(randomUUID());
          const rank = rankBetween(lastRankAmong(runningEntries, parentItemId), null);
          const newEntry: ProjectWorkspaceEntry = {
            kind: "folder",
            id: newId,
            parentId: parentItemId,
            rank,
            relativePath,
          };
          // Partial-failure contract: if an earlier ancestor's attach
          // succeeded and a later one (or the move itself, below) fails,
          // the materialized folder(s) stay in place — harmless and
          // visible — rather than being silently rolled back. Matches how
          // spec §9 handles "Add command" placement failure.
          const result = await runLayoutOperation(
            { type: "attach-path", entry: newEntry },
            expectedVersion,
          );
          if (!result.ok) return result;
          parentItemId = newId;
          expectedVersion += 1;
          runningEntries = [...runningEntries, newEntry];
        }
      }

      let beforeItemId = target.beforeId ? dequalify(target.beforeId) : null;
      if (target.beforeId) {
        const beforeNode = nodesById.get(target.beforeId);
        if (beforeNode?.isAmbient) {
          // No persisted sibling to order against — this move materializes
          // ancestors, not siblings, so an ambient beforeId degrades to
          // "append at the end" instead of sending an id the server would
          // reject outright (same "does not exist" failure mode as the
          // ambient-parent bug this fix addresses).
          beforeItemId = null;
        } else if (!beforeItemId) {
          return { ok: false, tag: "invalid-parent", message: "Unknown position." };
        }
      }

      // Synthetic thread/command being placed for the first time materializes its persistent
      // entry instead of moving a (nonexistent) one — spec §6.3.
      const isPersisted = layoutEntries.some((entry) => entry.id === itemId);
      if (!isPersisted && node.activation.kind === "thread") {
        return runLayoutOperation(
          {
            type: "place-resource",
            resource: { kind: "thread", threadId: ThreadId.make(node.activation.threadId) },
            parentId: parentItemId,
            beforeId: beforeItemId,
          },
          expectedVersion,
        );
      }
      if (!isPersisted && node.activation.kind === "command") {
        return runLayoutOperation(
          {
            type: "place-resource",
            resource: { kind: "command", scriptId: node.activation.scriptId },
            parentId: parentItemId,
            beforeId: beforeItemId,
          },
          expectedVersion,
        );
      }
      return runLayoutOperation(
        { type: "move", itemId, parentId: parentItemId, beforeId: beforeItemId },
        expectedVersion,
      );
    },
    [nodesById, dequalify, layoutEntries, layoutVersion, runLayoutOperation],
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
            ? {
                kind: "file",
                id,
                parentId: parentItemId,
                rank,
                relativePath: attachInput.relativePath,
              }
            : {
                kind: "folder",
                id,
                parentId: parentItemId,
                rank,
                relativePath: attachInput.relativePath,
              },
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
        return {
          ok: false,
          tag: "unsupported",
          message: "This item can't be removed from the sidebar.",
        };
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
          .filter(
            (entry): entry is Extract<ProjectWorkspaceEntry, { kind: "file" | "folder" }> =>
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
    toggleAmbientFolder,
    listAttachCandidates,
  };
}
