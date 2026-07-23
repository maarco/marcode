import { useSortable } from "@dnd-kit/sortable";
import type { ProjectScriptIcon } from "@t3tools/contracts";
import {
  BugIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  EllipsisIcon,
  FileIcon,
  FlaskConicalIcon,
  FolderGit2Icon,
  FolderIcon,
  Globe2Icon,
  HammerIcon,
  MessageSquareIcon,
  PlayIcon,
  SettingsIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { UnifiedWorkspaceNode } from "../../unifiedWorkspace/types";
import { cn } from "../../lib/utils";
import { ChangeRequestStatusIcon, ThreadStatusLabel } from "../ThreadStatusIndicators";
import type { ThreadStatusPill } from "../Sidebar.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatWorktreePathForDisplay } from "../../worktreeCleanup";
import type { UnifiedWorkspaceDropZone } from "./UnifiedWorkspaceTree.logic";
import { unifiedWorkspaceRowIndentStyle } from "./UnifiedWorkspaceTree.logic";
import {
  UW_TREE_DISCLOSURE_CLASS,
  UW_TREE_DISCLOSURE_SPACER_CLASS,
  UW_TREE_DROP_INSIDE_CLASS,
  UW_TREE_DROP_LINE_CLASS,
  UW_TREE_HOVER_ACTIONS_CLASS,
  UW_TREE_ICON_CLASS,
  UW_TREE_LABEL_CLASS,
  UW_TREE_META_CLASS,
  UW_TREE_ROW_CLASS,
} from "./UnifiedWorkspaceTree.styles";

/**
 * Same taxonomy as `ProjectScriptIcon`, rendered in lucide's outline language
 * instead of ProjectScriptsControl's `@aliimam` filled glyphs — mixing icon
 * languages inside the tree would reintroduce the "bright rainbow" look §12.1
 * explicitly forbids.
 */
const COMMAND_ICON_BY_SCRIPT_ICON: Record<ProjectScriptIcon, typeof PlayIcon> = {
  play: PlayIcon,
  test: FlaskConicalIcon,
  lint: ClipboardCheckIcon,
  configure: SettingsIcon,
  build: HammerIcon,
  debug: BugIcon,
};

/**
 * Richer per-thread presentation data that the frozen `UnifiedWorkspaceNode`
 * doesn't carry (session status beyond pending-approval/awaiting-input, PR
 * state, worktree, remote-environment label, jump hints, relative time).
 * Sidebar.tsx computes this with the exact same pure helpers/components the
 * old flat thread list already used and passes it down per thread node id —
 * this component still makes no store reads of its own.
 */
export interface UnifiedWorkspaceThreadRowExtras {
  readonly statusPill: ThreadStatusPill | null;
  readonly prStatus: { tooltip: string; url: string; colorClass: string } | null;
  readonly terminalRunning: { label: string; colorClass: string; pulse: boolean } | null;
  readonly remoteEnvironmentLabel: string | null;
  readonly jumpLabel: string | null;
  readonly relativeTimeLabel: string | null;
  readonly worktreePath: string | null;
  readonly branch: string | null;
}

export interface UnifiedWorkspaceRowDropIndicator {
  readonly zone: UnifiedWorkspaceDropZone;
}

export interface UnifiedWorkspaceRowProps {
  readonly node: UnifiedWorkspaceNode;
  readonly isCollapsed: boolean;
  readonly isFocused: boolean;
  readonly isActive: boolean;
  readonly isSelected: boolean;
  readonly isMobile: boolean;
  readonly isDropTarget: UnifiedWorkspaceRowDropIndicator | null;
  readonly threadExtras: UnifiedWorkspaceThreadRowExtras | null;
  readonly commandIcon: ProjectScriptIcon | null;
  /** Non-null while this row is the one being renamed inline (F2 / context menu). */
  readonly renamingValue: string | null;
  readonly onToggleCollapse: (nodeId: string) => void;
  readonly onActivate: (node: UnifiedWorkspaceNode, event: MouseEvent) => void;
  readonly onFocusRow: (nodeId: string) => void;
  readonly onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>, node: UnifiedWorkspaceNode) => void;
  readonly onRowContextMenu: (
    event: MouseEvent<HTMLDivElement>,
    node: UnifiedWorkspaceNode,
  ) => void;
  readonly onOpenRowMenu: (node: UnifiedWorkspaceNode, anchor: { x: number; y: number }) => void;
  readonly onOpenPrLink: (event: MouseEvent, url: string) => void;
  readonly onStartRename: (node: UnifiedWorkspaceNode) => void;
  readonly onRenamingValueChange: (value: string) => void;
  readonly onCommitRename: (node: UnifiedWorkspaceNode) => void;
  readonly onCancelRename: () => void;
  readonly registerRowElement: (nodeId: string, element: HTMLElement | null) => void;
}

