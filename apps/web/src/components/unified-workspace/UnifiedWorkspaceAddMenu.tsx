import {
  FilePlusIcon,
  FolderPlusIcon,
  Link2Icon,
  SquareTerminalIcon,
  SquarePenIcon,
} from "lucide-react";
import type { ReactElement } from "react";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";

/**
 * The project-root / node "Add item" menu (§9). Copy is exact:
 * "New thread", "Attach file", "Attach folder", "Add URL shortcut", "Add command".
 *
 * `onAddCommand` has no controller call to back it (see UnifiedWorkspaceTree's
 * module doc / Agent 2's handoff report) — ProjectScriptsControl owns script
 * creation and isn't exposed as a callable trigger. Sidebar.tsx wires
 * whatever it can; when nothing is wired the caller should show a toast
 * rather than silently doing nothing.
 */
export interface UnifiedWorkspaceAddMenuProps {
  readonly parentId: string | null;
  readonly canMutate: boolean;
  readonly trigger: ReactElement;
  readonly onNewThread: (parentId: string | null) => void;
  readonly onAttachFile: (parentId: string | null) => void;
  readonly onAttachFolder: (parentId: string | null) => void;
  readonly onAddUrlShortcut: (parentId: string | null) => void;
  readonly onAddCommand: (parentId: string | null) => void;
}

export function UnifiedWorkspaceAddMenu(props: UnifiedWorkspaceAddMenuProps) {
  const {
    parentId,
    canMutate,
    trigger,
    onNewThread,
    onAttachFile,
    onAttachFolder,
    onAddUrlShortcut,
    onAddCommand,
  } = props;

  return (
    <Menu>
      <MenuTrigger render={trigger} />
      <MenuPopup align="start" className="min-w-48">
        <MenuItem onClick={() => onNewThread(parentId)}>
          <SquarePenIcon className="size-3.5" />
          New thread
        </MenuItem>
        <MenuSeparator />
        <MenuItem disabled={!canMutate} onClick={() => onAttachFile(parentId)}>
          <FilePlusIcon className="size-3.5" />
          Attach file
        </MenuItem>
        <MenuItem disabled={!canMutate} onClick={() => onAttachFolder(parentId)}>
          <FolderPlusIcon className="size-3.5" />
          Attach folder
        </MenuItem>
        <MenuItem disabled={!canMutate} onClick={() => onAddUrlShortcut(parentId)}>
          <Link2Icon className="size-3.5" />
          Add URL shortcut
        </MenuItem>
        <MenuItem disabled={!canMutate} onClick={() => onAddCommand(parentId)}>
          <SquareTerminalIcon className="size-3.5" />
          Add command
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
