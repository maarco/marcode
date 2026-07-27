import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  DEFAULT_RUNTIME_MODE,
  DEFAULT_SERVER_SETTINGS,
  type ScopedProjectRef,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import { useParams, useRouter } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import {
  markPromotedDraftThreadByRef,
  type DraftId,
  type DraftThreadEnvMode,
  type DraftThreadState,
  useComposerDraftStore,
} from "../composerDraftStore";
import { newDraftId, newThreadId } from "../lib/utils";
import { orderItemsByPreferredIds } from "../components/Sidebar.logic";
import {
  deriveLogicalProjectKeyFromSettings,
  getProjectOrderKey,
  selectProjectGroupingSettings,
} from "../logicalProject";
import { readThreadShell, useProjects, useServerConfigs, useThread } from "../state/entities";
import { resolveNewDraftStartFromOrigin } from "../lib/chatThreadActions";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { legacyProjectCwdPreferenceKey, useUiStateStore } from "../uiStateStore";
import { useClientSettings } from "./useSettings";

/**
 * Placement a freshly-created draft thread should materialize into the
 * unified workspace layout once it promotes to a real server thread (spec
 * §9: "Materialize the thread placement when the thread ID is available").
 * Keyed by `scopedThreadKey` and consumed exactly once by
 * `useUnifiedWorkspaceProject.ts`'s reconciliation effect. An abandoned draft
 * simply never promotes, so its entry here is never consumed — nothing to
 * clean up, no persisted state was ever written for it.
 */
const pendingWorkspaceThreadPlacements = new Map<string, string | null>();

function registerPendingWorkspaceThreadPlacement(
  ref: ScopedThreadRef,
  parentId: string | null,
): void {
  pendingWorkspaceThreadPlacements.set(scopedThreadKey(ref), parentId);
}

/** Consumed by `useUnifiedWorkspaceProject.ts`. `undefined` means no placement is pending for this thread. */
export function takePendingWorkspaceThreadPlacement(
  ref: ScopedThreadRef,
): string | null | undefined {
  const key = scopedThreadKey(ref);
  if (!pendingWorkspaceThreadPlacements.has(key)) return undefined;
  const parentId = pendingWorkspaceThreadPlacements.get(key) ?? null;
  pendingWorkspaceThreadPlacements.delete(key);
  return parentId;
}

