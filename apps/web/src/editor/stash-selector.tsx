import { useState, useCallback, useEffect, useRef } from "react";
import {
  BoxFilled,
  TrashFilled,
  AddFilled,
  Refresh2Filled,
  ArrowRightFilled,
  CloseCircleFilled,
  Warning2Filled,
  TickCircleFilled,
  DocumentFilled,
} from "@aliimam/icons";
import { cva } from "class-variance-authority";
import { cn } from "~/lib/utils";
import { WaveSpinner } from "./wave-spinner";
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
import type { VcsStash } from "@t3tools/contracts";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

// ── types ──────────────────────────────────────────────────────────────────

interface StashSelectorProps {
  workspacePath: string;
  onStashApplied?: (stashId: string) => void;
}

/** Extract a user-facing message from a settled atom command result. */
function resultErrorMessage(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag === "Success") return null;
  if (isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.length > 0 ? error.message : "Operation failed";
}

/** Short, locale-formatted date for a stash entry. */
function formatStashDate(date: VcsStash["date"]): string {
  const parsed = new Date(date as unknown as number);
  return Number.isNaN(parsed.getTime()) ? String(date as unknown) : parsed.toLocaleString();
}

// ── styles ─────────────────────────────────────────────────────────────────

const stashRowVariants = cva(
  "group flex items-center gap-3 px-3 py-1.5 hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors cursor-default border-b border-foreground/5 dark:border-white/5 last:border-0",
  {
    variants: {
      loading: {
        true: "opacity-60 pointer-events-none",
        false: "",
      },
    },
  },
);

const conflictBadgeVariants = cva(
  "inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-medium",
  {
    variants: {
      severity: {
        none: "bg-emerald-400/15 text-emerald-400",
        conflict: "bg-red-500/15 text-red-400",
      },
    },
    defaultVariants: {
      severity: "none",
    },
  },
);

// ── focus trap hook ────────────────────────────────────────────────────────

function useFocusTrap(
  containerRef: React.RefObject<HTMLDivElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusableSelectors =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const firstFocusable = container.querySelector<HTMLElement>(focusableSelectors);
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelectors),
      ).filter((el) => !el.hasAttribute("disabled"));

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [active, containerRef, onEscape]);
}

// ── stash row ──────────────────────────────────────────────────────────────

