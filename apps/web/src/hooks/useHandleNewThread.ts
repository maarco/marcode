import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
<<<<<<< HEAD
import {
  DEFAULT_RUNTIME_MODE,
  DEFAULT_SERVER_SETTINGS,
  type ScopedProjectRef,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import { useParams, useRouter } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
=======
import { DEFAULT_SERVER_SETTINGS, type ScopedProjectRef, type ThreadId } from "@t3tools/contracts";
import { type AnyRouter, useRouter } from "@tanstack/react-router";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
import {
  composerDraftHasUserContent,
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
import { resolveNewThreadEnvMode, resolveProjectSettings } from "@t3tools/shared/projectSettings";
import {
  readProject,
  readProjects,
  readThreadShell,
  readThreadShells,
  useProjects,
  useQuietThreadShell,
} from "../state/entities";
import {
  hasExplicitComposerModelSelection,
  resolveNewDraftStartFromOrigin,
  resolveNewThreadModelSelectionOverride,
} from "../lib/chatThreadActions";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { readT3ProjectFile } from "../lib/t3ProjectFileDefaults";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentSummaries } from "../state/presentation";
import { environmentServerConfigsAtom } from "../state/server";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { legacyProjectCwdPreferenceKey, useUiStateStore } from "../uiStateStore";
import { getClientSettings } from "./useSettings";
import { useThreadRouteTarget } from "./useThreadRouteTarget";
import { readUnloadedThreadCount } from "../state/olderSettledShelf";

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

interface NewThreadWorkspaceOptions {
  branch?: string | null;
  worktreePath?: string | null;
  envMode?: DraftThreadEnvMode;
  startFromOrigin?: boolean;
}

function pickExplicitWorkspaceOptions(options: NewThreadWorkspaceOptions | undefined) {
  return {
    ...(options?.branch !== undefined ? { branch: options.branch } : {}),
    ...(options?.worktreePath !== undefined ? { worktreePath: options.worktreePath } : {}),
    ...(options?.envMode !== undefined ? { envMode: options.envMode } : {}),
    ...(options?.startFromOrigin !== undefined ? { startFromOrigin: options.startFromOrigin } : {}),
  };
}

export function useNewThreadHandler() {
  return createNewThreadHandler(useRouter());
}

export type NewThreadHandler = ReturnType<typeof createNewThreadHandler>;

export function createNewThreadHandler(router: AnyRouter) {
  const getCurrentRouteTarget = () => {
    const currentRouteParams = router.state.matches[router.state.matches.length - 1]?.params ?? {};
    return resolveThreadRouteTarget(currentRouteParams);
  };

<<<<<<< HEAD
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
        /**
         * Move the viewed draft's typed content (prompt + images) into the
         * draft this request lands on. Set by the draft repo picker: the
         * user started writing in the wrong project and the text should
         * follow them. Explicit new-thread surfaces leave this unset and
         * keep mint-fresh semantics.
         */
        carryComposerContent?: boolean;
      },
      // Which draft the thread ended up in, so a caller that has something to put in it — a
      // prepared checkout, a task to write — addresses that one rather than looking the project
      // up again and finding whichever draft it happens to hold.
    ): Promise<{ draftId: DraftId; threadId: ThreadId } | null> => {
      const projects = readProjects();
      const targetServerSettings =
        environmentServerConfigs.get(projectRef.environmentId)?.settings ?? DEFAULT_SERVER_SETTINGS;
      const {
        getComposerDraft,
        getDraftSessionByLogicalProjectKey,
        getDraftSession,
        getDraftThread,
        applyStickyState,
        setDraftThreadContext,
        setLogicalProjectDraftThreadId,
        setModelSelection,
      } = useComposerDraftStore.getState();
      const requestingRouteHref = router.state.location.href;
      const routeChangedSinceRequest = () => router.state.location.href !== requestingRouteHref;
      const currentRouteTarget = getCurrentRouteTarget();
      // A new thread carries the user's working mode from the thread being
      // viewed. The target project's configured model still wins; interaction
      // mode carries independently. Permissions, branch, worktree, and env mode
      // come from configured defaults unless the caller passes them explicitly.
      const carrySourceShell =
        currentRouteTarget?.kind === "server"
          ? readThreadShell(currentRouteTarget.threadRef)
          : null;
      const carrySourceDraft =
        currentRouteTarget?.kind === "draft" ? getDraftSession(currentRouteTarget.draftId) : null;
      // Composer overrides win over the persisted thread state — they are
      // what the user currently sees in the composer controls.
      const carrySourceComposer = currentRouteTarget
        ? getComposerDraft(
            currentRouteTarget.kind === "server"
              ? currentRouteTarget.threadRef
              : currentRouteTarget.draftId,
          )
=======
  return (
    projectRef: ScopedProjectRef,
    options?: {
      branch?: string | null;
      worktreePath?: string | null;
      envMode?: DraftThreadEnvMode;
      startFromOrigin?: boolean;
      replace?: boolean;
    },
  ): Promise<{ draftId: DraftId; threadId: ThreadId } | null> => {
    const projects = readProjects();
    const projectGroupingSettings = selectProjectGroupingSettings(getClientSettings());
    // Read at call time; status pushes replace the config map and would recreate every sidebar handler.
    const environmentServerConfigs = appAtomRegistry.get(environmentServerConfigsAtom);
    const targetServerSettings =
      environmentServerConfigs.get(projectRef.environmentId)?.settings ?? DEFAULT_SERVER_SETTINGS;
    const {
      getComposerDraft,
      getDraftSessionByLogicalProjectKey,
      getDraftSession,
      getDraftThread,
      applyStickyState,
      setDraftThreadContext,
      setLogicalProjectDraftThreadId,
      setModelSelection,
    } = useComposerDraftStore.getState();
    const requestingRouteHref = router.state.location.href;
    const routeChangedSinceRequest = () => router.state.location.href !== requestingRouteHref;
    const currentRouteTarget = getCurrentRouteTarget();
    const carrySourceShell =
      currentRouteTarget?.kind === "server" ? readThreadShell(currentRouteTarget.threadRef) : null;
    const carrySourceDraft =
      currentRouteTarget?.kind === "draft" ? getDraftSession(currentRouteTarget.draftId) : null;
    const carrySourceComposer = currentRouteTarget
      ? getComposerDraft(
          currentRouteTarget.kind === "server"
            ? currentRouteTarget.threadRef
            : currentRouteTarget.draftId,
        )
      : null;
    const composerActiveProvider = carrySourceComposer?.activeProvider ?? null;
    const composerModelSelection = composerActiveProvider
      ? (carrySourceComposer?.modelSelectionByProvider[composerActiveProvider] ?? null)
      : null;
    const carryModelSelection = composerModelSelection ?? carrySourceShell?.modelSelection ?? null;
    const carryInteractionMode =
      carrySourceComposer?.interactionMode ??
      carrySourceShell?.interactionMode ??
      carrySourceDraft?.interactionMode ??
      null;
    const project = projects.find(
      (candidate) =>
        candidate.id === projectRef.projectId &&
        candidate.environmentId === projectRef.environmentId,
    );
    const abandonedSinceRequest = () =>
      routeChangedSinceRequest() || (project !== undefined && readProject(projectRef) === null);
    const projectSettings = resolveProjectSettings(
      targetServerSettings,
      project?.id ?? null,
      project,
    );
    const projectDefaultModelSelection = projectSettings.settings.defaultModelSelection;
    const defaultRuntimeMode = projectSettings.settings.defaultRuntimeMode;
    const resolveModelSelectionOverride = (destinationDraftId: DraftId) =>
      resolveNewThreadModelSelectionOverride({
        projectDefaultSelection: projectDefaultModelSelection ?? null,
        carrySelection: carryModelSelection,
        carrySourceDraftId:
          currentRouteTarget?.kind === "draft" ? currentRouteTarget.draftId : null,
        destinationDraftId,
      });
    const resolveDefaultEnvMode = async (): Promise<DraftThreadEnvMode> => {
      // Environment queries wait for a connection, so reading the project file on an
      // offline machine would never settle and the draft would never open.
      const consultProjectFile =
        project !== undefined &&
        projectSettings.settings.defaultThreadEnvMode === null &&
        appAtomRegistry
          .get(environmentSummaries.connectedEnvironmentIdsAtom)
          .includes(project.environmentId);
      const projectFile = consultProjectFile
        ? await readT3ProjectFile(project.environmentId, project.workspaceRoot)
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
        : null;
      return resolveNewThreadEnvMode({
        projectSettings: resolveProjectSettings(
          targetServerSettings,
          project?.id ?? null,
          project,
          projectFile,
        ),
        workspaceRoot: project?.workspaceRoot ?? null,
        newProjectsRoot: environmentServerConfigs.get(projectRef.environmentId)?.newProjectsRoot,
        projectHasThreads:
          readThreadShells().some(
            (thread) =>
              thread.environmentId === projectRef.environmentId &&
              thread.projectId === projectRef.projectId,
          ) ||
          readUnloadedThreadCount(
            [{ environmentId: projectRef.environmentId, id: projectRef.projectId }],
            [],
          ) > 0,
      });
    };
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
      storedDraftThread !== null &&
      storedDraftThread.promotedTo == null &&
      storedDraftThreadRef !== null &&
      readThreadShell(storedDraftThreadRef) === null
        ? storedDraftThread
        : null;
    if (storedDraftThreadRef && reusableStoredDraftThread === null) {
      markPromotedDraftThreadByRef(storedDraftThreadRef);
    }
    const emptyStoredDraftThread =
      reusableStoredDraftThread &&
      !composerDraftHasUserContent(getComposerDraft(reusableStoredDraftThread.draftId))
        ? reusableStoredDraftThread
        : null;
<<<<<<< HEAD
      if (emptyStoredDraftThread) {
        return (async () => {
          const isDraftAlreadyOpen =
            currentRouteTarget?.kind === "draft" &&
            currentRouteTarget.draftId === emptyStoredDraftThread.draftId;
          const hasExplicitWorkspaceOption =
            hasBranchOption ||
            hasWorktreePathOption ||
            hasEnvModeOption ||
            hasStartFromOriginOption;
          // Resurrecting an empty stored draft must not resurrect its stale
          // context: explicit workspace options win outright; otherwise the
          // env context resets to the configured defaults so drafts seeded
          // before a defaults change (or by the old carry-over behavior) stop
          // landing on "current checkout" branches forever. When the draft is
          // already open and no options were passed, leave its workspace
          // context alone entirely — the user may have just picked a branch
          // in the composer. Model selection has its own explicit-pick rule
          // below and does not follow this guard.
          let workspaceContext: NewThreadWorkspaceOptions | null = null;
          if (hasExplicitWorkspaceOption) {
            workspaceContext = pickExplicitWorkspaceOptions(options);
          } else if (!isDraftAlreadyOpen) {
            const defaultEnvMode = await resolveDefaultEnvMode();
            if (routeChangedSinceRequest()) {
              return null;
            }
            // The await yields. If the draft was opened (a concurrent
            // invocation's navigation landed), promoted to a real thread,
            // remapped away (a concurrent invocation registered a fresh
            // draft — remapping back would evict the winner and let the
            // store GC it), or gained content (no longer a reusable empty
            // draft) in the meantime, this invocation is a stale loser:
            // resetting context, remapping, or navigating would all clobber
            // state written after the snapshot above. Bail out entirely —
            // the winner already did this work.
            const routeTargetNow = getCurrentRouteTarget();
            const openedMeanwhile =
              routeTargetNow?.kind === "draft" &&
              routeTargetNow.draftId === emptyStoredDraftThread.draftId;
            const promotedMeanwhile =
              storedDraftThreadRef !== null && readThreadShell(storedDraftThreadRef) !== null;
            const remappedMeanwhile =
              getDraftSessionByLogicalProjectKey(logicalProjectKey)?.draftId !==
              emptyStoredDraftThread.draftId;
            const investedMeanwhile = composerDraftHasUserContent(
              getComposerDraft(emptyStoredDraftThread.draftId),
            );
            if (openedMeanwhile || promotedMeanwhile || remappedMeanwhile || investedMeanwhile) {
              return null;
            }
            workspaceContext = {
              branch: null,
              worktreePath: null,
              envMode: defaultEnvMode,
              startFromOrigin: resolveNewDraftStartFromOrigin({
                envMode: defaultEnvMode,
                newWorktreesStartFromOrigin: projectSettings.settings.newWorktreesStartFromOrigin,
              }),
            };
          }
          if (workspaceContext) {
            setDraftThreadContext(emptyStoredDraftThread.draftId, {
              ...workspaceContext,
              ...(!isDraftAlreadyOpen ? { runtimeMode: defaultRuntimeMode } : {}),
              ...(carryInteractionMode ? { interactionMode: carryInteractionMode } : {}),
            });
          }
          // Model intent: an explicit human pick always stands. Seeds and
          // legacy entries alike re-resolve here — sticky first, mirroring
          // the mint-fresh path, then the project default or carried
          // selection on top. This runs even when the draft is already open:
          // without it, a changed pin could never reach the draft the user
          // is looking at, because explicit picks are the only thing the
          // flag protects.
          const storedDraft = getComposerDraft(emptyStoredDraftThread.draftId);
          const storedDraftHasExplicitModelPick = hasExplicitComposerModelSelection(storedDraft);
          if (!storedDraftHasExplicitModelPick) {
            applyStickyState(emptyStoredDraftThread.draftId);
            const modelSelectionOverride = resolveModelSelectionOverride(
              emptyStoredDraftThread.draftId,
            );
            if (modelSelectionOverride) {
              // This is a complete snapshot: absent options mean "no options",
              // not "keep the stale draft's options".
              setModelSelection(emptyStoredDraftThread.draftId, modelSelectionOverride, {
                replaceOptions: true,
              });
            }
          }
          // The workspace context must also ride along here: when projectRef
          // targets a different physical member of the logical project,
          // createDraftThreadState treats the remap as a project change and
          // would otherwise wipe branch/worktree, undoing the write above.
          setLogicalProjectDraftThreadId(
            logicalProjectKey,
            projectRef,
            emptyStoredDraftThread.draftId,
            {
              threadId: emptyStoredDraftThread.threadId,
              ...workspaceContext,
              ...(!isDraftAlreadyOpen ? { runtimeMode: defaultRuntimeMode } : {}),
              ...(carryInteractionMode ? { interactionMode: carryInteractionMode } : {}),
            },
          );
          const opened = {
            draftId: emptyStoredDraftThread.draftId,
            threadId: emptyStoredDraftThread.threadId,
          };
          // Re-read the route: the snapshot from before the await is stale
          // once a concurrent invocation's navigation lands, and navigating
          // again would push a duplicate history entry.
          const routeTargetAfterWrites = getCurrentRouteTarget();
          if (
            routeTargetAfterWrites?.kind === "draft" &&
            routeTargetAfterWrites.draftId === emptyStoredDraftThread.draftId
          ) {
            return opened;
          }
          await router.navigate({
            to: "/draft/$draftId",
            params: { draftId: emptyStoredDraftThread.draftId },
            replace: options?.replace ?? false,
          });
          return opened;
        })();
      }

      if (
        latestActiveDraftThread &&
        currentRouteTarget?.kind === "draft" &&
        latestActiveDraftThread.logicalProjectKey === logicalProjectKey &&
        latestActiveDraftThread.promotedTo == null &&
        // Same content rule as above: a new-thread request while viewing an
        // invested draft mints a fresh one instead of repurposing it.
        !composerDraftHasUserContent(getComposerDraft(currentRouteTarget.draftId))
      ) {
        if (
          hasBranchOption ||
          hasWorktreePathOption ||
          hasEnvModeOption ||
          hasStartFromOriginOption
        ) {
          setDraftThreadContext(currentRouteTarget.draftId, pickExplicitWorkspaceOptions(options));
        }
        setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, currentRouteTarget.draftId, {
          threadId: latestActiveDraftThread.threadId,
          createdAt: latestActiveDraftThread.createdAt,
          runtimeMode: latestActiveDraftThread.runtimeMode,
          interactionMode: latestActiveDraftThread.interactionMode,
          ...pickExplicitWorkspaceOptions(options),
        });
        return Promise.resolve({
          draftId: currentRouteTarget.draftId,
          threadId: latestActiveDraftThread.threadId,
        });
      }

      const draftId = options?.draftId ?? newDraftId();
      const threadId = options?.threadId ?? newThreadId();
      const createdAt = new Date().toISOString();
=======
    const latestActiveDraftThread: DraftThreadState | null = currentRouteTarget
      ? currentRouteTarget.kind === "server"
        ? getDraftThread(currentRouteTarget.threadRef)
        : getDraftSession(currentRouteTarget.draftId)
      : null;
    if (emptyStoredDraftThread) {
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
      return (async () => {
        const isDraftAlreadyOpen =
          currentRouteTarget?.kind === "draft" &&
          currentRouteTarget.draftId === emptyStoredDraftThread.draftId;
        const hasExplicitWorkspaceOption =
          hasBranchOption || hasWorktreePathOption || hasEnvModeOption || hasStartFromOriginOption;
        let workspaceContext: NewThreadWorkspaceOptions | null = null;
        if (hasExplicitWorkspaceOption) {
          workspaceContext = pickExplicitWorkspaceOptions(options);
        } else if (!isDraftAlreadyOpen) {
          const defaultEnvMode = await resolveDefaultEnvMode();
          if (abandonedSinceRequest()) {
            return null;
          }
          // Concurrent calls may change the draft; stale resets, remaps, or navigation could clobber it.
          const routeTargetNow = getCurrentRouteTarget();
          const openedMeanwhile =
            routeTargetNow?.kind === "draft" &&
            routeTargetNow.draftId === emptyStoredDraftThread.draftId;
          const promotedMeanwhile =
            storedDraftThreadRef !== null && readThreadShell(storedDraftThreadRef) !== null;
          const remappedMeanwhile =
            getDraftSessionByLogicalProjectKey(logicalProjectKey)?.draftId !==
            emptyStoredDraftThread.draftId;
          const investedMeanwhile = composerDraftHasUserContent(
            getComposerDraft(emptyStoredDraftThread.draftId),
          );
          if (openedMeanwhile || promotedMeanwhile || remappedMeanwhile || investedMeanwhile) {
            return null;
          }
          workspaceContext = {
            branch: null,
            worktreePath: null,
            envMode: defaultEnvMode,
            startFromOrigin: resolveNewDraftStartFromOrigin({
              envMode: defaultEnvMode,
              newWorktreesStartFromOrigin: projectSettings.settings.newWorktreesStartFromOrigin,
            }),
<<<<<<< HEAD
          runtimeMode: defaultRuntimeMode,
          ...(carryInteractionMode ? { interactionMode: carryInteractionMode } : {}),
        });
        applyStickyState(draftId);
        if (options?.placement) {
          registerPendingWorkspaceThreadPlacement(
            scopeThreadRef(projectRef.environmentId, threadId),
            options.placement.parentId,
          );
        }
        const modelSelectionOverride = resolveModelSelectionOverride(draftId);
        if (modelSelectionOverride) {
          // After sticky state so project defaults and the viewed thread's
          // carried selection both outrank the globally sticky one; the project
          // default wins when both are present. replaceOptions: the override is
          // a complete snapshot — absent options mean "no options", not "keep
          // whatever sticky state just wrote".
          setModelSelection(draftId, modelSelectionOverride, { replaceOptions: true });
=======
          };
        }
        if (workspaceContext) {
          setDraftThreadContext(emptyStoredDraftThread.draftId, {
            ...workspaceContext,
            ...(!isDraftAlreadyOpen ? { runtimeMode: defaultRuntimeMode } : {}),
            ...(carryInteractionMode ? { interactionMode: carryInteractionMode } : {}),
          });
        }
        const storedDraft = getComposerDraft(emptyStoredDraftThread.draftId);
        const storedDraftHasExplicitModelPick = hasExplicitComposerModelSelection(storedDraft);
        if (!storedDraftHasExplicitModelPick) {
          applyStickyState(emptyStoredDraftThread.draftId);
          const modelSelectionOverride = resolveModelSelectionOverride(
            emptyStoredDraftThread.draftId,
          );
          if (modelSelectionOverride) {
            setModelSelection(emptyStoredDraftThread.draftId, modelSelectionOverride, {
              replaceOptions: true,
            });
          }
        }
        // Remapping physical projects clears workspace context; preserve the branch and worktree.
        setLogicalProjectDraftThreadId(
          logicalProjectKey,
          projectRef,
          emptyStoredDraftThread.draftId,
          {
            threadId: emptyStoredDraftThread.threadId,
            ...workspaceContext,
            ...(!isDraftAlreadyOpen ? { runtimeMode: defaultRuntimeMode } : {}),
            ...(carryInteractionMode ? { interactionMode: carryInteractionMode } : {}),
          },
        );
        const opened = {
          draftId: emptyStoredDraftThread.draftId,
          threadId: emptyStoredDraftThread.threadId,
        };
        const routeTargetAfterWrites = getCurrentRouteTarget();
        if (
          routeTargetAfterWrites?.kind === "draft" &&
          routeTargetAfterWrites.draftId === emptyStoredDraftThread.draftId
        ) {
          return opened;
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
        }
        await router.navigate({
          to: "/draft/$draftId",
          params: { draftId: emptyStoredDraftThread.draftId },
          replace: options?.replace ?? false,
        });
        return opened;
      })();
    }

    if (
      latestActiveDraftThread &&
      currentRouteTarget?.kind === "draft" &&
      latestActiveDraftThread.logicalProjectKey === logicalProjectKey &&
      latestActiveDraftThread.promotedTo == null &&
      !composerDraftHasUserContent(getComposerDraft(currentRouteTarget.draftId))
    ) {
      if (
        hasBranchOption ||
        hasWorktreePathOption ||
        hasEnvModeOption ||
        hasStartFromOriginOption
      ) {
        setDraftThreadContext(currentRouteTarget.draftId, pickExplicitWorkspaceOptions(options));
      }
      setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, currentRouteTarget.draftId, {
        threadId: latestActiveDraftThread.threadId,
        createdAt: latestActiveDraftThread.createdAt,
        runtimeMode: latestActiveDraftThread.runtimeMode,
        interactionMode: latestActiveDraftThread.interactionMode,
        ...pickExplicitWorkspaceOptions(options),
      });
      return Promise.resolve({
        draftId: currentRouteTarget.draftId,
        threadId: latestActiveDraftThread.threadId,
      });
    }

    const draftId = newDraftId();
    const threadId = newThreadId();
    const createdAt = new Date().toISOString();
    return (async () => {
      const initialEnvMode = options?.envMode ?? (await resolveDefaultEnvMode());
      if (abandonedSinceRequest()) {
        return null;
      }
      // Reuse drafts registered while awaiting so their pending navigation cannot lose them.
      const racedDraft = getDraftSessionByLogicalProjectKey(logicalProjectKey);
      if (
        racedDraft &&
        racedDraft.draftId !== storedDraftThread?.draftId &&
        readThreadShell(scopeThreadRef(racedDraft.environmentId, racedDraft.threadId)) === null
      ) {
        setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, racedDraft.draftId, {
          threadId: racedDraft.threadId,
          createdAt: racedDraft.createdAt,
          runtimeMode: racedDraft.runtimeMode,
          interactionMode: racedDraft.interactionMode,
          ...pickExplicitWorkspaceOptions(options),
        });
        await router.navigate({
          to: "/draft/$draftId",
          params: { draftId: racedDraft.draftId },
          replace: options?.replace ?? false,
        });
        return { draftId: racedDraft.draftId, threadId: racedDraft.threadId };
      }
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
            newWorktreesStartFromOrigin: projectSettings.settings.newWorktreesStartFromOrigin,
          }),
        runtimeMode: defaultRuntimeMode,
        ...(carryInteractionMode ? { interactionMode: carryInteractionMode } : {}),
      });
      applyStickyState(draftId);
      const modelSelectionOverride = resolveModelSelectionOverride(draftId);
      if (modelSelectionOverride) {
        setModelSelection(draftId, modelSelectionOverride, { replaceOptions: true });
      }
      await router.navigate({
        to: "/draft/$draftId",
        params: { draftId },
        replace: options?.replace ?? false,
      });
      return { draftId, threadId };
    })();
  };
}