export function useNewThreadHandler() {
  const projects = useProjects();
  const serverConfigs = useServerConfigs();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const router = useRouter();
  const getCurrentRouteTarget = useCallback(() => {
    const currentRouteParams = router.state.matches[router.state.matches.length - 1]?.params ?? {};
    return resolveThreadRouteTarget(currentRouteParams);
  }, [router]);

  return useCallback(
    (
      projectRef: ScopedProjectRef,
      options?: {
        branch?: string | null;
        worktreePath?: string | null;
        envMode?: DraftThreadEnvMode;
        startFromOrigin?: boolean;
        replace?: boolean;
        /** Pin the brand-new-draft path's ids instead of generating fresh ones — lets a caller that already committed to an id (e.g. for an immediate right-panel/preview call) keep it in sync with the draft actually created. Ignored when an existing draft is reused. */
        draftId?: DraftId;
        threadId?: ThreadId;
        /** Seeds the unified workspace sidebar placement this draft should materialize once it promotes to a real thread (spec §9). Only applied on the brand-new-draft path. */
        placement?: { parentId: string | null } | null;
      },
    ): Promise<void> => {
      const {
        getDraftSessionByLogicalProjectKey,
        getDraftSession,
        getDraftThread,
        applyStickyState,
        setDraftThreadContext,
        setLogicalProjectDraftThreadId,
      } = useComposerDraftStore.getState();
      const currentRouteTarget = getCurrentRouteTarget();
      const project = projects.find(
        (candidate) =>
          candidate.id === projectRef.projectId &&
          candidate.environmentId === projectRef.environmentId,
      );
      const environmentSettings =
        serverConfigs.get(projectRef.environmentId)?.settings ?? DEFAULT_SERVER_SETTINGS;
      const logicalProjectKey = project
        ? deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings)
        : scopedProjectKey(projectRef);
      const hasBranchOption = options?.branch !== undefined;
      const hasWorktreePathOption = options?.worktreePath !== undefined;
      const hasEnvModeOption = options?.envMode !== undefined;
      const hasStartFromOriginOption = options?.startFromOrigin !== undefined;
      const storedDraftThread = getDraftSessionByLogicalProjectKey(logicalProjectKey);
      const storedDraftThreadRef = storedDraftThread
        ? scopeThreadRef(storedDraftThread.environmentId, storedDraftThread.threadId)
        : null;
      const reusableStoredDraftThread =
        storedDraftThreadRef && readThreadShell(storedDraftThreadRef) !== null
          ? null
          : storedDraftThread;
      if (storedDraftThreadRef && reusableStoredDraftThread === null) {
        markPromotedDraftThreadByRef(storedDraftThreadRef);
      }
      const latestActiveDraftThread: DraftThreadState | null = currentRouteTarget
        ? currentRouteTarget.kind === "server"
          ? getDraftThread(currentRouteTarget.threadRef)
          : getDraftSession(currentRouteTarget.draftId)
        : null;
      if (reusableStoredDraftThread) {
        return (async () => {
          if (
            hasBranchOption ||
            hasWorktreePathOption ||
            hasEnvModeOption ||
            hasStartFromOriginOption
          ) {
            setDraftThreadContext(reusableStoredDraftThread.draftId, {
              ...(hasBranchOption ? { branch: options?.branch ?? null } : {}),
              ...(hasWorktreePathOption ? { worktreePath: options?.worktreePath ?? null } : {}),
              ...(hasEnvModeOption ? { envMode: options?.envMode } : {}),
              ...(hasStartFromOriginOption ? { startFromOrigin: options?.startFromOrigin } : {}),
            });
          }
          setLogicalProjectDraftThreadId(
            logicalProjectKey,
            projectRef,
            reusableStoredDraftThread.draftId,
            {
              threadId: reusableStoredDraftThread.threadId,
            },
          );
          if (
            currentRouteTarget?.kind === "draft" &&
            currentRouteTarget.draftId === reusableStoredDraftThread.draftId
          ) {
            return;
          }
          await router.navigate({
            to: "/draft/$draftId",
            params: { draftId: reusableStoredDraftThread.draftId },
            replace: options?.replace ?? false,
          });
        })();
      }

      if (
        latestActiveDraftThread &&
        currentRouteTarget?.kind === "draft" &&
        latestActiveDraftThread.logicalProjectKey === logicalProjectKey &&
        latestActiveDraftThread.promotedTo == null
      ) {
        if (
          hasBranchOption ||
          hasWorktreePathOption ||
          hasEnvModeOption ||
          hasStartFromOriginOption
        ) {
          setDraftThreadContext(currentRouteTarget.draftId, {
            ...(hasBranchOption ? { branch: options?.branch ?? null } : {}),
            ...(hasWorktreePathOption ? { worktreePath: options?.worktreePath ?? null } : {}),
            ...(hasEnvModeOption ? { envMode: options?.envMode } : {}),
            ...(hasStartFromOriginOption ? { startFromOrigin: options?.startFromOrigin } : {}),
          });
        }
        setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, currentRouteTarget.draftId, {
          threadId: latestActiveDraftThread.threadId,
          createdAt: latestActiveDraftThread.createdAt,
          runtimeMode: latestActiveDraftThread.runtimeMode,
          interactionMode: latestActiveDraftThread.interactionMode,
          ...(hasBranchOption ? { branch: options?.branch ?? null } : {}),
          ...(hasWorktreePathOption ? { worktreePath: options?.worktreePath ?? null } : {}),
          ...(hasEnvModeOption ? { envMode: options?.envMode } : {}),
          ...(hasStartFromOriginOption ? { startFromOrigin: options?.startFromOrigin } : {}),
        });
        return Promise.resolve();
      }

      const draftId = options?.draftId ?? newDraftId();
      const threadId = options?.threadId ?? newThreadId();
      const createdAt = new Date().toISOString();
      const initialEnvMode = options?.envMode ?? environmentSettings.defaultThreadEnvMode;
      return (async () => {
        setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, draftId, {
          threadId,
          createdAt,
          branch: options?.branch ?? null,
          worktreePath: options?.worktreePath ?? null,
          envMode: initialEnvMode,
          startFromOrigin:
            options?.startFromOrigin ??
            resolveNewDraftStartFromOrigin({
              envMode: initialEnvMode,
              newWorktreesStartFromOrigin: environmentSettings.newWorktreesStartFromOrigin,
            }),
          runtimeMode: DEFAULT_RUNTIME_MODE,
        });
        applyStickyState(draftId);
        if (options?.placement) {
          registerPendingWorkspaceThreadPlacement(
            scopeThreadRef(projectRef.environmentId, threadId),
            options.placement.parentId,
          );
        }

        await router.navigate({
          to: "/draft/$draftId",
          params: { draftId },
          replace: options?.replace ?? false,
        });
      })();
    },
    [getCurrentRouteTarget, projectGroupingSettings, projects, router, serverConfigs],
  );
}

