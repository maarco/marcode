import {
  type EditorId,
  type EnvironmentId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { memo } from "react";

import { type DraftId } from "~/composerDraftStore";
import { useT3ProjectFileScripts } from "~/hooks/useT3ProjectFileScripts";
import GitActionsControl from "../GitActionsControl";
import { usePillNavNarrow } from "../FloatingPillNav";
import ProjectScriptsControl, {
  type NewProjectScriptInput,
  type ProjectScriptActionResult,
} from "../ProjectScriptsControl";
import { OpenInPicker } from "./OpenInPicker";
import { shouldShowOpenInPicker } from "./openInPickerPolicy";
import { useRemoteOpenState } from "../../remoteOpen";
import { usePrimaryEnvironmentId } from "../../state/environments";

export { shouldShowOpenInPicker } from "./openInPickerPolicy";

export interface ThreadActionsClusterProps {
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly activeThreadId: ThreadId;
  readonly draftId?: DraftId;
  readonly activeProjectName: string | undefined;
  readonly activeProjectCwd: string | null;
  readonly openInCwd: string | null;
  readonly activeProjectScripts: ReadonlyArray<ProjectScript> | undefined;
  readonly preferredScriptId: string | null;
  readonly keybindings: ResolvedKeybindingsConfig;
  readonly availableEditors: ReadonlyArray<EditorId>;
  readonly gitCwd: string | null;
  readonly onOpenPullRequest?: ((number: number) => void) | undefined;
  readonly onRunProjectScript: (script: ProjectScript) => void;
  readonly onAddProjectScript: (input: NewProjectScriptInput) => Promise<ProjectScriptActionResult>;
  readonly onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  readonly onDeleteProjectScript: (scriptId: string) => Promise<ProjectScriptActionResult>;
}

/** Thread actions portaled into the pill nav by ChatView. */
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
