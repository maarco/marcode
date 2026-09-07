import type { ChatAmbientAppearance, ChatAmbientEffectSelection } from "./chatAmbientEffects";
import { ChatAmbientControls } from "./chatAmbientEffects";
import { ThreadActionsCluster, type ThreadActionsClusterProps } from "./ThreadActionsCluster";

/** Marcode-only header actions mounted through ChatHeader's action slot. */
export function MarcodeThreadActions(
  props: ThreadActionsClusterProps & {
    readonly isDraftHeroState: boolean;
    readonly chatAmbientEffect: ChatAmbientEffectSelection;
    readonly onChatAmbientEffectChange: (effect: ChatAmbientEffectSelection) => void;
    readonly chatAmbientAppearance: ChatAmbientAppearance;
    readonly onChatAmbientAppearanceChange: (appearance: ChatAmbientAppearance) => void;
  },
) {
  return (
    <>
      {!props.isDraftHeroState ? (
        <ChatAmbientControls
          effect={props.chatAmbientEffect}
          onEffectChange={props.onChatAmbientEffectChange}
          appearance={props.chatAmbientAppearance}
          onAppearanceChange={props.onChatAmbientAppearanceChange}
        />
      ) : null}
      <ThreadActionsCluster
        activeThreadEnvironmentId={props.activeThreadEnvironmentId}
        activeThreadId={props.activeThreadId}
        {...(props.draftId ? { draftId: props.draftId } : {})}
        activeProjectName={props.activeProjectName}
        activeProjectCwd={props.activeProjectCwd}
        openInCwd={props.openInCwd}
        activeProjectScripts={props.activeProjectScripts}
        preferredScriptId={props.preferredScriptId}
        keybindings={props.keybindings}
        availableEditors={props.availableEditors}
        gitCwd={props.gitCwd}
        {...(props.onOpenPullRequest ? { onOpenPullRequest: props.onOpenPullRequest } : {})}
        onRunProjectScript={props.onRunProjectScript}
        onAddProjectScript={props.onAddProjectScript}
        onUpdateProjectScript={props.onUpdateProjectScript}
        onDeleteProjectScript={props.onDeleteProjectScript}
      />
    </>
  );
}
