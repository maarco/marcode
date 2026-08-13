import { FilePlusIcon, FolderPlusIcon, Link2Icon, SquareTerminalIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactElement } from "react";
import type { UnifiedWorkspaceController } from "../../unifiedWorkspace/types";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { toastManager } from "../ui/toast";
import { UnifiedWorkspaceAttachDialog } from "./UnifiedWorkspaceAttachDialog";
import {
  buildUnifiedWorkspaceNodeIndex,
  findUnifiedWorkspaceAttachedNodeId,
  resolveAddMenuParentId,
} from "./UnifiedWorkspaceTree.logic";

/**
 * The project-root / node "Add item" menu (§9). Copy is exact:
 * "Attach file", "Attach folder", "Add URL shortcut", "Add command".
 *
 * No "New thread" item here: thread nodes never render in the tree (the
 * classic thread-list card owns thread display), so the one thing that made
 * creating a thread from *this* menu different from Sidebar.tsx's primary
 * "New thread" button — seeding a contextual tree placement via the
 * currently-focused row — can no longer have any visible effect. Keeping a
 * second "New thread" entry here with that context silently dropped would
 * just be a confusing, purposeless duplicate of the primary control.
 *
 * `onAddCommand` reuses the existing `ProjectScriptsControl` editor — nothing
 * here builds a second script-creation form. Sidebar.tsx wires whatever it
 * can; when nothing is wired the caller falls back to a toast rather than
 * silently doing nothing.
 */
