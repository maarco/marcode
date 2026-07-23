import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ProjectScriptIcon } from "@t3tools/contracts";
import {
  FileIcon,
  FolderIcon,
  Globe2Icon,
  MessageSquareIcon,
  PlayIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { readLocalApi } from "../../localApi";
import type {
  UnifiedWorkspaceController,
  UnifiedWorkspaceMutationResult,
  UnifiedWorkspaceNode,
} from "../../unifiedWorkspace/types";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { UnifiedWorkspaceMoveDialog } from "./UnifiedWorkspaceMoveDialog";
import { UnifiedWorkspaceRow, type UnifiedWorkspaceThreadRowExtras } from "./UnifiedWorkspaceRow";
import {
  buildUnifiedWorkspaceContextMenuItems,
  buildUnifiedWorkspaceDragAnnouncement,
  buildUnifiedWorkspaceDropResultAnnouncement,
  buildUnifiedWorkspaceNodeIndex,
  canDropUnifiedWorkspaceNode,
  canDropUnifiedWorkspaceNodeAtRoot,
  flattenVisibleUnifiedWorkspaceNodes,
  isUnifiedWorkspaceNodeCollapsed,
  resolveEdgeMoveTarget,
  resolveLeftKeyAction,
  resolveMoveTargetForDrop,
  resolveMoveTargetForRootGutterDrop,
  resolveRightKeyAction,
  resolveUnifiedWorkspaceDropZone,
  resolveVerticalMoveTarget,
  type UnifiedWorkspaceContextMenuActionId,
  type UnifiedWorkspaceDropZone,
} from "./UnifiedWorkspaceTree.logic";
import { UW_TREE_ROOT_CLASS, UW_TREE_ROOT_GUTTER_CLASS } from "./UnifiedWorkspaceTree.styles";

const ROOT_GUTTER_ID = "__unified-workspace-root-gutter__";

const DROP_ANIMATION: DropAnimation = {
  duration: 150,
  easing: "ease-out",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
};

export type UnifiedWorkspaceTreeThreadAction =
  | "archive"
  | "delete"
  | "mark-unread"
  | "copy-id"
  | "copy-path";

export interface UnifiedWorkspaceTreeProps {
  readonly controller: UnifiedWorkspaceController;
  readonly projectId: string;
  readonly environmentId: string;
  readonly isMobile: boolean;
  /** Roving-tabindex focus, lifted so the project header's Add-item menu can
   * be context-sensitive to it (§9) without duplicating tree-internal state. */
  readonly focusedNodeId: string | null;
  readonly onFocusedNodeIdChange: (nodeId: string | null) => void;
  /** The node id corresponding to the currently-routed/open thread, if any. */
  readonly activeNodeId?: string | null;
  readonly threadRowExtrasByNodeId?: ReadonlyMap<string, UnifiedWorkspaceThreadRowExtras>;
  readonly commandIconByScriptId?: ReadonlyMap<string, ProjectScriptIcon>;
  readonly onThreadAction?: (threadId: string, action: UnifiedWorkspaceTreeThreadAction) => void;
  readonly onOpenPrLink?: (event: MouseEvent, url: string) => void;
  readonly onAddToChat?: (relativePath: string) => void;
  readonly onOpenInFiles?: (node: UnifiedWorkspaceNode) => void;
}

function iconForOverlay(node: UnifiedWorkspaceNode) {
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
      return PlayIcon;
  }
}

function reportMutationFailure(action: string, result: UnifiedWorkspaceMutationResult) {
  if (result.ok) return;
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title: `Unable to ${action}`,
      description: result.message,
    }),
  );
}

function RootGutter({ isActive }: { isActive: boolean }) {
  const { setNodeRef } = useDroppable({ id: ROOT_GUTTER_ID });
  return (
    <div
      ref={setNodeRef}
      data-drop-active={isActive}
      aria-label="Drop here to move to the project root"
      className={UW_TREE_ROOT_GUTTER_CLASS}
    />
  );
}