export function resolveDefaultProjectRef(
  projects: ReadonlyArray<EnvironmentProject>,
  projectOrder: readonly string[],
): ScopedProjectRef | null {
  const [defaultProject] = orderItemsByPreferredIds({
    items: projects,
    preferredIds: projectOrder,
    getId: getProjectOrderKey,
    getPreferenceIds: (project) => [
      getProjectOrderKey(project),
      legacyProjectCwdPreferenceKey(project.workspaceRoot),
    ],
  });
  return defaultProject ? scopeProjectRef(defaultProject.environmentId, defaultProject.id) : null;
}

export function useHandleNewThread() {
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const routeTarget = useThreadRouteTarget();
  const routeThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const routeDraftId = routeTarget?.kind === "draft" ? routeTarget.draftId : null;
  const activeThread = useQuietThreadShell(routeThreadRef);
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const activeDraftThread = useComposerDraftStore(() =>
    routeTarget
      ? routeTarget.kind === "server"
        ? getDraftThread(routeTarget.threadRef)
        : useComposerDraftStore.getState().getDraftSession(routeTarget.draftId)
      : null,
  );
  const projects = useProjects();
  const handleNewThread = useNewThreadHandler();
  const defaultProjectRef = resolveDefaultProjectRef(projects, projectOrder);

  return {
    activeDraftThread,
    activeThread,
    defaultProjectRef,
    handleNewThread,
    routeDraftId,
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