function StashRow({
  stash,
  loading,
  onApply,
  onDrop,
  onView,
}: {
  stash: VcsStash;
  loading?: boolean;
  onApply: (stash: VcsStash) => void;
  onDrop: (stash: VcsStash) => void;
  onView: (stash: VcsStash) => void;
}) {
  // stash.id is already the full "stash@{N}" selector — do not re-wrap it.
  const stashLabel = stash.message || stash.id;

  return (
    <div role="listitem" className={stashRowVariants({ loading })}>
      {/*
        Two lines, not five fixed-width columns. This row came from mentiko's
        full-width panel; in the editor's 240px git sidebar the old
        w-20 + w-24 + w-24 + actions columns had a ~340px intrinsic minimum, so
        the row overflowed and the View / Apply / Delete buttons sat outside the
        visible area — reachable only by horizontally scrolling a sidebar, and
        never on screen at the same time as the message.

        Line 1 is the message with the actions pinned right; line 2 carries the
        id, branch and date. Every field the columns showed is still shown, and
        `min-w-0` lets both lines ellipsis instead of pushing the row wider.
      */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="flex-1 min-w-0 text-[10px] text-foreground/70 dark:text-white/70 truncate" />
              }
            >
              {stash.message}
            </TooltipTrigger>
            <TooltipPopup side="bottom">{stash.message}</TooltipPopup>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2 min-w-0 text-[9px]">
          <span className="shrink-0 font-mono text-foreground/40 dark:text-white/40">
            {stash.id}
          </span>
          <Tooltip>
            <TooltipTrigger render={<span className="min-w-0 text-cyan-400/60 truncate" />}>
              {stash.branch}
            </TooltipTrigger>
            <TooltipPopup side="bottom">{stash.branch}</TooltipPopup>
          </Tooltip>
          <span className="shrink-0 ml-auto text-foreground/25 dark:text-white/25">
            {formatStashDate(stash.date)}
          </span>
        </div>
      </div>

      {/* Actions — always in DOM; visible on hover or focus-within for keyboard users */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          onClick={() => onView(stash)}
          aria-label={`View ${stashLabel} diff`}
          className="flex items-center justify-center w-5 h-5 rounded text-foreground/25 dark:text-white/25 hover:text-foreground/60 dark:hover:text-white/60 hover:bg-foreground/5 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50 transition-colors"
        >
          <DocumentFilled className="h-3 w-3" />
        </button>
        <button
          onClick={() => onApply(stash)}
          aria-label={`Apply ${stashLabel}`}
          className="flex items-center justify-center w-5 h-5 rounded text-foreground/25 dark:text-white/25 hover:text-emerald-400/80 hover:bg-foreground/5 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50 transition-colors"
        >
          <ArrowRightFilled className="h-3 w-3" />
        </button>
        <button
          onClick={() => onDrop(stash)}
          aria-label={`Delete ${stashLabel}`}
          className="flex items-center justify-center w-5 h-5 rounded text-foreground/25 dark:text-white/25 hover:text-red-400/80 hover:bg-foreground/5 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50 transition-colors"
        >
          <TrashFilled className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── create stash dialog ────────────────────────────────────────────────────

interface CreateStashDialogProps {
  open: boolean;
  loading: boolean;
  error?: string | null;
  onSubmit: (message: string) => void;
  onOpenChange: (open: boolean) => void;
}

function CreateStashDialog({
  open,
  loading,
  error,
  onSubmit,
  onOpenChange,
}: CreateStashDialogProps) {
  const [message, setMessage] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const maxChars = 200;
  const isValid = message.length <= maxChars;
  const charCountId = "create-stash-char-count";
  const errorId = "create-stash-error";
  const titleId = "create-stash-dialog-title";
  const textareaId = "create-stash-message";

  useFocusTrap(containerRef, open, () => onOpenChange(false));

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit(message.trim());
    setMessage("");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-card border border-foreground/10 dark:border-white/10 rounded-md w-96 max-w-full mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5 dark:border-white/5">
          <h2
            id={titleId}
            className="text-[12px] font-medium text-foreground/90 dark:text-white/90"
          >
            Create Stash
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close create stash dialog"
            className="p-1 text-foreground/40 dark:text-white/40 hover:text-foreground/70 dark:hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50 transition-colors"
          >
            <CloseCircleFilled className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div>
            <label
              htmlFor={textareaId}
              className="text-[10px] font-medium text-foreground/60 dark:text-white/60 uppercase"
            >
              Message (optional)
            </label>
            <textarea
              id={textareaId}
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
              placeholder="e.g., Fix login bug"
              disabled={loading}
              aria-describedby={`${charCountId}${error ? ` ${errorId}` : ""}${!isValid ? ` ${charCountId}` : ""}`}
              aria-invalid={!isValid}
              className={cn(
                "w-full mt-2 px-3 py-2 bg-foreground/5 dark:bg-white/5 border border-foreground/10 dark:border-white/10 rounded text-[11px] text-foreground dark:text-white placeholder-foreground/30 dark:placeholder-white/30",
                "focus:outline-none focus:border-foreground/30 dark:focus:border-white/30 focus:ring-1 focus:ring-foreground/20 dark:focus:ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40 dark:focus-visible:outline-white/40 transition-colors resize-none",
                loading && "opacity-50",
              )}
              rows={3}
            />
            <div className="flex items-center justify-between mt-1" aria-live="polite">
              <span id={charCountId} className="text-[9px] text-foreground/40 dark:text-white/40">
                {message.length} / {maxChars}
              </span>
              {!isValid && (
                <span className="text-[9px] text-red-400" role="alert">
                  Max {maxChars} characters
                </span>
              )}
            </div>
          </div>

          {error && (
            <div
              id={errorId}
              role="alert"
              className="px-3 py-2 bg-red-500/15 border border-red-400/30 rounded text-[10px] text-red-400"
            >
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-foreground/5 dark:border-white/5">
          <button
            onClick={() => {
              onOpenChange(false);
              setMessage("");
            }}
            disabled={loading}
            className={cn(
              "px-3 py-1.5 text-[10px] font-medium rounded transition-colors",
              "text-foreground/60 dark:text-white/60 hover:text-foreground/90 dark:hover:text-white/90 hover:bg-foreground/5 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50",
              loading && "opacity-50 cursor-not-allowed",
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !isValid}
            aria-disabled={loading || !isValid}
            className={cn(
              "px-3 py-1.5 text-[10px] font-medium rounded transition-colors",
              "bg-emerald-400/20 text-emerald-400 hover:bg-emerald-400/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400/70",
              (loading || !isValid) && "opacity-50 cursor-not-allowed",
            )}
          >
            {loading ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── apply stash confirm dialog (pre-apply confirmation) ─────────────────────

interface ApplyStashConfirmDialogProps {
  open: boolean;
  stash: VcsStash;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

function ApplyStashConfirmDialog({
  open,
  stash,
  onConfirm,
  onOpenChange,
}: ApplyStashConfirmDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = "apply-stash-confirm-title";

  useFocusTrap(containerRef, open, () => onOpenChange(false));

  if (!open) return null;

  const stashLabel = stash.message || stash.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-card border border-foreground/10 dark:border-white/10 rounded-md w-96 max-w-full mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5 dark:border-white/5">
          <h2
            id={titleId}
            className="text-[12px] font-medium text-foreground/90 dark:text-white/90"
          >
            Apply Stash
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close apply stash dialog"
            className="p-1 text-foreground/40 dark:text-white/40 hover:text-foreground/70 dark:hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50 transition-colors"
          >
            <CloseCircleFilled className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-foreground/70 dark:text-white/70">
            Apply <strong className="font-mono">{stashLabel}</strong> to the working tree?
          </p>
          <div
            role="note"
            className="flex items-start gap-2 px-3 py-2 bg-amber-500/15 border border-amber-400/30 rounded text-[10px] text-amber-400"
          >
            <Warning2Filled className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Applying a stash can cause merge conflicts if the working tree has diverged.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-foreground/5 dark:border-white/5">
          <button
            onClick={() => onOpenChange(false)}
            className={cn(
              "px-3 py-1.5 text-[10px] font-medium rounded transition-colors",
              "text-foreground/60 dark:text-white/60 hover:text-foreground/90 dark:hover:text-white/90 hover:bg-foreground/5 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50",
            )}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={cn(
              "px-3 py-1.5 text-[10px] font-medium rounded transition-colors",
              "bg-emerald-400/20 text-emerald-400 hover:bg-emerald-400/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400/70",
            )}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ── drop stash confirmation dialog ─────────────────────────────────────────

interface DropStashConfirmDialogProps {
  open: boolean;
  stash: VcsStash;
  loading: boolean;
  error?: string | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

function DropStashConfirmDialog({
  open,
  stash,
  loading,
  error,
  onConfirm,
  onOpenChange,
}: DropStashConfirmDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = "drop-stash-dialog-title";
  const errorId = "drop-stash-error";

  useFocusTrap(containerRef, open, () => onOpenChange(false));

  if (!open) return null;

  const stashLabel = stash.message || stash.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-card border border-foreground/10 dark:border-white/10 rounded-md w-96 max-w-full mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5 dark:border-white/5">
          <h2
            id={titleId}
            className="text-[12px] font-medium text-foreground/90 dark:text-white/90"
          >
            Delete Stash
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close delete stash dialog"
            className="p-1 text-foreground/40 dark:text-white/40 hover:text-foreground/70 dark:hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50 transition-colors"
          >
            <CloseCircleFilled className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-[11px] text-foreground/70 dark:text-white/70">
            Delete <strong>{stashLabel}</strong>? This action cannot be undone.
          </p>

          <dl className="space-y-2 px-3 py-2 bg-foreground/5 dark:bg-white/5 border border-foreground/10 dark:border-white/10 rounded">
            <div className="flex items-center gap-2">
              <dt className="text-[10px] font-medium text-foreground/50 dark:text-white/50 w-16">
                Stash:
              </dt>
              <dd className="text-[10px] font-mono text-foreground/70 dark:text-white/70">
                {stash.id}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-[10px] font-medium text-foreground/50 dark:text-white/50 w-16">
                Message:
              </dt>
              <dd className="text-[10px] text-foreground/70 dark:text-white/70 truncate">
                {stash.message}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-[10px] font-medium text-foreground/50 dark:text-white/50 w-16">
                Branch:
              </dt>
              <dd className="text-[10px] text-foreground/70 dark:text-white/70">{stash.branch}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-[10px] font-medium text-foreground/50 dark:text-white/50 w-16">
                Date:
              </dt>
              <dd className="text-[10px] text-foreground/70 dark:text-white/70">
                {formatStashDate(stash.date)}
              </dd>
            </div>
          </dl>

          {error && (
            <div
              id={errorId}
              role="alert"
              className="px-3 py-2 bg-red-500/15 border border-red-400/30 rounded text-[10px] text-red-400"
            >
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-foreground/5 dark:border-white/5">
          <button
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className={cn(
              "px-3 py-1.5 text-[10px] font-medium rounded transition-colors",
              "text-foreground/60 dark:text-white/60 hover:text-foreground/90 dark:hover:text-white/90 hover:bg-foreground/5 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50",
              loading && "opacity-50 cursor-not-allowed",
            )}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "px-3 py-1.5 text-[10px] font-medium rounded transition-colors",
              "bg-red-500/20 text-red-400 hover:bg-red-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-400/70",
              loading && "opacity-50 cursor-not-allowed",
            )}
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── main stash panel ───────────────────────────────────────────────────────

export function StashSelector({ workspacePath, onStashApplied }: StashSelectorProps) {
  const environmentId = useEditorStore((s) => s.environmentId);
  const activePaneId = useEditorStore((s) => s.activePaneId);
  const openVirtualFile = useEditorStore((s) => s.openVirtualFile);

  // ── queries ───────────────────────────────────────────────────────────────
  const listQuery = useEnvironmentQuery(
    environmentId !== null
      ? vcsEnvironment.listStashes({ environmentId, input: { cwd: workspacePath } })
      : null,
  );
  const refresh = listQuery.refresh;

  // view a stash patch: feed the showStash diff into a read-only editor tab.
  // Holds the full stash (not just its id) so commitSha survives to the
  // request below for stale-index re-resolution — see VcsStash.commitSha.
  const [viewingStash, setViewingStash] = useState<VcsStash | null>(null);
  const showStashQuery = useEnvironmentQuery(
    environmentId !== null && viewingStash !== null
      ? vcsEnvironment.showStash({
          environmentId,
          input: { cwd: workspacePath, id: viewingStash.id, commitSha: viewingStash.commitSha },
        })
      : null,
  );

  const stashes = listQuery.data?.stashes ?? [];
  const loading = listQuery.isPending && stashes.length === 0;
  const error = listQuery.error;

  // ── state management ──────────────────────────────────────────────────────
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Pre-apply confirmation: stash pending user confirmation before applying.
  const [applyConfirmStash, setApplyConfirmStash] = useState<VcsStash | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);

  const [showDropDialog, setShowDropDialog] = useState<VcsStash | null>(null);
  const [dropLoading, setDropLoading] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  // True while any mutation is in flight.
  const isMutating = createLoading || applyLoading || dropLoading;

  // ── commands ──────────────────────────────────────────────────────────────
  const createStash = useAtomCommand(vcsEnvironment.createStash, { reportFailure: false });
  const applyStash = useAtomCommand(vcsEnvironment.applyStash, { reportFailure: false });
  const dropStash = useAtomCommand(vcsEnvironment.dropStash, { reportFailure: false });

  // ── view stash diff (showStash → read-only editor tab) ─────────────────────
  useEffect(() => {
    if (viewingStash === null || activePaneId === null) return;
    const diff = showStashQuery.data?.diff;
    if (diff === undefined) return; // still loading
    const base = workspacePath.endsWith("/") ? workspacePath.slice(0, -1) : workspacePath;
    const virtualPath = `${base}/.diffs/stash-${viewingStash.id}.diff`;
    const name = (viewingStash.message || viewingStash.id).slice(0, 60);
    openVirtualFile(activePaneId, virtualPath, name, diff);
    setViewingStash(null);
  }, [viewingStash, showStashQuery.data, activePaneId, openVirtualFile, workspacePath]);

  useEffect(() => {
    if (viewingStash !== null && showStashQuery.error) {
      showToast({
        type: "error",
        title: "Failed to load stash diff",
        message: showStashQuery.error,
      });
      setViewingStash(null);
    }
  }, [viewingStash, showStashQuery.error]);

  // ── create stash ──────────────────────────────────────────────────────────
  const handleCreateStash = useCallback(
    async (message: string) => {
      if (environmentId === null) return;
      setCreateLoading(true);
      setCreateError(null);
      try {
        const result = await createStash({
          environmentId,
          input: {
            cwd: workspacePath,
            ...(message ? { message } : {}),
            includeUntracked: true,
          },
        });

        const failure = resultErrorMessage(result);
        if (failure) {
          setCreateError(failure);
          showToast({ type: "error", title: "Failed to create stash", message: failure });
          return;
        }

        showToast({ type: "success", title: "Stash created", message: "" });
        setShowCreateDialog(false);
        refresh();
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to create stash";
        setCreateError(errorMsg);
        showToast({ type: "error", title: "Failed to create stash", message: errorMsg });
      } finally {
        setCreateLoading(false);
      }
    },
    [createStash, environmentId, refresh, workspacePath],
  );

  // ── apply stash ───────────────────────────────────────────────────────────
  // Opens a confirmation dialog first; the actual apply runs only after the
  // user confirms (see runApplyStash).
  const requestApplyStash = useCallback((stash: VcsStash) => {
    setApplyConfirmStash(stash);
  }, []);

  const runApplyStash = useCallback(
    async (stash: VcsStash) => {
      if (environmentId === null) return;
      setApplyConfirmStash(null);
      setApplyLoading(true);
      try {
        // commitSha (captured when this stash was listed) lets the server
        // re-resolve the current stash@{N} for it and refuse rather than
        // silently applying whatever now sits at a stale index.
        const result = await applyStash({
          environmentId,
          input: { cwd: workspacePath, id: stash.id, commitSha: stash.commitSha },
        });

        const failure = resultErrorMessage(result);
        if (failure) {
          showToast({ type: "error", title: "Failed to apply stash", message: failure });
          return;
        }

        showToast({ type: "success", title: "Stash applied", message: stash.id });
        onStashApplied?.(stash.id);
        refresh();
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to apply stash";
        showToast({ type: "error", title: "Failed to apply stash", message: errorMsg });
      } finally {
        setApplyLoading(false);
      }
    },
    [applyStash, environmentId, onStashApplied, refresh, workspacePath],
  );

  // ── drop stash ────────────────────────────────────────────────────────────
  const handleDropStash = useCallback(
    async (stash: VcsStash) => {
      if (environmentId === null) return;
      setDropLoading(true);
      setDropError(null);
      try {
        // Same stale-index guard as apply — drop is irreversible.
        const result = await dropStash({
          environmentId,
          input: { cwd: workspacePath, id: stash.id, commitSha: stash.commitSha },
        });

        const failure = resultErrorMessage(result);
        if (failure) {
          setDropError(failure);
          showToast({ type: "error", title: "Failed to delete stash", message: failure });
          return;
        }

        showToast({ type: "success", title: "Stash deleted", message: stash.id });
        setShowDropDialog(null);
        refresh();
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to delete stash";
        setDropError(errorMsg);
        showToast({ type: "error", title: "Failed to delete stash", message: errorMsg });
      } finally {
        setDropLoading(false);
      }
    },
    [dropStash, environmentId, refresh, workspacePath],
  );

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-card text-foreground/70 dark:text-white/70 overflow-hidden border-t border-foreground/5 dark:border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-foreground/5 dark:border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <BoxFilled className="h-4 w-4 text-foreground/50 dark:text-white/50" aria-hidden="true" />
          <span
            className="text-[11px] font-medium text-foreground/70 dark:text-white/70"
            aria-live="polite"
            aria-atomic="true"
          >
            {stashes.length} {stashes.length === 1 ? "stash" : "stashes"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refresh()}
            disabled={loading || isMutating}
            aria-label="Refresh stash list"
            className="p-1 text-foreground/40 dark:text-white/40 hover:text-foreground/70 dark:hover:text-white/70 hover:bg-foreground/5 dark:hover:bg-white/5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/50 dark:focus-visible:outline-white/50 transition-colors disabled:opacity-50"
          >
            <Refresh2Filled className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => {
              setShowCreateDialog(true);
              setCreateError(null);
            }}
            disabled={loading || isMutating}
            aria-label="Create new stash"
            className="p-1 text-foreground/40 dark:text-white/40 hover:text-emerald-400/80 hover:bg-foreground/5 dark:hover:bg-white/5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400/60 transition-colors disabled:opacity-50"
          >
            <AddFilled className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div
            role="status"
            aria-label="Loading stashes"
            className="flex items-center justify-center h-32"
          >
            <WaveSpinner size="sm" />
          </div>
        )}

        {error && !loading && (
          <div className="p-4 space-y-3">
            <div
              role="alert"
              className="px-3 py-2 bg-red-500/15 border border-red-400/30 rounded text-[10px] text-red-400"
            >
              {error}
            </div>
            <button
              onClick={() => refresh()}
              className="w-full px-3 py-1.5 text-[10px] font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-400/60 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && stashes.length === 0 && (
          <div
            role="status"
            className="flex items-center justify-center h-32 text-foreground/40 dark:text-white/40"
          >
            <span className="text-[11px]">No stashes yet</span>
          </div>
        )}

        {!loading && !error && stashes.length > 0 && (
          <div role="list" aria-label="Git stashes">
            {stashes.map((stash) => (
              <StashRow
                key={stash.id}
                stash={stash}
                loading={isMutating}
                onApply={requestApplyStash}
                onDrop={setShowDropDialog}
                onView={setViewingStash}
              />
            ))}
          </div>
        )}

        {/* Conflict awareness badge — shown while an apply is in flight. The
            VCS apply atom surfaces success/failure via the result, not a
            conflict list, so this is a lightweight status hint. */}
        {applyLoading && (
          <div
            role="status"
            aria-label="Applying stash"
            className={conflictBadgeVariants({ severity: "none" })}
          >
            <TickCircleFilled className="h-3 w-3" aria-hidden="true" /> Applying…
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateStashDialog
        open={showCreateDialog}
        loading={createLoading}
        error={createError}
        onSubmit={handleCreateStash}
        onOpenChange={setShowCreateDialog}
      />

      {applyConfirmStash && (
        <ApplyStashConfirmDialog
          open={true}
          stash={applyConfirmStash}
          onConfirm={() => runApplyStash(applyConfirmStash)}
          onOpenChange={(open) => {
            if (!open) setApplyConfirmStash(null);
          }}
        />
      )}

      {showDropDialog && (
        <DropStashConfirmDialog
          open={true}
          stash={showDropDialog}
          loading={dropLoading}
          error={dropError}
          onConfirm={() => handleDropStash(showDropDialog)}
          onOpenChange={(open) => {
            if (!open) {
              setShowDropDialog(null);
              setDropError(null);
            }
          }}
        />
      )}
    </div>
  );
}
