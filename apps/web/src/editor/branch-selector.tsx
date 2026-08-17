import { useState, useEffect } from "react";
import { ArrowDownFilled, TrashFilled, ArrowRightFilled } from "@aliimam/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "./ui-dropdown-menu";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { showToast } from "./toast";
import { useEditorStore } from "./editor-store";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsEnvironment } from "~/state/vcs";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { VcsRef } from "@t3tools/contracts";

/** Extract a user-facing message from a settled atom command result. */
function resultErrorMessage(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag === "Success") return null;
  if (isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.length > 0 ? error.message : "Operation failed";
}

/**
 * Props for BranchSelector component
 */
interface BranchSelectorProps {
  /** Absolute workspace path (the environment cwd; provided by parent GitPanel) */
  workspacePath: string;
  /** Optional callback when branch switch completes */
  onBranchSwitch?: (branchName: string) => void;
}

/**
 * Branch selector dropdown component.
 * Lists/creates/switches/deletes Git branches via the env-scoped VCS atoms
 * (`vcsEnvironment.listRefs` / `createRef` / `switchRef` / `deleteRef`).
 */
export function BranchSelector({ workspacePath, onBranchSwitch }: BranchSelectorProps) {
  const environmentId = useEditorStore((s) => s.environmentId);

  // ── derived state ─────────────────────────────────────────────────────────
  const refsQuery = useEnvironmentQuery(
    environmentId !== null
      ? vcsEnvironment.listRefs({
          environmentId,
          input: { cwd: workspacePath, limit: 100 },
        })
      : null,
  );
  const refresh = refsQuery.refresh;

  const refs = refsQuery.data?.refs ?? [];
  const currentBranch = refs.find((r) => r.current)?.name ?? "";
  const localBranches = refs.filter((b) => !b.isRemote);
  const remoteBranches = refs.filter((b) => b.isRemote);

  // ── state management ──────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createInput, setCreateInput] = useState("");
  const [createValidationError, setCreateValidationError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{
    branchName: string;
    force: boolean;
  } | null>(null);

  const canCreateBranch = createInput.trim().length > 0 && !createValidationError;

  // ── commands ──────────────────────────────────────────────────────────────
  const createRef = useAtomCommand(vcsEnvironment.createRef, { reportFailure: false });
  const switchRef = useAtomCommand(vcsEnvironment.switchRef, { reportFailure: false });
  const deleteRef = useAtomCommand(vcsEnvironment.deleteRef, { reportFailure: false });

  // surface query errors (e.g. "not a repository") in the same banner as action errors
  useEffect(() => {
    if (refsQuery.error) setError(refsQuery.error);
  }, [refsQuery.error]);

  // ── validation helpers ────────────────────────────────────────────────────
  const validateBranchNameClient = (name: string): string | null => {
    if (!name.trim()) {
      return null; // Empty is ok on initial render
    }

    if (name.length > 255) {
      return "Branch name too long (max 255 characters)";
    }

    if (/[~^:?*\\@{}[]/.test(name)) {
      return "Contains invalid characters: ~ ^ : ? * [ \\ @ { }";
    }

    if (name.startsWith(".") || name.endsWith(".")) {
      return "Cannot start or end with dot";
    }

    if (name.includes("..")) {
      return "Cannot contain consecutive dots";
    }

    if (name === "@") {
      return "Cannot be a single @";
    }

    if (name.includes("@{")) {
      return "Cannot contain @{";
    }

    if (name.endsWith(".lock")) {
      return "Cannot end with .lock";
    }

    return null;
  };

  // ── event handlers ────────────────────────────────────────────────────────

  const handleCreateInputChange = (value: string) => {
    setCreateInput(value);

    if (!value.trim()) {
      setCreateValidationError(null);
      return;
    }

    const exists = refs.some((b) => b.name.toLowerCase() === value.trim().toLowerCase());
    if (exists) {
      setCreateValidationError("Branch already exists");
      return;
    }

    setCreateValidationError(validateBranchNameClient(value));
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateBranch || environmentId === null) return;

    try {
      setActionLoading("__create__");
      setError(null);
      const result = await createRef({
        environmentId,
        input: { cwd: workspacePath, refName: createInput.trim() },
      });

      const failure = resultErrorMessage(result);
      if (failure) {
        setError(failure);
        return;
      }

      setCreateInput("");
      setCreateValidationError(null);
      refresh();
      showToast({ type: "success", title: "Branch created", message: createInput.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create branch");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSwitchBranch = async (branchName: string) => {
    if (branchName === currentBranch || environmentId === null) {
      setIsOpen(false);
      return;
    }

    try {
      setActionLoading(branchName);
      setError(null);
      const result = await switchRef({
        environmentId,
        input: { cwd: workspacePath, refName: branchName },
      });

      const failure = resultErrorMessage(result);
      if (failure) {
        setError(failure);
        return;
      }

      setIsOpen(false);
      refresh();
      showToast({ type: "success", title: "Switched branch", message: branchName });
      onBranchSwitch?.(branchName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to switch branch");
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Checkout a remote-tracking branch as a new local branch. Strips the
   * `<remote>/` prefix and switches to the local name; git's DWIM behavior
   * auto-creates a tracking branch from the unique remote match.
   */
  const handleCheckoutRemote = async (remoteBranchName: string) => {
    const localName = remoteBranchName.replace(/^[^/]+\//, "");
    if (!localName || localName === remoteBranchName) {
      setError(`Cannot parse remote branch: ${remoteBranchName}`);
      return;
    }
    await handleSwitchBranch(localName);
  };

  const handleDeleteBranch = async (branchName: string, force = false) => {
    if (environmentId === null) return;
    try {
      setActionLoading(branchName);
      setError(null);
      const result = await deleteRef({
        environmentId,
        input: { cwd: workspacePath, refName: branchName, force },
      });

      const failure = resultErrorMessage(result);
      if (failure) {
        // Prompt for force-delete when the branch has unmerged commits.
        const isNotMerged = failure.toLowerCase().includes("not fully merged");
        if (!force && isNotMerged) {
          setShowDeleteConfirm({ branchName, force: true });
          setError("Branch has unmerged changes. Use force delete to remove it.");
        } else {
          setError(failure);
        }
        return;
      }

      setShowDeleteConfirm(null);
      refresh();
      showToast({ type: "success", title: "Branch deleted", message: branchName });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete branch");
    } finally {
      setActionLoading(null);
    }
  };

  const loading = refsQuery.isPending && refs.length === 0;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded-sm hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-1 focus:ring-foreground/10 dark:focus:ring-white/10"
            aria-label="Switch git branch"
            aria-expanded={isOpen}
            aria-haspopup="menu"
            data-testid="branch-selector-trigger"
          >
            <ArrowRightFilled className="h-3 w-3 text-foreground/25 dark:text-white/25 flex-shrink-0" />
            <span className="text-[10px] font-mono text-foreground/60 dark:text-white/60 truncate max-w-[120px]">
              {currentBranch || (loading ? "loading…" : "no branch")}
            </span>
            <ArrowDownFilled
              className={cn(
                "h-3 w-3 text-foreground/25 dark:text-white/25 transition-transform flex-shrink-0",
                isOpen && "rotate-180",
              )}
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-72" role="menu" aria-label="Available branches">
          {/* Error banner */}
          {error && (
            <div className="mx-2 mb-2 p-2 rounded-sm bg-red-500/10 text-[9px] text-red-400/70 border border-red-500/20">
              <div className="flex items-start justify-between gap-2">
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400/50 hover:text-red-400 text-[8px] flex-shrink-0"
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="flex items-center justify-center py-6 px-4">
              <div className="text-[10px] text-foreground/40 dark:text-white/40">Loading…</div>
            </div>
          ) : (
            <>
              {/* Create branch section */}
              <DropdownMenuGroup>
                <form onSubmit={handleCreateBranch} className="px-2 py-1.5">
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={createInput}
                      onChange={(e) => handleCreateInputChange(e.target.value)}
                      // Stop keydown bubbling so typing (esp. Enter/space) doesn't
                      // trigger parent menu / form-submit handlers.
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="New branch name…"
                      className="w-full bg-foreground/5 dark:bg-white/5 rounded-sm px-2 py-1 text-[11px] text-foreground/70 dark:text-white/70 placeholder:text-foreground/20 dark:placeholder:text-white/20 outline-none border border-foreground/5 dark:border-white/5 focus:border-foreground/10 dark:focus:border-white/10 transition-colors focus:ring-1 focus:ring-foreground/10 dark:focus:ring-white/10"
                      autoFocus
                      autoComplete="off"
                    />
                    {createValidationError && (
                      <span className="text-[8px] text-red-400/60 block">
                        {createValidationError}
                      </span>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={!canCreateBranch || actionLoading !== null}
                    className={cn(
                      "mt-1 w-full text-[10px] px-2 py-1 rounded-sm transition-colors",
                      canCreateBranch && actionLoading === null
                        ? "text-foreground/70 dark:text-white/70 hover:text-foreground/90 dark:hover:text-white/90 bg-foreground/5 dark:bg-white/5 hover:bg-foreground/10 dark:hover:bg-white/10"
                        : "text-foreground/30 dark:text-white/30 bg-foreground/[0.02] dark:bg-white/[0.02] cursor-not-allowed",
                    )}
                  >
                    {actionLoading === "__create__" ? "Creating…" : "Create"}
                  </button>
                </form>
              </DropdownMenuGroup>

              <DropdownMenuSeparator className="bg-foreground/5 dark:bg-white/5" />

              {/* Local branches section */}
              {localBranches.length > 0 ? (
                <DropdownMenuGroup>
                  <span className="px-2 py-1 text-[8px] text-foreground/25 dark:text-white/25 uppercase tracking-wider font-medium">
                    Local ({localBranches.length})
                  </span>
                  {localBranches.map((branch) => (
                    <BranchItem
                      key={branch.name}
                      branch={branch}
                      isCurrent={currentBranch === branch.name}
                      isLoading={actionLoading === branch.name}
                      onSwitch={handleSwitchBranch}
                      onDelete={() =>
                        setShowDeleteConfirm({ branchName: branch.name, force: false })
                      }
                    />
                  ))}
                </DropdownMenuGroup>
              ) : null}

              {localBranches.length > 0 && remoteBranches.length > 0 && (
                <DropdownMenuSeparator className="bg-foreground/5 dark:bg-white/5" />
              )}

              {/* Remote branches section */}
              {remoteBranches.length > 0 ? (
                <DropdownMenuGroup>
                  <span className="px-2 py-1 text-[8px] text-foreground/25 dark:text-white/25 uppercase tracking-wider font-medium">
                    Remote ({remoteBranches.length})
                  </span>
                  {remoteBranches.map((branch) => (
                    <BranchItem
                      key={branch.name}
                      branch={branch}
                      isRemote
                      isLoading={actionLoading === branch.name}
                      onSwitch={handleCheckoutRemote}
                      onCheckout={() => handleCheckoutRemote(branch.name)}
                    />
                  ))}
                </DropdownMenuGroup>
              ) : null}

              {/* Empty state */}
              {localBranches.length === 0 && remoteBranches.length === 0 && (
                <div className="px-2 py-4 text-[10px] text-foreground/25 dark:text-white/25 text-center">
                  No branches found
                </div>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <DeleteConfirmationDialog
          branchName={showDeleteConfirm.branchName}
          force={showDeleteConfirm.force}
          isLoading={actionLoading === showDeleteConfirm.branchName}
          onConfirm={() =>
            handleDeleteBranch(showDeleteConfirm.branchName, showDeleteConfirm.force)
          }
          onCancel={() => setShowDeleteConfirm(null)}
        />
      )}
    </>
  );
}

// ── sub-components ──────────────────────────────────────────────────────────

/**
 * Individual branch item in the dropdown list.
 * Displays branch name, current marker, and action buttons.
 */
interface BranchItemProps {
  branch: VcsRef;
  isCurrent?: boolean;
  isRemote?: boolean;
  isLoading?: boolean;
  onSwitch: (name: string) => void;
  onDelete?: (name: string) => void;
  onCheckout?: () => void;
}

function BranchItem({
  branch,
  isCurrent,
  isRemote,
  isLoading,
  onSwitch,
  onDelete,
  onCheckout,
}: BranchItemProps) {
  return (
    <DropdownMenuItem
      disabled={isLoading ?? false}
      className={cn(
        "flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm cursor-pointer transition-colors",
        isCurrent && "bg-emerald-500/15",
        !isLoading && "hover:bg-foreground/5 dark:hover:bg-white/5",
        isLoading && "opacity-50 pointer-events-none",
      )}
      // Radix dismisses the menu on select by default, which unmounts
      // DropdownMenuContent — and with it the only place the error banner
      // renders. Switching is async and can fail (a dirty file that differs
      // between branches makes git refuse), so keep the menu mounted and let
      // the success path close it explicitly via `setIsOpen(false)`.
      onSelect={(event) => event.preventDefault()}
      onClick={() => onSwitch(branch.name)}
      role="menuitem"
      aria-current={isCurrent ? "true" : "false"}
      aria-label={`Branch ${branch.name}${isCurrent ? " (current)" : ""}${isRemote ? " (remote, click to checkout)" : ""}`}
      data-branch={branch.name}
      data-is-current={isCurrent}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isCurrent && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
              aria-hidden="true"
            />
          )}
          <div className="text-[11px] font-mono text-foreground/70 dark:text-white/70 truncate">
            {branch.name}
          </div>
          {isRemote && <span className="text-[8px] text-cyan-400/50 flex-shrink-0">remote</span>}
          {branch.isDefault && !isRemote && (
            <span className="text-[8px] text-foreground/30 dark:text-white/30 flex-shrink-0">
              default
            </span>
          )}
        </div>
      </div>

      {/* Action button: Checkout for remote, Delete for local */}
      {isRemote ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckout?.();
                }}
                className={cn(
                  "flex-shrink-0 p-1 rounded-sm transition-colors",
                  "text-foreground/25 dark:text-white/25 hover:text-emerald-400/80 hover:bg-emerald-500/5",
                )}
                aria-label={`Checkout remote branch ${branch.name} as a local branch`}
              />
            }
          >
            <ArrowRightFilled className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipPopup side="left">{`Checkout ${branch.name} as local branch`}</TooltipPopup>
        </Tooltip>
      ) : onDelete && !isCurrent ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(branch.name);
                }}
                className={cn(
                  "flex-shrink-0 p-1 rounded-sm transition-colors",
                  "text-foreground/25 dark:text-white/25 hover:text-red-400/60 hover:bg-red-500/5",
                )}
                aria-label={`Delete branch ${branch.name}`}
              />
            }
          >
            <TrashFilled className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipPopup side="left">{`Delete ${branch.name}`}</TooltipPopup>
        </Tooltip>
      ) : null}
    </DropdownMenuItem>
  );
}

// ── confirmation dialog ─────────────────────────────────────────────────────

/**
 * Delete confirmation modal. Prevents accidental deletion of branches.
 */
interface DeleteConfirmationDialogProps {
  branchName: string;
  force: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmationDialog({
  branchName,
  force,
  isLoading,
  onConfirm,
  onCancel,
}: DeleteConfirmationDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Delete branch confirmation"
    >
      <div className="bg-card rounded-md p-4 max-w-sm mx-4 border border-foreground/10 dark:border-white/10">
        <h3 className="text-sm font-medium text-foreground/90 dark:text-white/90">
          Delete branch?
        </h3>
        <p className="mt-2 text-[10px] text-foreground/60 dark:text-white/60">
          {force
            ? `This will force delete "${branchName}" even if it has unmerged changes.`
            : `This will delete the branch "${branchName}".`}
        </p>
        <div className="mt-4 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-[10px] text-foreground/50 dark:text-white/50 hover:text-foreground/70 dark:hover:text-white/70 bg-foreground/5 dark:bg-white/5 hover:bg-foreground/10 dark:hover:bg-white/10 px-3 py-1.5 rounded-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-sm transition-colors",
              "hover:text-red-300 hover:bg-red-500/15",
              "disabled:opacity-50",
            )}
          >
            {isLoading ? "Deleting…" : force ? "Force Delete" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
