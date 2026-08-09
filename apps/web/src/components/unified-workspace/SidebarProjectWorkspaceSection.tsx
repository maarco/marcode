/**
 * Marcode's unified workspace tree, packaged as a drop-in section for the
 * sidebar.
 *
 * ## Why this file exists
 *
 * `Sidebar.tsx` is upstream-owned and upstream rewrites it often (it swapped
 * its whole implementation in the `ba9c9ae8` sync). Everything the workspace
 * tree needs therefore lives here, in a Marcode-owned file, and `Sidebar.tsx`
 * carries only a mount point. That keeps the fork boundary to a seam an
 * upstream rewrite can move without touching any Marcode logic.
 *
 * The corollary, and the reason this takes only four props: this component
 * sources its own dependencies from hooks and stores rather than accepting
 * handlers threaded out of `Sidebar.tsx`'s internals. Prop-threading is what
 * actually makes a fork expensive — every upstream refactor of their local
 * variables becomes our merge conflict. Four stable identifiers (which project,
 * which thread is active, is this mobile) do not.
 *
 * Behavior is unchanged from the pre-`ba9c9ae8` sidebar: the tree still merges
 * layout + live threads/scripts/terminals/preview tabs, and the five thread
 * actions still route to the same archive/delete/mark-unread/copy flows the
 * thread list uses, so mounting this never forks those flows.
 */
import { makeCommandWorkspaceItemId, ThreadId, type EnvironmentId } from "@t3tools/contracts";
import { ProjectId } from "@t3tools/contracts";
import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { PlusIcon } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { decodeProjectScriptKeybindingRule } from "~/lib/projectScriptKeybindings";
import { buildProjectScript, commandForProjectScript, nextProjectScriptId } from "~/projectScripts";
import { isElectron } from "../../env";
import { useThreadActions } from "../../hooks/useThreadActions";
import { useOpenPrLink } from "../../lib/openPullRequestLink";
import { readLocalApi } from "../../localApi";
import { primaryServerKeybindingsAtom, serverEnvironment } from "../../state/server";
import { projectEnvironment } from "../../state/projects";
import { useProject, useThreadShellsForProjectRefs } from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import { useUiStateStore } from "../../uiStateStore";
import { useClientSettings } from "~/hooks/useSettings";
import { qualifyUnifiedWorkspaceNodeId } from "../../unifiedWorkspace/treeOperations";
import type { UnifiedWorkspaceMutationResult } from "../../unifiedWorkspace/types";
import { useUnifiedWorkspaceProject } from "../../unifiedWorkspace/useUnifiedWorkspaceProject";
import ProjectScriptsControl, {
  type NewProjectScriptInput,
  type ProjectScriptActionResult,
  type ProjectScriptsControlHandle,
} from "../ProjectScriptsControl";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { UnifiedWorkspaceAddMenuButton } from "./UnifiedWorkspaceAddMenu";
import {
  UnifiedWorkspaceTree,
  type UnifiedWorkspaceTreeHandle,
  type UnifiedWorkspaceTreeThreadAction,
} from "./UnifiedWorkspaceTree";

/** Kept in sync with `Sidebar.tsx`'s own icon action buttons by eye; copied
 * rather than imported so this file never depends on an upstream export. */
const ICON_ACTION_BUTTON_CLASS =
  "inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-[calc(--spacing(1)-1px)] text-muted-foreground/60 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

export interface SidebarProjectWorkspaceSectionProps {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  /** Project title, for the Add-item trigger's accessible label. */
  projectDisplayName: string;
  /** Absolute project root, used when a thread has no worktree of its own. */
  workspaceRootFallback: string;
  isMobile: boolean;
  activeRouteThreadKey: string | null;
  /** Header slot to portal the Add-item trigger into. Null renders the trigger
   * inline above the tree instead, so the section is still complete on its own
   * if the sidebar has no slot to offer. */
  addMenuSlotElement?: HTMLDivElement | null;
}