export function useHandleNewThread() {
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const activeThread = useThread(routeThreadRef);
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const activeDraftThread = useComposerDraftStore(() =>
    routeTarget
      ? routeTarget.kind === "server"
        ? getDraftThread(routeTarget.threadRef)
        : useComposerDraftStore.getState().getDraftSession(routeTarget.draftId)
      : null,
  );
  const projects = useProjects();
  const orderedProjects = useMemo(() => {
    return orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: getProjectOrderKey,
      getPreferenceIds: (project) => [
        getProjectOrderKey(project),
        legacyProjectCwdPreferenceKey(project.workspaceRoot),
      ],
    });
  }, [projectOrder, projects]);
  const handleNewThread = useNewThreadHandler();

  return {
    activeDraftThread,
    activeThread,
    defaultProjectRef: orderedProjects[0]
      ? scopeProjectRef(orderedProjects[0].environmentId, orderedProjects[0].id)
      : null,
    handleNewThread,
    routeThreadRef,
  };
}

export interface EnsureDraftThreadTargetResult {
  readonly draftId: DraftId;
  readonly threadId: ThreadId;
  /** True when an existing draft session was reused rather than a new one created. */
  readonly reused: boolean;
}

/**
 * Synchronous counterpart to `useNewThreadHandler`, for callers (the unified
 * workspace sidebar's node activation and "New thread" placement flows) that
 * need the target draft's identity immediately — e.g. to call
 * `openFileInFloatingEditor` in the same tick — rather than awaiting
 * navigation. Read-only replicates `useNewThreadHandler`'s exact reuse
 * decision (stored draft by logical project key, then same-route active
 * draft) so both agree on which draft is "the" target, then delegates to the
 * real `handleNewThread` for the actual state write + navigation. Pins
 * `draftId`/`threadId` on the brand-new path so the peeked ids and the ids
 * `handleNewThread` actually uses can never diverge.
 */
export function useEnsureDraftThreadTarget() {
  const projects = useProjects();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const handleNewThread = useNewThreadHandler();
  const router = useRouter();

  return useCallback(
    (
      projectRef: ScopedProjectRef,
      options: { readonly parentId: string | null; readonly applyPlacementOnReuse?: boolean },
    ): EnsureDraftThreadTargetResult => {
      const project = projects.find(
        (candidate) =>
          candidate.id === projectRef.projectId &&
          candidate.environmentId === projectRef.environmentId,
      );
      const logicalProjectKey = project
        ? deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings)
        : scopedProjectKey(projectRef);
      const { getDraftSessionByLogicalProjectKey, getDraftSession, getDraftThread } =
        useComposerDraftStore.getState();

      const applyReusePlacement = (ref: ScopedThreadRef): void => {
        if (options.applyPlacementOnReuse) {
          registerPendingWorkspaceThreadPlacement(ref, options.parentId);
        }
      };

      const stored = getDraftSessionByLogicalProjectKey(logicalProjectKey);
      const storedRef = stored ? scopeThreadRef(stored.environmentId, stored.threadId) : null;
      const reusableStored = storedRef && readThreadShell(storedRef) !== null ? null : stored;
      if (reusableStored) {
        applyReusePlacement(scopeThreadRef(reusableStored.environmentId, reusableStored.threadId));
        void handleNewThread(projectRef).catch(() => undefined);
        return { draftId: reusableStored.draftId, threadId: reusableStored.threadId, reused: true };
      }

      const currentRouteParams = router.state.matches.at(-1)?.params ?? {};
      const currentRouteTarget = resolveThreadRouteTarget(currentRouteParams);
      const latestActiveDraftThread = currentRouteTarget
        ? currentRouteTarget.kind === "server"
          ? getDraftThread(currentRouteTarget.threadRef)
          : getDraftSession(currentRouteTarget.draftId)
        : null;
      if (
        latestActiveDraftThread &&
        currentRouteTarget?.kind === "draft" &&
        latestActiveDraftThread.logicalProjectKey === logicalProjectKey &&
        latestActiveDraftThread.promotedTo == null
      ) {
        applyReusePlacement(
          scopeThreadRef(latestActiveDraftThread.environmentId, latestActiveDraftThread.threadId),
        );
        void handleNewThread(projectRef).catch(() => undefined);
        return {
          draftId: currentRouteTarget.draftId,
          threadId: latestActiveDraftThread.threadId,
          reused: true,
        };
      }

      const draftId = newDraftId();
      const threadId = newThreadId();
      void handleNewThread(projectRef, {
        draftId,
        threadId,
        placement: { parentId: options.parentId },
      }).catch(() => undefined);
      return { draftId, threadId, reused: false };
    },
    [handleNewThread, projectGroupingSettings, projects, router],
  );
}
