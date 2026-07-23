import { FileIcon, FolderIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { UnifiedWorkspaceAttachCandidate } from "../../unifiedWorkspace/types";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/**
 * Attach file/folder (§9): search over the authoritative current project
 * index (`controller.listAttachCandidates`), filtered by kind, never
 * exposing paths outside `workspaceRoot` — that filtering already happened
 * upstream in the controller, this dialog only searches what it's handed.
 * On duplicate, focus/reveal the existing node instead of re-attaching.
 */
export interface UnifiedWorkspaceAttachDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly kind: "file" | "folder";
  readonly candidates: readonly UnifiedWorkspaceAttachCandidate[];
  readonly onAttach: (relativePath: string) => void;
  readonly onFocusExisting: (relativePath: string) => void;
}

export function UnifiedWorkspaceAttachDialog(props: UnifiedWorkspaceAttachDialogProps) {
  const { open, onOpenChange, kind, candidates, onAttach, onFocusExisting } = props;
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const scoped = candidates.filter((candidate) => candidate.kind === kind);
    if (!normalized) return scoped;
    return scoped.filter((candidate) => candidate.relativePath.toLowerCase().includes(normalized));
  }, [candidates, kind, query]);

  const handleSelect = (candidate: UnifiedWorkspaceAttachCandidate) => {
    if (candidate.alreadyAttached) {
      onFocusExisting(candidate.relativePath);
    } else {
      onAttach(candidate.relativePath);
    }
    onOpenChange(false);
  };

  const Icon = kind === "file" ? FileIcon : FolderIcon;
  const noun = kind === "file" ? "file" : "folder";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attach {noun}</DialogTitle>
          <DialogDescription>
            Attaches a project-relative reference. Nothing on disk is copied, moved, or renamed.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search project ${noun}s…`}
              className="pl-7"
            />
          </div>
          <div
            role="listbox"
            aria-label={`Attach ${noun}`}
            className="max-h-72 overflow-y-auto rounded-md border border-border/60 p-1"
          >
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground/70">
                No matching {noun}s in this project.
              </p>
            )}
            {filtered.map((candidate) => (
              <button
                key={candidate.relativePath}
                type="button"
                role="option"
                className={cn(
                  "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-sm px-2 text-left text-xs outline-none",
                  "hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring",
                )}
                onClick={() => handleSelect(candidate)}
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{candidate.relativePath}</span>
                {candidate.alreadyAttached && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/60">
                    Already attached
                  </span>
                )}
              </button>
            ))}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
