import { FileIcon, FolderIcon, HomeIcon, MessageSquareIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { UnifiedWorkspaceNode } from "../../unifiedWorkspace/types";
import { cn } from "../../lib/utils";
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
import {
  buildUnifiedWorkspaceNodeIndex,
  flattenVisibleUnifiedWorkspaceNodes,
  isNodeSelfOrDescendant,
} from "./UnifiedWorkspaceTree.logic";

/**
 * The non-drag "Move to…" flow (§10/§11): must be able to complete the same
 * move a drag can. It intentionally only asks for a destination container,
 * not a precise before/after index — the item is appended at the end of the
 * chosen parent's children, matching how most "move to folder" pickers work.
 * Precise reordering among siblings stays a drag (pointer/touch/keyboard)
 * concern; the dialog is the "get it anywhere" path, not the "get it exactly
 * here" path.
 */
export interface UnifiedWorkspaceMoveDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly sourceNode: UnifiedWorkspaceNode | null;
  readonly roots: readonly UnifiedWorkspaceNode[];
  readonly onConfirm: (target: { parentId: string | null }) => void;
}

interface MoveDestination {
  readonly parentId: string | null;
  readonly label: string;
  readonly depth: number;
  readonly icon: typeof HomeIcon;
}

export function UnifiedWorkspaceMoveDialog(props: UnifiedWorkspaceMoveDialogProps) {
  const { open, onOpenChange, sourceNode, roots, onConfirm } = props;
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  const destinations = useMemo<MoveDestination[]>(() => {
    if (!sourceNode) return [];
    const index = buildUnifiedWorkspaceNodeIndex(roots);
    const containers = flattenVisibleUnifiedWorkspaceNodes(roots, new Set())
      .map((row) => row.node)
      .filter(
        (node) =>
          node.canHaveChildren &&
          !node.isBroken &&
          node.id !== sourceNode.id &&
          !isNodeSelfOrDescendant(index, sourceNode.id, node.id),
      )
      .map((node) => ({
        parentId: node.id,
        label: node.label,
        depth: node.depth + 1,
        icon:
          node.kind === "folder"
            ? FolderIcon
            : node.kind === "thread"
              ? MessageSquareIcon
              : FileIcon,
      }));
    return [{ parentId: null, label: "Project root", depth: 0, icon: HomeIcon }, ...containers];
  }, [roots, sourceNode]);

  if (!sourceNode) return null;

  const handleConfirm = () => {
    onConfirm({ parentId: selectedParentId });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelectedParentId(null);
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move “{sourceNode.label}”</DialogTitle>
          <DialogDescription>Choose where this belongs in the tree.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-2">
          <div
            role="listbox"
            aria-label="Move destination"
            className="max-h-72 overflow-y-auto rounded-md border border-border/60 p-1"
          >
            {destinations.map((destination) => {
              const Icon = destination.icon;
              const isSelected = selectedParentId === destination.parentId;
              return (
                <button
                  key={destination.parentId ?? "__root__"}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-sm px-2 text-left text-xs outline-none",
                    "hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring",
                    isSelected && "bg-accent font-medium",
                  )}
                  style={{ paddingInlineStart: `calc(0.5rem + ${destination.depth} * 0.875rem)` }}
                  onClick={() => setSelectedParentId(destination.parentId)}
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{destination.label}</span>
                </button>
              );
            })}
            {destinations.length === 1 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground/70">
                No other containers yet — this can only move to the project root.
              </p>
            )}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Move</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