export const SidebarProjectWorkspaceSection = memo(function SidebarProjectWorkspaceSection(
  props: SidebarProjectWorkspaceSectionProps,
) {
  const {
    environmentId,
    projectId,
    projectDisplayName,
    workspaceRootFallback,
    isMobile,
    activeRouteThreadKey,
    addMenuSlotElement = null,
  } = props;

  const projectRef = useMemo(
    () => scopeProjectRef(environmentId, projectId),
    [environmentId, projectId],
  );
  const controller = useUnifiedWorkspaceProject({ environmentId, projectId });
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const treeHandleRef = useRef<UnifiedWorkspaceTreeHandle>(null);

  // Thread details the context-menu actions need (title for the delete
  // confirmation, worktree path for "Copy path", latest-turn timestamp for
  // "Mark unread"). Read here instead of accepting the sidebar's own lookup
  // map, so an upstream refactor of that map cannot break this component.
  const projectRefs = useMemo(() => [projectRef], [projectRef]);
  const threadShells = useThreadShellsForProjectRefs(projectRefs);
  const threadShellById = useMemo(
    () => new Map(threadShells.map((shell) => [shell.id as string, shell])),
    [threadShells],
  );

  const handleFocusExistingNode = useCallback((nodeId: string) => {
    treeHandleRef.current?.focusAndRevealNode(nodeId);
  }, []);

  // ── Thread-action dependencies, sourced here rather than threaded in ──
  const { archiveThread, deleteThread } = useThreadActions();
  const markThreadUnread = useUiStateStore((state) => state.markThreadUnread);
  const openPrLink = useOpenPrLink();
  const confirmThreadDelete = useClientSettings<boolean>(
    (settings) => settings.confirmThreadDelete,
  );
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{
    threadId: ThreadId;
  }>({
    onCopy: (ctx) => {
      toastManager.add({ type: "success", title: "Thread ID copied", description: ctx.threadId });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy thread ID",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: (ctx) => {
      toastManager.add({ type: "success", title: "Path copied", description: ctx.path });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy path",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });

  // ── "Add command" reuses ProjectScriptsControl's editor and placement
  // plumbing, mounted headless below purely because that control has no other
  // externally-triggerable entry point. ──
  const scripts = useProject(projectRef)?.scripts ?? [];
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const updateProjectScripts = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const upsertScriptKeybinding = useAtomCommand(serverEnvironment.upsertKeybinding, {
    reportFailure: false,
  });
  const scriptsControlRef = useRef<ProjectScriptsControlHandle>(null);
  const [pendingAddCommandParentId, setPendingAddCommandParentId] = useState<string | null>(null);

  // Mirrors ChatView.tsx's `persistProjectScripts`/`saveProjectScript` — the
  // same `projectEnvironment.update` + keybinding-upsert pair, scoped here.
  const persistWorkspaceProjectScript = useCallback(
    async (input: NewProjectScriptInput): Promise<ProjectScriptActionResult> => {
      const nextId = nextProjectScriptId(
        input.name,
        scripts.map((script) => script.id),
      );
      const nextScript = buildProjectScript(nextId, input);
      const nextScripts = input.runOnWorktreeCreate
        ? [
            ...scripts.map((script) =>
              script.runOnWorktreeCreate ? { ...script, runOnWorktreeCreate: false } : script,
            ),
            nextScript,
          ]
        : [...scripts, nextScript];

      const updateResult = mapAtomCommandResult(
        await updateProjectScripts({ environmentId, input: { projectId, scripts: nextScripts } }),
        () => undefined,
      );
      if (updateResult._tag === "Failure") return updateResult;

      const keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding: input.keybinding,
        command: commandForProjectScript(nextId),
      });
      if (isElectron && keybindingRule) {
        return mapAtomCommandResult(
          await upsertScriptKeybinding({ environmentId, input: keybindingRule }),
          () => undefined,
        );
      }
      return updateResult;
    },
    [scripts, updateProjectScripts, environmentId, projectId, upsertScriptKeybinding],
  );

  // Update/delete are unreachable from this headless, add-only mount — honest
  // failures rather than a silent no-op, in case that ever changes.
  const rejectUnreachableScriptEdit = useCallback(
    async (): Promise<ProjectScriptActionResult> =>
      AsyncResult.failure(
        Cause.fail(new Error("Editing/deleting actions isn't available from the Add-item menu.")),
      ),
    [],
  );

  const handlePlaceNewScript = useCallback(
    (input: {
      scriptId: string;
      parentId: string | null;
    }): Promise<UnifiedWorkspaceMutationResult> =>
      controller.moveNode({
        nodeId: qualifyUnifiedWorkspaceNodeId(
          environmentId,
          projectId,
          makeCommandWorkspaceItemId(input.scriptId),
        ),
        parentId: input.parentId,
        beforeId: null,
      }),
    [controller, environmentId, projectId],
  );

  const handleAddCommand = useCallback((parentId: string | null) => {
    setPendingAddCommandParentId(parentId);
    scriptsControlRef.current?.openAddDialog();
  }, []);

  const activeNodeId = useMemo(() => {
    if (!activeRouteThreadKey) return null;
    const activeRef = parseScopedThreadKey(activeRouteThreadKey);
    if (!activeRef || activeRef.environmentId !== environmentId) return null;
    // Thread entries always carry the deterministic `thread:<threadId>` item
    // id regardless of where they've been placed in the layout.
    return qualifyUnifiedWorkspaceNodeId(environmentId, projectId, `thread:${activeRef.threadId}`);
  }, [activeRouteThreadKey, environmentId, projectId]);

  const handleThreadAction = useCallback(
    (threadId: string, action: UnifiedWorkspaceTreeThreadAction) => {
      const threadRef = scopeThreadRef(environmentId, ThreadId.make(threadId));
      const threadKey = scopedThreadKey(threadRef);
      const shell = threadShellById.get(threadId) ?? null;
      switch (action) {
        case "archive": {
          void (async () => {
            const result = await archiveThread(threadRef);
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Failed to archive thread",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
            }
          })();
          return;
        }
        case "mark-unread":
          markThreadUnread(threadKey, shell?.latestTurn?.completedAt);
          return;
        case "copy-id":
          copyThreadIdToClipboard(threadId, { threadId: ThreadId.make(threadId) });
          return;
        case "copy-path": {
          const path = shell?.worktreePath ?? workspaceRootFallback;
          copyPathToClipboard(path, { path });
          return;
        }
        case "delete": {
          void (async () => {
            const api = readLocalApi();
            if (confirmThreadDelete) {
              const confirmed = api
                ? await api.dialogs.confirm(
                    [
                      `Delete thread "${shell?.title ?? "this thread"}"?`,
                      "This permanently clears conversation history for this thread.",
                    ].join("\n"),
                  )
                : true;
              if (!confirmed) return;
            }
            const result = await deleteThread(threadRef);
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Failed to delete thread",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
            }
          })();
          return;
        }
      }
    },
    [
      environmentId,
      threadShellById,
      archiveThread,
      markThreadUnread,
      copyThreadIdToClipboard,
      copyPathToClipboard,
      workspaceRootFallback,
      confirmThreadDelete,
      deleteThread,
    ],
  );

  const addMenu = (
    <Tooltip>
      <UnifiedWorkspaceAddMenuButton
        controller={controller}
        focusedNodeId={focusedNodeId}
        onAddCommand={handleAddCommand}
        onFocusExistingNode={handleFocusExistingNode}
        trigger={
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Add item in ${projectDisplayName}`}
                data-testid="add-item-button"
                className={ICON_ACTION_BUTTON_CLASS}
              />
            }
          >
            <PlusIcon className="size-3.5" />
          </TooltipTrigger>
        }
      />
      <TooltipPopup side="top">Add item</TooltipPopup>
    </Tooltip>
  );

  return (
    <div className="mx-0.5 my-0 w-full px-1 py-0 sm:mx-1 sm:px-1.5">
      {addMenuSlotElement ? (
        createPortal(addMenu, addMenuSlotElement)
      ) : (
        <div className="flex items-center justify-between gap-1 py-1">
          <span className="truncate text-xs font-medium text-sidebar-muted-foreground">
            Workspace
          </span>
          {addMenu}
        </div>
      )}
      <UnifiedWorkspaceTree
        ref={treeHandleRef}
        controller={controller}
        projectId={projectId}
        environmentId={environmentId}
        isMobile={isMobile}
        focusedNodeId={focusedNodeId}
        onFocusedNodeIdChange={setFocusedNodeId}
        activeNodeId={activeNodeId}
        onThreadAction={handleThreadAction}
        onOpenPrLink={openPrLink}
      />
      {/* Headless — reuses ProjectScriptsControl's editor/placement plumbing
          for "Add command" rather than a second script-creation form. Hidden
          from sight and from the accessibility tree; the real, visible script
          controls still live where they always have (ChatHeader.tsx). */}
      <div className="hidden" aria-hidden="true">
        <ProjectScriptsControl
          ref={scriptsControlRef}
          scripts={scripts}
          keybindings={keybindings}
          onRunScript={() => {}}
          onAddScript={persistWorkspaceProjectScript}
          onUpdateScript={rejectUnreachableScriptEdit}
          onDeleteScript={rejectUnreachableScriptEdit}
          placement={{ parentId: pendingAddCommandParentId }}
          onPlaceScript={handlePlaceNewScript}
        />
      </div>
    </div>
  );
});

export default SidebarProjectWorkspaceSection;