function iconForNode(node: UnifiedWorkspaceNode, commandIcon: ProjectScriptIcon | null) {
  if (node.isBroken) return TriangleAlertIcon;
  switch (node.kind) {
    case "file":
      return FileIcon;
    case "folder":
      return FolderIcon;
    case "thread":
      return MessageSquareIcon;
    case "terminal":
      return TerminalIcon;
    case "browser":
    case "url":
      return Globe2Icon;
    case "command":
      return commandIcon ? COMMAND_ICON_BY_SCRIPT_ICON[commandIcon] : PlayIcon;
  }
}

/**
 * The frozen `UnifiedWorkspaceStatus` union only carries hasPendingApprovals /
 * hasPendingUserInput for thread-kind nodes (not Working/Connecting/Completed/
 * Plan Ready — those need session/latestTurn/interactionMode, which aren't on
 * the controller's node shape). When Sidebar.tsx supplies the fuller
 * `threadExtras.statusPill` (computed with the existing `resolveThreadStatusPill`),
 * prefer it and don't also render the controller's narrower pending badge —
 * otherwise a pending-approval thread would show the same pill twice.
 */
/**
 * Mirrors `ThreadWorktreeIndicator`'s tooltip copy exactly, without needing
 * that component's branded `ThreadId` — this row only has the tree node's own
 * compound id (`node:<env>:<project>:<item>`), not a real `ThreadId`, and the
 * indicator's rendering only ever depends on branch/worktreePath strings.
 */
function worktreeTooltip(worktreePath: string, branch: string | null): string {
  const displayPath = formatWorktreePathForDisplay(worktreePath);
  return branch ? `Worktree: ${displayPath} (${branch})` : `Worktree: ${displayPath}`;
}

function fallbackThreadStatusPill(node: UnifiedWorkspaceNode): ThreadStatusPill | null {
  if (node.status?.kind !== "thread") return null;
  if (node.status.hasPendingApprovals) {
    return {
      label: "Pending Approval",
      colorClass: "text-amber-600 dark:text-amber-300/90",
      dotClass: "bg-amber-500 dark:bg-amber-300/90",
      pulse: false,
    };
  }
  if (node.status.hasPendingUserInput) {
    return {
      label: "Awaiting Input",
      colorClass: "text-indigo-600 dark:text-indigo-300/90",
      dotClass: "bg-indigo-500 dark:bg-indigo-300/90",
      pulse: false,
    };
  }
  return null;
}