export function UnifiedWorkspaceTree(props: UnifiedWorkspaceTreeProps) {
  const {
    controller,
    projectId,
    environmentId,
    isMobile,
    focusedNodeId,
    onFocusedNodeIdChange,
    activeNodeId = null,
    threadRowExtrasByNodeId,
    commandIconByScriptId,
    onThreadAction,
    onOpenPrLink,
    onAddToChat,
    onOpenInFiles,
  } = props;

  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [dragState, setDragState] = useState<{
    activeId: string;
    overNodeId: string | null;
    zone: UnifiedWorkspaceDropZone | null;
    overRootGutter: boolean;
  } | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [moveDialogNode, setMoveDialogNode] = useState<UnifiedWorkspaceNode | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");

  const rowElementsRef = useRef(new Map<string, HTMLElement>());
  const registerRowElement = useCallback((nodeId: string, element: HTMLElement | null) => {
    if (element) rowElementsRef.current.set(nodeId, element);
    else rowElementsRef.current.delete(nodeId);
  }, []);

  const autoExpandTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const autoExpandNodeIdRef = useRef<string | null>(null);
  const clearAutoExpandTimer = useCallback(() => {
    if (autoExpandTimeoutRef.current !== null) {
      window.clearTimeout(autoExpandTimeoutRef.current);
      autoExpandTimeoutRef.current = null;
    }
    autoExpandNodeIdRef.current = null;
  }, []);

  const nodeIndex = useMemo(
    () => buildUnifiedWorkspaceNodeIndex(controller.roots),
    [controller.roots],
  );
  const flatRows = useMemo(
    () => flattenVisibleUnifiedWorkspaceNodes(controller.roots, collapsedIds),
    [controller.roots, collapsedIds],
  );

  const focusRow = useCallback(
    (nodeId: string) => {
      onFocusedNodeIdChange(nodeId);
      rowElementsRef.current.get(nodeId)?.scrollIntoView({ block: "nearest" });
    },
    [onFocusedNodeIdChange],
  );

  const moveFocusTo = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) return;
      focusRow(nodeId);
      rowElementsRef.current.get(nodeId)?.focus();
    },
    [focusRow],
  );

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const startRename = useCallback((node: UnifiedWorkspaceNode) => {
    setRenamingNodeId(node.id);
    setRenamingValue(node.label);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingNodeId(null);
    setRenamingValue("");
  }, []);

  const commitRename = useCallback(
    (node: UnifiedWorkspaceNode) => {
      const nextLabel = renamingValue.trim();
      setRenamingNodeId(null);
      if (!nextLabel || nextLabel === node.label) return;
      void controller.renameNode(node.id, nextLabel).then((result) => {
        reportMutationFailure("rename", result);
      });
    },
    [controller, renamingValue],
  );

  const handleActivate = useCallback(
    (node: UnifiedWorkspaceNode) => {
      if (node.kind === "folder") {
        toggleCollapse(node.id);
        return;
      }
      controller.activateNode(node.id);
    },
    [controller, toggleCollapse],
  );

  const dispatchThreadAction = useCallback(
    (node: UnifiedWorkspaceNode, action: UnifiedWorkspaceTreeThreadAction) => {
      if (node.activation.kind !== "thread") return;
      onThreadAction?.(node.activation.threadId, action);
    },
    [onThreadAction],
  );

  const handleContextMenuAction = useCallback(
    async (node: UnifiedWorkspaceNode, actionId: UnifiedWorkspaceContextMenuActionId) => {
      switch (actionId) {
        case "open":
          controller.activateNode(node.id);
          return;
        case "open-in-files":
          onOpenInFiles?.(node);
          controller.activateNode(node.id);
          return;
        case "copy-relative-path":
        case "copy-url": {
          const value = node.tooltip ?? node.label;
          await navigator.clipboard.writeText(value).catch(() => {});
          toastManager.add({
            type: "success",
            title: actionId === "copy-url" ? "URL copied" : "Path copied",
            description: value,
          });
          return;
        }
        case "add-to-chat":
          if (onAddToChat) {
            onAddToChat(node.tooltip ?? node.label);
          } else {
            toastManager.add({
              type: "info",
              title: "Not available yet",
              description: "Adding this to the composer isn't wired up yet.",
            });
          }
          return;
        case "move-to":
          setMoveDialogNode(node);
          return;
        case "new-child-thread":
          controller.createThread({ parentId: node.id });
          return;
        case "rename":
          startRename(node);
          return;
        case "remove": {
          const result = await controller.removeNode(node.id);
          reportMutationFailure("remove from sidebar", result);
          return;
        }
        case "run":
          controller.runCommand(node.id);
          return;
        case "pin-shortcut": {
          const result = await controller.pinBrowserShortcut(node.id);
          reportMutationFailure("pin shortcut", result);
          return;
        }
        case "open-externally":
          if (node.tooltip) window.open(node.tooltip, "_blank", "noopener,noreferrer");
          return;
        case "close-live":
          controller.closeLiveNode(node.id);
          return;
        case "mark-unread":
          dispatchThreadAction(node, "mark-unread");
          return;
        case "archive-thread":
          dispatchThreadAction(node, "archive");
          return;
        case "delete-thread":
          dispatchThreadAction(node, "delete");
          return;
        case "copy-thread-id":
          dispatchThreadAction(node, "copy-id");
          return;
      }
    },
    [controller, dispatchThreadAction, onAddToChat, onOpenInFiles, startRename],
  );

  const openContextMenuForNode = useCallback(
    async (node: UnifiedWorkspaceNode, position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const items = buildUnifiedWorkspaceContextMenuItems({ node });
      const clicked = await api.contextMenu.show(items, position);
      if (!clicked) return;
      void handleContextMenuAction(node, clicked);
    },
    [handleContextMenuAction],
  );

  const handleRowContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>, node: UnifiedWorkspaceNode) => {
      focusRow(node.id);
      void openContextMenuForNode(node, { x: event.clientX, y: event.clientY });
    },
    [focusRow, openContextMenuForNode],
  );

  const handleOpenRowMenu = useCallback(
    (node: UnifiedWorkspaceNode, anchor: { x: number; y: number }) => {
      focusRow(node.id);
      void openContextMenuForNode(node, anchor);
    },
    [focusRow, openContextMenuForNode],
  );

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, node: UnifiedWorkspaceNode) => {
      const isCollapsed = isUnifiedWorkspaceNodeCollapsed(node, collapsedIds);
      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          moveFocusTo(resolveVerticalMoveTarget(flatRows, node.id, "next"));
          return;
        }
        case "ArrowUp": {
          event.preventDefault();
          moveFocusTo(resolveVerticalMoveTarget(flatRows, node.id, "previous"));
          return;
        }
        case "Home": {
          event.preventDefault();
          moveFocusTo(resolveEdgeMoveTarget(flatRows, "home"));
          return;
        }
        case "End": {
          event.preventDefault();
          moveFocusTo(resolveEdgeMoveTarget(flatRows, "end"));
          return;
        }
        case "ArrowRight": {
          const action = resolveRightKeyAction(node, isCollapsed);
          if (action.type === "expand") {
            event.preventDefault();
            toggleCollapse(action.nodeId);
          } else if (action.type === "focus-child") {
            event.preventDefault();
            moveFocusTo(action.nodeId);
          }
          return;
        }
        case "ArrowLeft": {
          const action = resolveLeftKeyAction(node, isCollapsed);
          if (action.type === "collapse") {
            event.preventDefault();
            toggleCollapse(action.nodeId);
          } else if (action.type === "focus-parent") {
            event.preventDefault();
            moveFocusTo(action.nodeId);
          }
          return;
        }
        case "Enter": {
          event.preventDefault();
          handleActivate(node);
          return;
        }
        case "F2": {
          if (node.canRename) {
            event.preventDefault();
            startRename(node);
          }
          return;
        }
        case "Delete":
        case "Backspace": {
          event.preventDefault();
          if (node.kind === "thread") {
            dispatchThreadAction(node, "delete");
          } else if (node.canRemove) {
            void controller.removeNode(node.id).then((result) => {
              reportMutationFailure("remove from sidebar", result);
            });
          }
          return;
        }
        case "ContextMenu": {
          event.preventDefault();
          const rect = rowElementsRef.current.get(node.id)?.getBoundingClientRect();
          void openContextMenuForNode(node, { x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
          return;
        }
        case "F10": {
          if (event.shiftKey) {
            event.preventDefault();
            const rect = rowElementsRef.current.get(node.id)?.getBoundingClientRect();
            void openContextMenuForNode(node, { x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
          }
          return;
        }
        default:
          return;
      }
    },
    [
      collapsedIds,
      controller,
      dispatchThreadAction,
      flatRows,
      handleActivate,
      moveFocusTo,
      openContextMenuForNode,
      startRename,
      toggleCollapse,
    ],
  );

  const handleRowActivate = useCallback(
    (node: UnifiedWorkspaceNode, _event: MouseEvent) => {
      handleActivate(node);
    },
    [handleActivate],
  );

  // ── Drag and drop ────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const node = event.active.data.current?.node as UnifiedWorkspaceNode | undefined;
    setDragState({
      activeId: String(event.active.id),
      overNodeId: null,
      zone: null,
      overRootGutter: false,
    });
    setLiveMessage(
      buildUnifiedWorkspaceDragAnnouncement({
        phase: "start",
        draggedLabel: node ? node.label : String(event.active.id),
      }),
    );
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const draggedId = String(event.active.id);
      const draggedNode = nodeIndex.byId.get(draggedId);

      if (!event.over || event.over.id === ROOT_GUTTER_ID) {
        clearAutoExpandTimer();
        const overRootGutter = event.over?.id === ROOT_GUTTER_ID;
        setDragState({ activeId: draggedId, overNodeId: null, zone: null, overRootGutter });
        if (draggedNode) {
          setLiveMessage(
            buildUnifiedWorkspaceDragAnnouncement({
              phase: "over",
              draggedLabel: draggedNode.label,
              targetLabel: null,
            }),
          );
        }
        return;
      }

      const overNodeId = String(event.over.id);
      const overNode = nodeIndex.byId.get(overNodeId);
      if (!overNode || !draggedNode) return;

      const overRect = event.over.rect;
      const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
      const pointerOffsetY = activeRect
        ? activeRect.top + activeRect.height / 2 - overRect.top
        : overRect.height / 2;
      const rawZone = resolveUnifiedWorkspaceDropZone({
        pointerOffsetY,
        rowHeight: overRect.height,
        canHaveChildren: overNode.canHaveChildren,
      });

      const isValid = canDropUnifiedWorkspaceNode({
        index: nodeIndex,
        draggedNodeId: draggedId,
        targetNodeId: overNodeId,
        zone: rawZone,
      });

      if (autoExpandNodeIdRef.current !== overNodeId) {
        clearAutoExpandTimer();
        if (
          rawZone === "inside" &&
          overNode.canHaveChildren &&
          isUnifiedWorkspaceNodeCollapsed(overNode, collapsedIds)
        ) {
          autoExpandNodeIdRef.current = overNodeId;
          autoExpandTimeoutRef.current = window.setTimeout(() => {
            toggleCollapse(overNodeId);
            autoExpandNodeIdRef.current = null;
          }, 600);
        }
      }

      setDragState({
        activeId: draggedId,
        overNodeId: isValid ? overNodeId : null,
        zone: isValid ? rawZone : null,
        overRootGutter: false,
      });
      setLiveMessage(
        buildUnifiedWorkspaceDragAnnouncement({
          phase: "over",
          draggedLabel: draggedNode.label,
          targetLabel: overNode.label,
          zone: isValid ? rawZone : null,
        }),
      );
    },
    [clearAutoExpandTimer, collapsedIds, nodeIndex, toggleCollapse],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      clearAutoExpandTimer();
      const draggedId = String(event.active.id);
      const draggedNode = nodeIndex.byId.get(draggedId);
      const currentDragState = dragState;
      setDragState(null);
      if (!draggedNode) return;

      const label = draggedNode.label;

      if (currentDragState?.overRootGutter) {
        if (!canDropUnifiedWorkspaceNodeAtRoot({ index: nodeIndex, draggedNodeId: draggedId })) {
          setLiveMessage(
            buildUnifiedWorkspaceDropResultAnnouncement({
              draggedLabel: label,
              result: "rejected",
            }),
          );
          return;
        }
        const target = resolveMoveTargetForRootGutterDrop(draggedId);
        void controller.moveNode(target).then((result) => {
          setLiveMessage(
            buildUnifiedWorkspaceDropResultAnnouncement({
              draggedLabel: label,
              result: result.ok ? "success" : "rejected",
              reason: result.ok ? null : result.message,
            }),
          );
          reportMutationFailure("move", result);
        });
        return;
      }

      if (!currentDragState?.overNodeId || !currentDragState.zone) {
        setLiveMessage(
          buildUnifiedWorkspaceDragAnnouncement({ phase: "cancel", draggedLabel: label }),
        );
        return;
      }

      const target = resolveMoveTargetForDrop({
        index: nodeIndex,
        draggedNodeId: draggedId,
        targetNodeId: currentDragState.overNodeId,
        zone: currentDragState.zone,
      });
      if (!target) return;

      void controller.moveNode(target).then((result) => {
        setLiveMessage(
          buildUnifiedWorkspaceDropResultAnnouncement({
            draggedLabel: label,
            result: result.ok ? "success" : "rejected",
            reason: result.ok ? null : result.message,
          }),
        );
        reportMutationFailure("move", result);
      });
    },
    [clearAutoExpandTimer, controller, dragState, nodeIndex],
  );

  const handleDragCancel = useCallback(
    (event: DragCancelEvent) => {
      clearAutoExpandTimer();
      setDragState(null);
      const node = nodeIndex.byId.get(String(event.active.id));
      setLiveMessage(
        buildUnifiedWorkspaceDragAnnouncement({
          phase: "cancel",
          draggedLabel: node ? node.label : String(event.active.id),
        }),
      );
    },
    [clearAutoExpandTimer, nodeIndex],
  );

  useEffect(() => clearAutoExpandTimer, [clearAutoExpandTimer]);

  const handleMoveConfirm = useCallback(
    (target: { parentId: string | null }) => {
      if (!moveDialogNode) return;
      void controller
        .moveNode({ nodeId: moveDialogNode.id, parentId: target.parentId, beforeId: null })
        .then((result) => reportMutationFailure("move", result));
    },
    [controller, moveDialogNode],
  );

  const activeDraggedNode = dragState ? nodeIndex.byId.get(dragState.activeId) : null;
  const OverlayIcon = activeDraggedNode ? iconForOverlay(activeDraggedNode) : null;

  return (
    <div
      data-unified-workspace-tree
      className="relative min-w-0"
      style={
        {
          "--uw-tree-row-height": "1.75rem",
          "--uw-tree-row-height-touch": "2.5rem",
          "--uw-tree-indent": "0.875rem",
          "--uw-tree-icon-size": "0.875rem",
          "--uw-tree-guide-color": "color-mix(in srgb, var(--border) 70%, transparent)",
          "--uw-tree-drop-color": "var(--ring)",
        } as CSSProperties
      }
    >
      {!controller.capabilities.canMutate && (
        <Alert
          variant="warning"
          className="mx-1 mb-1 rounded-md border-warning/40 bg-warning/8 px-2 py-1.5"
        >
          <AlertTitle className="text-[11px]">Read-only tree</AlertTitle>
          <AlertDescription className="text-[10px]">
            {controller.capabilities.reason ??
              "Attaching and moving items isn't available right now."}
          </AlertDescription>
        </Alert>
      )}

      <DndContext
        id={`unified-workspace-dnd-${environmentId}-${projectId}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={flatRows.map((row) => row.node.id)}
          strategy={verticalListSortingStrategy}
        >
          <div role="tree" aria-label="Project workspace" className={UW_TREE_ROOT_CLASS}>
            {flatRows.map(({ node }) => (
              <UnifiedWorkspaceRow
                key={node.id}
                node={node}
                isCollapsed={isUnifiedWorkspaceNodeCollapsed(node, collapsedIds)}
                isFocused={
                  focusedNodeId === node.id ||
                  (focusedNodeId === null && flatRows[0]?.node.id === node.id)
                }
                isActive={activeNodeId === node.id}
                isSelected={false}
                isDropTarget={
                  dragState?.overNodeId === node.id && dragState.zone
                    ? { zone: dragState.zone }
                    : null
                }
                isMobile={isMobile}
                threadExtras={threadRowExtrasByNodeId?.get(node.id) ?? null}
                commandIcon={
                  node.activation.kind === "command"
                    ? (commandIconByScriptId?.get(node.activation.scriptId) ?? null)
                    : null
                }
                renamingValue={renamingNodeId === node.id ? renamingValue : null}
                onToggleCollapse={toggleCollapse}
                onActivate={handleRowActivate}
                onFocusRow={focusRow}
                onRowKeyDown={handleRowKeyDown}
                onRowContextMenu={handleRowContextMenu}
                onOpenRowMenu={handleOpenRowMenu}
                onOpenPrLink={onOpenPrLink ?? (() => {})}
                onStartRename={startRename}
                onRenamingValueChange={setRenamingValue}
                onCommitRename={commitRename}
                onCancelRename={cancelRename}
                registerRowElement={registerRowElement}
              />
            ))}
            {flatRows.length === 0 && (
              <p className="px-2 py-3 text-center text-[11px] text-muted-foreground/60">
                Nothing here yet — use “New thread” to get started.
              </p>
            )}
          </div>
        </SortableContext>

        <RootGutter isActive={dragState?.overRootGutter === true} />

        <DragOverlay dropAnimation={DROP_ANIMATION}>
          {activeDraggedNode && OverlayIcon ? (
            <div className="flex max-w-64 items-center gap-1.5 rounded-md border border-border/60 bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-lg">
              <OverlayIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{activeDraggedNode.label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div aria-live="assertive" role="status" className="sr-only">
        {liveMessage}
      </div>

      <UnifiedWorkspaceMoveDialog
        open={moveDialogNode !== null}
        onOpenChange={(open) => {
          if (!open) setMoveDialogNode(null);
        }}
        sourceNode={moveDialogNode}
        roots={controller.roots}
        onConfirm={handleMoveConfirm}
      />
    </div>
  );
}