export interface UnifiedWorkspaceAddMenuProps {
  readonly parentId: string | null;
  readonly canMutate: boolean;
  readonly trigger: ReactElement;
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
    onAttachFile,
    onAttachFolder,
    onAddUrlShortcut,
    onAddCommand,
  } = props;

  return (
    <Menu>
      <MenuTrigger render={trigger} />
      <MenuPopup align="start" className="min-w-48">
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

function reportAddMenuFailure(action: string, result: { ok: boolean; message?: string }) {
  if (result.ok) return;
  toastManager.add({
    type: "error",
    title: `Unable to ${action}`,
    description:
      "message" in result ? (result.message ?? "An error occurred.") : "An error occurred.",
  });
}

export interface UnifiedWorkspaceAddMenuButtonProps {
  readonly controller: UnifiedWorkspaceController;
  /** Currently-focused tree row id, if any — drives context-sensitive creation
   * (§9). Resolved against `controller.roots` internally (shared with the
   * duplicate-attach lookup below) rather than requiring the caller to
   * resolve a node object first. */
  readonly focusedNodeId: string | null;
  readonly trigger: ReactElement;
  /** Reuses the existing `ProjectScriptsControl` editor — omit to fall back
   * to an explanatory toast. */
  readonly onAddCommand?: (parentId: string | null) => void;
  /** §9: "On duplicate, focus and reveal the existing node." Bridges into
   * `UnifiedWorkspaceTree`'s imperative `focusAndRevealNode` handle (the tree
   * lives in a sibling DOM position — the project header, not inside it).
   * Omit to fall back to an explanatory toast. */
  readonly onFocusExistingNode?: (nodeId: string) => void;
}

/**
 * The full "Add item" experience (§9): the project-header trigger, the menu,
 * and the attach/add-URL dialogs it opens. Mounted once per project header,
 * outside `UnifiedWorkspaceTree` — the tree only owns row-scoped affordances
 * (rename, move, per-row context menu), not this project-root-level control.
 */
export function UnifiedWorkspaceAddMenuButton(props: UnifiedWorkspaceAddMenuButtonProps) {
  const { controller, focusedNodeId, trigger, onAddCommand, onFocusExistingNode } = props;
  const nodeIndex = useMemo(
    () => buildUnifiedWorkspaceNodeIndex(controller.roots),
    [controller.roots],
  );
  const focusedNode = focusedNodeId ? (nodeIndex.byId.get(focusedNodeId) ?? null) : null;
  const parentId = resolveAddMenuParentId(focusedNode);
  const pendingParentIdRef = useRef<string | null>(null);

  const [attachDialogKind, setAttachDialogKind] = useState<"file" | "folder" | null>(null);
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [addUrlLabel, setAddUrlLabel] = useState("");
  const [addUrlUrl, setAddUrlUrl] = useState("");

  const handleAttachFile = useCallback((nextParentId: string | null) => {
    pendingParentIdRef.current = nextParentId;
    setAttachDialogKind("file");
  }, []);

  const handleAttachFolder = useCallback((nextParentId: string | null) => {
    pendingParentIdRef.current = nextParentId;
    setAttachDialogKind("folder");
  }, []);

  const handleOpenAddUrlDialog = useCallback((nextParentId: string | null) => {
    pendingParentIdRef.current = nextParentId;
    setAddUrlLabel("");
    setAddUrlUrl("");
    setAddUrlOpen(true);
  }, []);

  const handleAddCommand = useCallback(
    (nextParentId: string | null) => {
      if (onAddCommand) {
        onAddCommand(nextParentId);
      } else {
        toastManager.add({
          type: "info",
          title: "Not available yet",
          description: "Adding a command from the tree isn't wired to the script editor yet.",
        });
      }
    },
    [onAddCommand],
  );

  const handleAttachConfirm = useCallback(
    (relativePath: string) => {
      const kind = attachDialogKind;
      if (!kind) return;
      void controller
        .attachPath({ kind, relativePath, parentId: pendingParentIdRef.current })
        .then((result) => reportAddMenuFailure(`attach ${kind}`, result));
    },
    [attachDialogKind, controller],
  );

  const handleFocusExistingAttach = useCallback(
    (relativePath: string) => {
      const kind = attachDialogKind;
      const existingNodeId = kind
        ? findUnifiedWorkspaceAttachedNodeId(nodeIndex, kind, relativePath)
        : null;
      if (existingNodeId && onFocusExistingNode) {
        onFocusExistingNode(existingNodeId);
        return;
      }
      // Couldn't resolve the existing row (or no reveal wiring from the
      // caller) — report it plainly rather than doing nothing.
      toastManager.add({ type: "info", title: "Already attached", description: relativePath });
    },
    [attachDialogKind, nodeIndex, onFocusExistingNode],
  );

  const handleAddUrlConfirm = useCallback(() => {
    const label = addUrlLabel.trim();
    const url = addUrlUrl.trim();
    if (!label || !url) return;
    void controller
      .addUrlShortcut({ label, url, parentId: pendingParentIdRef.current })
      .then((result) => reportAddMenuFailure("add URL shortcut", result));
    setAddUrlOpen(false);
  }, [addUrlLabel, addUrlUrl, controller]);

  const attachCandidates = attachDialogKind
    ? controller.listAttachCandidates(attachDialogKind)
    : [];

  return (
    <>
      <UnifiedWorkspaceAddMenu
        parentId={parentId}
        canMutate={controller.capabilities.canMutate}
        trigger={trigger}
        onAttachFile={handleAttachFile}
        onAttachFolder={handleAttachFolder}
        onAddUrlShortcut={handleOpenAddUrlDialog}
        onAddCommand={handleAddCommand}
      />

      {attachDialogKind && (
        <UnifiedWorkspaceAttachDialog
          open={attachDialogKind !== null}
          onOpenChange={(open) => {
            if (!open) setAttachDialogKind(null);
          }}
          kind={attachDialogKind}
          candidates={attachCandidates}
          onAttach={handleAttachConfirm}
          onFocusExisting={handleFocusExistingAttach}
        />
      )}

      <Dialog open={addUrlOpen} onOpenChange={setAddUrlOpen}>
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add URL shortcut</DialogTitle>
            <DialogDescription>
              A durable link, activated through the existing preview surface.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-2">
            <Input
              autoFocus
              placeholder="Label"
              value={addUrlLabel}
              onChange={(event) => setAddUrlLabel(event.target.value)}
            />
            <Input
              placeholder="https://…"
              value={addUrlUrl}
              onChange={(event) => setAddUrlUrl(event.target.value)}
            />
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUrlOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!addUrlLabel.trim() || !addUrlUrl.trim()}
              onClick={handleAddUrlConfirm}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