export const UnifiedWorkspaceRow = memo(function UnifiedWorkspaceRow(
  props: UnifiedWorkspaceRowProps,
) {
  const {
    node,
    isCollapsed,
    isFocused,
    isActive,
    isSelected,
    isMobile,
    isDropTarget,
    threadExtras,
    commandIcon,
    renamingValue,
    onToggleCollapse,
    onActivate,
    onFocusRow,
    onRowKeyDown,
    onRowContextMenu,
    onOpenRowMenu,
    onOpenPrLink,
    onStartRename,
    onRenamingValueChange,
    onCommitRename,
    onCancelRename,
    registerRowElement,
  } = props;
  const isRenaming = renamingValue !== null;

  const sortable = useSortable({
    id: node.id,
    data: { node },
    disabled: !node.canMove,
  });
  const { attributes, listeners, setNodeRef, isDragging } = sortable;
  // dnd-kit's default `attributes` include their own `role`/`tabIndex`
  // (generic "draggable button" semantics) that would silently clobber this
  // row's own ARIA-treeitem role and roving-tabindex if spread wholesale —
  // keep the rest (e.g. `aria-roledescription`, `aria-disabled`) but let this
  // row's own JSX attributes win for those two.
  const {
    role: _dndRole,
    tabIndex: _dndTabIndex,
    ...dndAttributesWithoutRoleOrTabIndex
  } = attributes;

  const combinedNodeRef = useCallback(
    (element: HTMLElement | null) => {
      setNodeRef(element);
      registerRowElement(node.id, element);
    },
    [node.id, registerRowElement, setNodeRef],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      onFocusRow(node.id);
      onActivate(node, event);
    },
    [node, onActivate, onFocusRow],
  );

  const handleDisclosureClick = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onToggleCollapse(node.id);
    },
    [node.id, onToggleCollapse],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // Let dnd-kit's keyboard sensor see the event first (Space picks the row
      // up for keyboard-driven reordering, arrows move it while picked up).
      // Only handle tree navigation ourselves once dnd-kit declines the key.
      listeners?.onKeyDown?.(event);
      if (event.defaultPrevented) return;
      onRowKeyDown(event, node);
    },
    [listeners, node, onRowKeyDown],
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      onRowContextMenu(event, node);
    },
    [node, onRowContextMenu],
  );

  const handleDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      // On mobile the first tap navigates and closes the sidebar sheet, so
      // there's no reliable "second click" to land an inline rename — same
      // guard the existing thread row double-click-to-rename uses.
      if (isMobile || !node.canRename || isRenaming) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if ((event.target as HTMLElement).closest("button, a, input")) return;
      event.preventDefault();
      onStartRename(node);
    },
    [isMobile, isRenaming, node, onStartRename],
  );

  const handleFocus = useCallback(() => onFocusRow(node.id), [node.id, onFocusRow]);

  const handleMenuButtonClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      onOpenRowMenu(node, { x: rect.left, y: rect.bottom + 2 });
    },
    [node, onOpenRowMenu],
  );

  const handlePrClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!threadExtras?.prStatus) return;
      onOpenPrLink(event, threadExtras.prStatus.url);
    },
    [onOpenPrLink, threadExtras],
  );

  // Reset the "did the user already commit/cancel" latch each time a NEW
  // rename session starts on this row — not every render, or a second
  // rename attempt on the same row instance would silently no-op on blur.
  const renameCommittedRef = useRef(false);
  useEffect(() => {
    if (isRenaming) renameCommittedRef.current = false;
  }, [isRenaming]);
  const handleRenameInputRef = useCallback((element: HTMLInputElement | null) => {
    if (element) {
      element.focus();
      element.select();
    }
  }, []);
  const handleRenameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onRenamingValueChange(event.target.value),
    [onRenamingValueChange],
  );
  const handleRenameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        renameCommittedRef.current = true;
        onCommitRename(node);
      } else if (event.key === "Escape") {
        event.preventDefault();
        renameCommittedRef.current = true;
        onCancelRename();
      }
    },
    [node, onCancelRename, onCommitRename],
  );
  const handleRenameBlur = useCallback(() => {
    if (!renameCommittedRef.current) onCommitRename(node);
  }, [node, onCommitRename]);
  const handleRenameClick = useCallback((event: MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  }, []);

  const Icon = useMemo(() => iconForNode(node, commandIcon), [node, commandIcon]);
  const indentStyle = useMemo(() => unifiedWorkspaceRowIndentStyle(node.depth), [node.depth]);
  const statusPill = threadExtras?.statusPill ?? fallbackThreadStatusPill(node);

  const dropZoneClassName =
    isDropTarget?.zone === "inside"
      ? UW_TREE_DROP_INSIDE_CLASS
      : isDropTarget?.zone === "before"
        ? `${UW_TREE_DROP_LINE_CLASS} -top-px`
        : isDropTarget?.zone === "after"
          ? `${UW_TREE_DROP_LINE_CLASS} -bottom-px`
          : "";

  return (
    <div
      ref={combinedNodeRef}
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={node.canHaveChildren ? !isCollapsed : undefined}
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
      data-active={isActive}
      data-selected={isSelected}
      data-broken={node.isBroken}
      data-unified-workspace-row
      data-node-id={node.id}
      className={cn(UW_TREE_ROW_CLASS, isDragging && "opacity-40", dropZoneClassName)}
      style={indentStyle}
      {...dndAttributesWithoutRoleOrTabIndex}
      {...listeners}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      onFocus={handleFocus}
    >
      {node.canHaveChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={isCollapsed ? `Expand ${node.label}` : `Collapse ${node.label}`}
          className={cn(UW_TREE_DISCLOSURE_CLASS, !isCollapsed && "rotate-90")}
          onClick={handleDisclosureClick}
        >
          <ChevronRightIcon className="size-3" />
        </button>
      ) : (
        <span aria-hidden="true" className={UW_TREE_DISCLOSURE_SPACER_CLASS} />
      )}

      {(node.kind === "browser" || node.kind === "url") && node.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny favicon, not a Next.js app
        <img src={node.iconUrl} alt="" className="size-3.5 shrink-0 rounded-sm" />
      ) : (
        <Icon
          className={cn(
            UW_TREE_ICON_CLASS,
            node.isBroken &&
              "text-warning-foreground group-data-[active=true]/workspace-row:text-warning-foreground",
          )}
        />
      )}

      {isRenaming ? (
        <input
          ref={handleRenameInputRef}
          className="min-w-0 flex-1 truncate rounded border border-ring bg-transparent px-0.5 text-xs outline-none"
          value={renamingValue ?? ""}
          onChange={handleRenameChange}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameBlur}
          onClick={handleRenameClick}
          onDoubleClick={handleRenameClick}
        />
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span className={UW_TREE_LABEL_CLASS}>{node.label}</span>} />
          <TooltipPopup side="top" className="max-w-80 whitespace-normal leading-tight">
            {node.isBroken
              ? `Path not found: ${node.tooltip ?? node.label}`
              : (node.tooltip ?? node.label)}
          </TooltipPopup>
        </Tooltip>
      )}

      {/* Disambiguates two rows sharing a basename (e.g. two "README.md" —
          one an ambient root file, one an attached ".plans/README.md") when
          this row isn't rendered where its own disk path would put it.
          Short by design (immediate parent dir only) — the full path is
          already in the label's tooltip above, so this never needs to carry
          the whole thing itself. */}
      {!isRenaming && node.disambiguator && (
        <span className="max-w-24 shrink-0 truncate text-[10px] text-muted-foreground">
          · {node.disambiguator}
        </span>
      )}

      <span className={UW_TREE_META_CLASS}>
        {node.isBroken && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="img"
                  aria-label={`Path not found: ${node.tooltip ?? node.label}`}
                  className="inline-flex items-center justify-center text-warning-foreground"
                />
              }
            >
              <TriangleAlertIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="top">Path not found: {node.tooltip ?? node.label}</TooltipPopup>
          </Tooltip>
        )}
        {node.status?.kind === "port" && <span className="tabular-nums">:{node.status.port}</span>}
        {threadExtras?.prStatus && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={threadExtras.prStatus.tooltip}
                  className={cn(
                    "inline-flex items-center justify-center rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
                    threadExtras.prStatus.colorClass,
                  )}
                  onClick={handlePrClick}
                >
                  <ChangeRequestStatusIcon className="size-3" />
                </button>
              }
            />
            <TooltipPopup side="top">{threadExtras.prStatus.tooltip}</TooltipPopup>
          </Tooltip>
        )}
        {statusPill && <ThreadStatusLabel compact status={statusPill} />}
        {threadExtras?.terminalRunning && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="img"
                  aria-label={threadExtras.terminalRunning.label}
                  className={cn(
                    "inline-flex items-center justify-center",
                    threadExtras.terminalRunning.colorClass,
                  )}
                />
              }
            >
              <TerminalIcon
                className={cn(
                  "size-3",
                  threadExtras.terminalRunning.pulse && "animate-status-pulse",
                )}
              />
            </TooltipTrigger>
            <TooltipPopup side="top">{threadExtras.terminalRunning.label}</TooltipPopup>
          </Tooltip>
        )}
        {threadExtras?.worktreePath && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="img"
                  aria-label={worktreeTooltip(threadExtras.worktreePath, threadExtras.branch)}
                  className="inline-flex items-center justify-center"
                />
              }
            >
              <FolderGit2Icon className="size-3 text-muted-foreground/40" />
            </TooltipTrigger>
            <TooltipPopup side="top">
              {worktreeTooltip(threadExtras.worktreePath, threadExtras.branch)}
            </TooltipPopup>
          </Tooltip>
        )}
        {threadExtras?.remoteEnvironmentLabel && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  aria-label={threadExtras.remoteEnvironmentLabel}
                  className="inline-flex items-center justify-center"
                />
              }
            >
              <Globe2Icon className="size-3 text-muted-foreground/40" />
            </TooltipTrigger>
            <TooltipPopup side="top">{threadExtras.remoteEnvironmentLabel}</TooltipPopup>
          </Tooltip>
        )}
        {threadExtras?.jumpLabel ? (
          <span className="inline-flex h-5 items-center rounded-full border border-border/80 bg-background/90 px-1.5 font-mono text-[10px] font-medium tracking-tight text-foreground shadow-sm">
            {threadExtras.jumpLabel}
          </span>
        ) : threadExtras?.relativeTimeLabel ? (
          <span className="tabular-nums">{threadExtras.relativeTimeLabel}</span>
        ) : null}
      </span>

      <span className={UW_TREE_HOVER_ACTIONS_CLASS}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`More actions for ${node.label}`}
                data-testid={`uw-row-menu-${node.id}`}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                onClick={handleMenuButtonClick}
              />
            }
          >
            <EllipsisIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup side="top">More actions</TooltipPopup>
        </Tooltip>
      </span>
    </div>
  );
});
