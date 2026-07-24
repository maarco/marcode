import { useState, useCallback, useEffect } from "react";
import { AddFilled, MinusFilled, Refresh2Filled, ClockFilled, BoxFilled } from "@aliimam/icons";
import { WaveSpinner } from "./wave-spinner";
import { useEditorStore, makeFileRef } from "./editor-store";
import { BranchSelector } from "./branch-selector";
import { StashSelector } from "./stash-selector";
import { showToast } from "./toast";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsEnvironment } from "~/state/vcs";
import { useGitStackedAction } from "~/state/sourceControlActions";
import { randomUUID } from "~/lib/utils";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { VcsStatusResult, VcsLogCommit } from "@t3tools/contracts";

/** Extract a user-facing message from a settled atom command result. */
function resultErrorMessage(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag === "Success") return null;
  if (isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.length > 0 ? error.message : "Operation failed";
}

// ── file row ────────────────────────────────────────────────────────────────

type WorkingTreeFile = VcsStatusResult["workingTree"]["files"][number];

function FileRow({
  file,
  included,
  onToggleInclude,
  onFileClick,
}: {
  file: WorkingTreeFile;
  included: boolean;
  onToggleInclude: (path: string, included: boolean) => void;
  onFileClick: (path: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const dir = file.path.includes("/") ? file.path.replace(/\/[^/]*$/, "") : null;

  return (
    <div
      className="group flex items-center gap-1.5 px-3 py-0.5 hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onFileClick(file.path)}
    >
      <span className="text-[9px] font-mono font-bold w-3 shrink-0 text-yellow-400/70">M</span>
      <span
        className="flex-1 text-[11px] font-mono text-foreground/60 dark:text-white/60 truncate"
        title={file.path}
      >
        {file.path.split("/").pop() ?? file.path}
        {dir && (
          <span className="ml-1 text-[9px] text-foreground/25 dark:text-white/25">{dir}</span>
        )}
      </span>
      {/* insertion / deletion stats — flat working-tree model has no staged split */}
      <span className="text-[9px] font-mono shrink-0">
        {file.insertions > 0 && <span className="text-emerald-400/70">+{file.insertions}</span>}
        {file.deletions > 0 && <span className="text-red-400/70"> -{file.deletions}</span>}
      </span>
      {hovered && (
        <div className="flex items-center gap-0.5 shrink-0">
          {included ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleInclude(file.path, false);
              }}
              title="Exclude from commit"
              className="flex items-center justify-center w-5 h-5 rounded text-foreground/30 dark:text-white/30 hover:text-yellow-400/80 hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors"
            >
              <MinusFilled className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleInclude(file.path, true);
              }}
              title="Include in commit"
              className="flex items-center justify-center w-5 h-5 rounded text-foreground/30 dark:text-white/30 hover:text-emerald-400/80 hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors"
            >
              <AddFilled className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── section header ──────────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  onIncludeAll,
}: {
  label: string;
  count: number;
  onIncludeAll?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1 shrink-0">
      <span className="text-[10px] text-foreground/35 dark:text-white/35 uppercase tracking-wider font-medium">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-foreground/25 dark:text-white/25 font-mono">{count}</span>
        {onIncludeAll && (
          <button
            onClick={onIncludeAll}
            title="Include all"
            className="text-[9px] text-foreground/25 dark:text-white/25 hover:text-foreground/60 dark:hover:text-white/60 hover:bg-foreground/5 dark:hover:bg-white/5 px-1.5 py-0.5 rounded transition-colors"
          >
            include all
          </button>
        )}
      </div>
    </div>
  );
}

// ── log view ────────────────────────────────────────────────────────────────

function LogView({ entries }: { entries: readonly VcsLogCommit[] }) {
  if (!entries.length) {
    return (
      <div className="px-3 py-4 text-xs text-foreground/25 dark:text-white/25 text-center">
        no commits yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {entries.map((entry) => (
        <div
          key={entry.sha}
          className="px-3 py-1.5 border-b border-foreground/5 dark:border-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-foreground/25 dark:text-white/25 shrink-0 w-12">
              {entry.shortSha}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-foreground/70 dark:text-white/70 truncate">
            {entry.message}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-foreground/25 dark:text-white/25">{entry.author}</span>
            <span className="text-[9px] text-foreground/20 dark:text-white/20">
              {new Date(entry.date as unknown as number).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
      {entries.length > 0 && (
        <div className="px-3 py-1 text-[9px] text-foreground/20 dark:text-white/20 text-center">
          showing latest {entries.length}
        </div>
      )}
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

type ActiveView = "status" | "stash" | "log";

interface GitPanelProps {
  /** Absolute workspace path (the environment cwd). */
  workspacePath: string;
}

export function GitPanel({ workspacePath }: GitPanelProps) {
  const openDiffFile = useEditorStore((s) => s.openDiffFile);
  const activePaneId = useEditorStore((s) => s.activePaneId);
  const environmentId = useEditorStore((s) => s.environmentId);

  const [commitMsg, setCommitMsg] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("status");
  const [error, setError] = useState<string | null>(null);
  // files excluded from the next commit (default: everything included). The VCS
  // model has no staged/unstaged split — runStackedAction commits the given
  // filePaths directly, so selection is "exclude from commit".
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set());

  const ready = environmentId !== null;

  // ── status subscription (flat working-tree file list) ──────────────────────
  const statusQuery = useEnvironmentQuery(
    ready
      ? vcsEnvironment.status({ environmentId: environmentId!, input: { cwd: workspacePath } })
      : null,
  );
  const logQuery = useEnvironmentQuery(
    ready
      ? vcsEnvironment.log({
          environmentId: environmentId!,
          input: { cwd: workspacePath, limit: 50 },
        })
      : null,
  );

  const refreshStatus = useAtomCommand(vcsEnvironment.refreshStatus, { reportFailure: false });

  // commit/push flow (T3 stacked action — commits selected filePaths directly)
  const stackedAction = useGitStackedAction({ environmentId, cwd: workspacePath });
  const actionPending = stackedAction.isPending;

  const status = statusQuery.data ?? null;
  const workingFiles = status?.workingTree.files ?? [];
  const excludedCount = workingFiles.filter((f) => excludedPaths.has(f.path)).length;
  const selectedFiles = workingFiles.filter((f) => !excludedPaths.has(f.path));
  const totalChanges = workingFiles.length;

  const branchName = status?.refName ?? "…";
  const aheadCount = status?.aheadCount ?? 0;
  const hasUpstream = status?.hasUpstream ?? false;
  const hasPrimaryRemote = status?.hasPrimaryRemote ?? false;
  const canPush = (hasUpstream || hasPrimaryRemote) && aheadCount > 0;

  // surface status subscription errors
  useEffect(() => {
    if (statusQuery.error) setError(statusQuery.error);
  }, [statusQuery.error]);

  const handleManualRefresh = useCallback(() => {
    setError(null);
    if (environmentId === null) return;
    void refreshStatus({ environmentId, input: { cwd: workspacePath } });
    statusQuery.refresh();
  }, [environmentId, refreshStatus, statusQuery, workspacePath]);

  const handleToggleInclude = useCallback((path: string, include: boolean) => {
    setExcludedPaths((prev) => {
      const next = new Set(prev);
      if (include) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleIncludeAll = useCallback(() => {
    setExcludedPaths(new Set());
  }, []);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim() || environmentId === null) return;
    const filePaths = selectedFiles.map((f) => f.path);
    if (filePaths.length === 0) {
      setError("Select at least one file to commit.");
      return;
    }
    setError(null);
    const result = await stackedAction.run({
      actionId: randomUUID(),
      action: "commit",
      commitMessage: commitMsg.trim(),
      filePaths,
    });
    if (result._tag === "Success") {
      setCommitMsg("");
      logQuery.refresh();
      showToast({ type: "success", title: "Committed", message: filePaths.length.toString() });
    } else {
      const message = resultErrorMessage(result);
      if (message) {
        setError(message);
        showToast({ type: "error", title: "Commit failed", message });
      }
    }
  }, [commitMsg, environmentId, logQuery, selectedFiles, stackedAction]);

  const handlePush = useCallback(async () => {
    if (environmentId === null) return;
    setError(null);
    const result = await stackedAction.run({
      actionId: randomUUID(),
      action: "push",
    });
    if (result._tag === "Success") {
      showToast({ type: "success", title: "Pushed", message: "" });
    } else {
      const message = resultErrorMessage(result);
      if (message) {
        setError(message);
        showToast({ type: "error", title: "Push failed", message });
      }
    }
  }, [environmentId, stackedAction]);

  // open a working-tree file in the diff view. Working/modified content comes
  // from the shared project-file layer; the HEAD original is fetched
  // reactively by the editor pane via vcsEnvironment.showFile (see editor-pane).
  const handleFileClick = useCallback(
    (relativePath: string) => {
      if (!activePaneId || !environmentId) return;
      const absPath = workspacePath.endsWith("/")
        ? `${workspacePath}${relativePath}`
        : `${workspacePath}/${relativePath}`;
      const name = relativePath.split("/").pop() ?? relativePath;
      const ext = name.includes(".") ? `.${name.split(".").pop() ?? ""}` : "";
      const ref = makeFileRef(environmentId, workspacePath, absPath, name, ext);
      openDiffFile(activePaneId, ref, "");
    },
    [activePaneId, environmentId, openDiffFile, workspacePath],
  );

  if (statusQuery.isPending && !statusQuery.data) {
    return (
      <div className="flex items-center justify-center py-8">
        <WaveSpinner size="sm" color="muted" animation="ripple" />
      </div>
    );
  }

  if (statusQuery.error && !statusQuery.data) {
    return (
      <div className="px-3 py-4 text-[11px] text-red-400/60 text-center">{statusQuery.error}</div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* branch selector */}
      <div className="px-2 py-1.5 border-b border-foreground/5 dark:border-white/5 shrink-0">
        <BranchSelector workspacePath={workspacePath} />
      </div>

      {/* header: view tabs + actions */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveView("status")}
            title="Changes"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
              activeView === "status"
                ? "text-foreground/80 dark:text-white/80 bg-foreground/10 dark:bg-white/10"
                : "text-foreground/30 dark:text-white/30 hover:text-foreground/60 dark:hover:text-white/60 hover:bg-foreground/5 dark:hover:bg-white/5"
            }`}
          >
            <span className="font-mono">{totalChanges}</span>
          </button>
          <button
            onClick={() => setActiveView("stash")}
            title="Stashes"
            className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
              activeView === "stash"
                ? "text-foreground/80 dark:text-white/80 bg-foreground/10 dark:bg-white/10"
                : "text-foreground/25 dark:text-white/25 hover:text-foreground/60 dark:hover:text-white/60 hover:bg-foreground/5 dark:hover:bg-white/5"
            }`}
          >
            <BoxFilled className="h-3 w-3" />
          </button>
          <button
            onClick={() => setActiveView("log")}
            title="Log"
            className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
              activeView === "log"
                ? "text-foreground/80 dark:text-white/80 bg-foreground/10 dark:bg-white/10"
                : "text-foreground/25 dark:text-white/25 hover:text-foreground/60 dark:hover:text-white/60 hover:bg-foreground/5 dark:hover:bg-white/5"
            }`}
          >
            <ClockFilled className="h-3 w-3" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {activeView === "status" && (
            <button
              onClick={handleManualRefresh}
              disabled={actionPending}
              title="Refresh"
              className="flex items-center justify-center w-6 h-6 rounded text-foreground/25 dark:text-white/25 hover:text-foreground/60 dark:hover:text-white/60 hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
            >
              <Refresh2Filled className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {error && activeView === "status" && (
        <div className="mx-3 mb-1 px-2 py-1 rounded bg-red-500/10 text-[10px] text-red-400/70">
          {error}
        </div>
      )}

      {/* view: stash */}
      {activeView === "stash" && (
        <div className="flex-1 overflow-hidden">
          <StashSelector
            workspacePath={workspacePath}
            onStashApplied={() => handleManualRefresh()}
          />
        </div>
      )}

      {/* view: log */}
      {activeView === "log" && (
        <div className="flex-1 overflow-hidden">
          <LogView entries={logQuery.data?.commits ?? []} />
        </div>
      )}

      {/* view: status */}
      {activeView === "status" && (
        <>
          <div className="flex-1 overflow-y-auto">
            <SectionHeader
              label="Changes"
              count={totalChanges}
              {...(excludedCount > 0 ? { onIncludeAll: handleIncludeAll } : {})}
            />
            {workingFiles.map((f) => (
              <FileRow
                key={f.path}
                file={f}
                included={!excludedPaths.has(f.path)}
                onToggleInclude={handleToggleInclude}
                onFileClick={handleFileClick}
              />
            ))}

            {totalChanges === 0 && (
              <div className="px-3 py-6 text-xs text-foreground/25 dark:text-white/25 text-center">
                no changes
              </div>
            )}
          </div>

          {/* bottom: commit + push */}
          <div className="shrink-0 border-t border-foreground/5 dark:border-white/5 p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {/* inline git branch SVG — @aliimam/icons has no git icon */}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-foreground/30 dark:text-white/30"
                >
                  <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
                  <circle cx="6" cy="18" r="2.5" stroke="currentColor" strokeWidth="2" />
                  <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
                  <line x1="6" y1="8.5" x2="6" y2="15.5" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M6 8.5 C6 12 18 12 18 8.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                </svg>
                <span className="text-[10px] font-mono text-foreground/40 dark:text-white/40">
                  {branchName}
                </span>
              </div>
              {canPush && (
                <button
                  onClick={handlePush}
                  disabled={actionPending}
                  className="flex items-center gap-1 text-[10px] text-foreground/40 dark:text-white/40 hover:text-foreground/70 dark:hover:text-white/70 hover:bg-foreground/5 dark:hover:bg-white/5 px-2 py-0.5 rounded transition-colors disabled:opacity-40"
                >
                  {aheadCount > 0 && <span className="text-cyan-400/60">{aheadCount}</span>}
                  Push
                </button>
              )}
            </div>

            <div className="relative">
              <textarea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleCommit();
                }}
                placeholder="commit message"
                rows={2}
                className="w-full bg-foreground/5 dark:bg-white/5 rounded-md px-2 py-1.5 text-[11px] font-mono text-foreground/60 dark:text-white/60 placeholder:text-foreground/20 dark:placeholder:text-white/20 outline-none resize-none border border-foreground/5 dark:border-white/5 focus:border-foreground/10 dark:focus:border-white/10 transition-colors"
              />
            </div>
            <button
              onClick={handleCommit}
              disabled={actionPending || !commitMsg.trim() || selectedFiles.length === 0}
              className="text-[10px] text-foreground/50 dark:text-white/50 hover:text-foreground/80 dark:hover:text-white/80 bg-foreground/5 dark:bg-white/5 hover:bg-foreground/10 dark:hover:bg-white/10 px-3 py-1 rounded-sm transition-colors focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {actionPending
                ? "Committing..."
                : `Commit${selectedFiles.length < totalChanges ? ` (${selectedFiles.length}/${totalChanges})` : ""}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
