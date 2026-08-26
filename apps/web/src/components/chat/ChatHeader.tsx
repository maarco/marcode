import {
  type EnvironmentId,
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { memo } from "react";
import GitActionsControl from "../GitActionsControl";
import { type DraftId } from "~/composerDraftStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, {
  type NewProjectScriptInput,
  type ProjectScriptActionResult,
} from "../ProjectScriptsControl";
import { OpenInPicker } from "./OpenInPicker";
import { usePillNavNarrow } from "../FloatingPillNav";
import { useRemoteOpenState, type RemoteOpenMode } from "../../remoteOpen";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useT3ProjectFileScripts } from "~/hooks/useT3ProjectFileScripts";
import {
  ChatAmbientAppearancePicker,
  ChatAmbientEffectPicker,
  type ChatAmbientAppearance,
  type ChatAmbientEffectSelection,
} from "./chatAmbientEffects";

interface ThreadActionsClusterProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  draftId?: DraftId;
  activeProjectName: string | undefined;
  activeProjectCwd: string | null;
  openInCwd: string | null;
  activeProjectScripts: ReadonlyArray<ProjectScript> | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  gitCwd: string | null;
  readonly onOpenPullRequest?: ((number: number) => void) | undefined;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<ProjectScriptActionResult>;
  onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteProjectScript: (scriptId: string) => Promise<ProjectScriptActionResult>;
}

interface ChatHeaderProps {
  activeThreadTitle: string;
  ambientEffect?: ChatAmbientEffectSelection;
  onAmbientEffectChange?: (effect: ChatAmbientEffectSelection) => void;
  ambientAppearance?: ChatAmbientAppearance;
  onAmbientAppearanceChange?: (appearance: ChatAmbientAppearance) => void;
}

/**
 * Rename commit rule shared with the sidebar's inline rename: trim, reject
 * empty (the caller toasts), and skip the mutation when nothing changed.
 */
export function resolveRenameCommit(input: {
  readonly title: string;
  readonly originalTitle: string;
}): { action: "commit"; title: string } | { action: "reject-empty" } | { action: "noop" } {
  const trimmed = input.title.trim();
  if (trimmed.length === 0) return { action: "reject-empty" };
  if (trimmed === input.originalTitle) return { action: "noop" };
  return { action: "commit", title: trimmed };
}

export function shouldShowOpenInPicker(input: {
  readonly activeProjectName: string | undefined;
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly remoteOpenMode: RemoteOpenMode;
}): boolean {
  if (!input.activeProjectName) return false;
  if (
    input.primaryEnvironmentId !== null &&
    input.activeThreadEnvironmentId === input.primaryEnvironmentId
  ) {
    return true;
  }
  // Remote environments get the picker in deep-link mode (or its explicit
  // "no SSH route" state). Non-primary local backends (e.g. WSL) keep it
  // hidden, matching pre-remote behavior.
  return input.remoteOpenMode !== "local-exec";
}

/** Thread action cluster (scripts / open-in / git) — portaled into the pill nav by ChatView. */
export const ThreadActionsCluster = memo(function ThreadActionsCluster({
  activeThreadEnvironmentId,
  activeThreadId,
  draftId,
  activeProjectName,
  activeProjectCwd,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  gitCwd,
  onOpenPullRequest,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
}: ThreadActionsClusterProps) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  // The cluster is portaled into the pill's scroll row, so it collapses on the
  // same signal the pill uses to become a narrow rail.
  const narrow = usePillNavNarrow();
  const fileScripts = useT3ProjectFileScripts(
    activeThreadEnvironmentId,
    activeProjectScripts ? activeProjectCwd : null,
  );
  const remoteOpenState = useRemoteOpenState(activeThreadEnvironmentId);
  const showOpenInPicker = shouldShowOpenInPicker({
    activeProjectName,
    activeThreadEnvironmentId,
    primaryEnvironmentId,
    remoteOpenMode: remoteOpenState.mode,
  });
  // Upstream added a thread action menu + inline rename on the chat header
  // title. Marcode's header shows only the title (this cluster is portaled
  // into the pill nav and carries no title), and thread actions already have
  // an entry point on the sidebar row's context menu, so that machinery is
  // deliberately not mounted here.
  return (
    <>
      {activeProjectScripts && (
        <ProjectScriptsControl
          scripts={activeProjectScripts}
          fileScripts={fileScripts}
          keybindings={keybindings}
          preferredScriptId={preferredScriptId}
          onRunScript={onRunProjectScript}
          onAddScript={onAddProjectScript}
          onUpdateScript={onUpdateProjectScript}
          onDeleteScript={onDeleteProjectScript}
          flat
        />
      )}
      {showOpenInPicker && (
        <OpenInPicker
          environmentId={activeThreadEnvironmentId}
          keybindings={keybindings}
          availableEditors={availableEditors}
          openInCwd={openInCwd}
          flat
        />
      )}
      {activeProjectName && (
        <GitActionsControl
          gitCwd={gitCwd}
          activeThreadRef={scopeThreadRef(activeThreadEnvironmentId, activeThreadId)}
          onOpenPullRequest={onOpenPullRequest}
          {...(draftId ? { draftId } : {})}
          collapsed={narrow}
          flat
        />
      )}
    </>
  );
});

export const ChatHeader = memo(function ChatHeader({
  activeThreadTitle,
  ambientEffect,
  onAmbientEffectChange,
  ambientAppearance,
  onAmbientAppearanceChange,
}: ChatHeaderProps) {
  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden sm:gap-3">
        {ambientEffect !== undefined && onAmbientEffectChange ? (
          <ChatAmbientEffectPicker value={ambientEffect} onValueChange={onAmbientEffectChange} />
        ) : null}
        {ambientAppearance !== undefined && onAmbientAppearanceChange ? (
          <ChatAmbientAppearancePicker
            value={ambientAppearance}
            onValueChange={onAmbientAppearanceChange}
          />
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <h2
                aria-label={activeThreadTitle}
                className="min-w-0 max-w-full truncate px-2 text-right text-sm font-black text-foreground/85 sm:px-3"
              >
                {activeThreadTitle}
              </h2>
            }
          />
          <TooltipPopup side="top">{activeThreadTitle}</TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
});
