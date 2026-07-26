import {
  DndContext,
  DragOverlay,
  KeyboardCode,
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
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
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
  collectUnifiedWorkspaceAncestorIds,
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
import {
  UW_TREE_ACCORDION_CONTENT_CLASS,
  UW_TREE_ACCORDION_FOLDER_CLASS,
  UW_TREE_DRAG_OVERLAY_CLASS,
  UW_TREE_ROOT_CLASS,
  UW_TREE_ROOT_GUTTER_CLASS,
} from "./UnifiedWorkspaceTree.styles";

const ROOT_GUTTER_ID = "__unified-workspace-root-gutter__";

const DROP_ANIMATION: DropAnimation = {
  duration: 150,
  easing: "ease-out",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
};

// §12.6: dnd-kit's drop animation is a JS-supplied duration the reduced-motion
// CSS rule in index.css (`[data-unified-workspace-tree] * { transition-duration:
// 0ms }`) cannot reach, so it's zeroed here the same way the rest of the app
// checks the media query (see ChatView.tsx/draftHeroTransition.ts) — a
// one-time read at mount, not a live-subscribed listener.
const REDUCED_MOTION_DROP_ANIMATION: DropAnimation = {
  duration: 0,
  easing: "linear",
};

export type UnifiedWorkspaceTreeThreadAction =
  | "archive"
  | "delete"
  | "mark-unread"
  | "copy-id"
  | "copy-path";

/**
 * Imperative escape hatch for the project header's Add-item menu (mounted
 * outside this component — §9), used only for "on duplicate, focus and
 * reveal the existing node" instead of a toast. Expands whatever collapsed
 * ancestors are hiding the row, then scrolls/focuses it once rendered.
 */
export interface UnifiedWorkspaceTreeHandle {
  focusAndRevealNode: (nodeId: string) => void;
}

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
  // Matches `useOpenPrLink()`'s actual return signature (see
  // lib/openPullRequestLink.ts and Sidebar.tsx's existing flat-list
  // `SidebarThreadRowProps.openPrLink`) — narrower than the tree's other
  // generic `MouseEvent` row-event props because that's the one real
  // implementation callers pass in.
  readonly onOpenPrLink?: (event: MouseEvent<HTMLElement>, url: string) => void;
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

/**
 * True for a file/folder node projected live from the on-disk index with no
 * persisted `ProjectWorkspaceEntry` behind it (`buildTree.ts`'s ambient
 * projection), as opposed to a real attached/placed workspace item.
 */
function isAmbientFolderNode(node: UnifiedWorkspaceNode): boolean {
  return node.isAmbient && node.kind === "folder";
}

/**
 * An ambient folder's `children` are only materialized once its relativePath
 * is in `expandedAmbientDirs` (`buildTree.ts`'s lazy one-level-deep gate), so
 * `children.length === 0` means "not expanded yet," never "genuinely empty" —
 * an ambient folder with nothing to show never gets `canHaveChildren: true`
 * in the first place (see `buildAmbientNode`). Falling back to `collapsedIds`
 * for these nodes like every other kind would show an expanded (▼) arrow over
 * an empty list on first paint, because unknown ids default to "expanded"
 * there — exactly backwards for a folder that hasn't materialized children
 * yet. Basing the ambient branch on "has anything actually been materialized"
 * keeps the arrow honest and self-corrects the moment the controller's
 * `toggleAmbientFolder` fills `children` in on the next render.
 */
function resolveRowCollapsed(
  node: UnifiedWorkspaceNode,
  collapsedIds: ReadonlySet<string>,
): boolean {
  if (isAmbientFolderNode(node)) return node.canHaveChildren && node.children.length === 0;
  return isUnifiedWorkspaceNodeCollapsed(node, collapsedIds);
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

export const UnifiedWorkspaceTree = forwardRef<
  UnifiedWorkspaceTreeHandle,
  UnifiedWorkspaceTreeProps
>(function UnifiedWorkspaceTree(props, ref) {
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

  // Layout-mutation capability (§17): read-only degrades drag pickup and the
  // move/attach-adjacent context-menu items, but never the thread-lifecycle
  // actions (archive/delete/mark-unread), which don't touch project layout.
  const canMutate = controller.capabilities.canMutate;

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

  // `number`, not `ReturnType<typeof window.setTimeout>` — this repo's tsconfig
  // pulls in Node's ambient `setTimeout` overload too, which would otherwise
  // resolve to Node's `Timeout` handle instead of the DOM `number` handle.
  const autoExpandTimeoutRef = useRef<number | null>(null);
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

  // Duplicate-attach "focus and reveal" (§9), driven imperatively from the
  // project header's Add-item menu via `focusAndRevealNode` below. Expanding
  // a collapsed ancestor doesn't render the target row until the next
  // commit, so the actual scroll/focus is deferred to an effect keyed on
  // `flatRows` rather than attempted synchronously here.
  const pendingRevealNodeIdRef = useRef<string | null>(null);

  const focusAndRevealNode = useCallback(
    (nodeId: string) => {
      if (!nodeIndex.byId.has(nodeId)) return;
      const ancestorIds = collectUnifiedWorkspaceAncestorIds(nodeIndex, nodeId);
      if (ancestorIds.length > 0) {
        setCollapsedIds((prev) => {
          if (!ancestorIds.some((id) => prev.has(id))) return prev;
          const next = new Set(prev);
          for (const id of ancestorIds) next.delete(id);
          return next;
        });
      }
      onFocusedNodeIdChange(nodeId);
      pendingRevealNodeIdRef.current = nodeId;
    },
    [nodeIndex, onFocusedNodeIdChange],
  );

  // Depends on `focusedNodeId` too, not just `flatRows`: when the target
  // needs no ancestor expansion (already visible), `collapsedIds` never
  // changes, so `flatRows` never changes either — without `focusedNodeId`
  // (which `focusAndRevealNode` always updates) in the dependency list,
  // this effect would never re-run for that case and the reveal would
  // silently no-op.
  useEffect(() => {
    const pendingNodeId = pendingRevealNodeIdRef.current;
    if (!pendingNodeId) return;
    const element = rowElementsRef.current.get(pendingNodeId);
    if (!element) return; // ancestor expansion hasn't committed/rendered this row yet
    pendingRevealNodeIdRef.current = null;
    element.scrollIntoView({ block: "nearest" });
    element.focus();
  }, [focusedNodeId, flatRows]);

  useImperativeHandle(ref, () => ({ focusAndRevealNode }), [focusAndRevealNode]);

  const toggleCollapse = useCallback(
    (nodeId: string) => {
      const node = nodeIndex.byId.get(nodeId);
      if (node && isAmbientFolderNode(node)) {
        // Ambient folders have no persisted entry to locally hide/show —
        // their disclosure arrow instead asks the controller to
        // materialize/hide real on-disk children one level deep
        // (buildTree.ts's `expandedAmbientDirs`). Keeping this out of
        // `collapsedIds` (used below for every other node kind) is what
        // keeps `resolveRowCollapsed` consistent — see its docstring.
        controller.toggleAmbientFolder(nodeId);
        return;
      }
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    },
    [nodeIndex, controller],
  );

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
      const items = buildUnifiedWorkspaceContextMenuItems({ node, canMutate });
      const clicked = await api.contextMenu.show(items, position);
      if (!clicked) return;
      void handleContextMenuAction(node, clicked);
    },
    [canMutate, handleContextMenuAction],
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
      const isCollapsed = resolveRowCollapsed(node, collapsedIds);
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
          if (isAmbientFolderNode(node) && node.canHaveChildren && node.children.length === 0) {
            // `resolveRightKeyAction` (UnifiedWorkspaceTree.logic.ts) gates its
            // "expand" action on `children.length > 0`, which never holds for
            // an ambient folder before its first expansion — children
            // materialize lazily (see `resolveRowCollapsed`). Handle that one
            // case here instead of asking it to reason about a tree shape it
            // can't see yet.
            event.preventDefault();
            toggleCollapse(node.id);
            return;
          }
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
    // dnd-kit's `defaultKeyboardCodes` treats BOTH Space and Enter as
    // pick-up/drop keys. Left at the default, pressing Enter on any movable
    // row (the common case — most kinds default `canMove: true`) never
    // reaches `onRowKeyDown`'s "Enter: activate" case at all: the sensor's
    // activator handler (`KeyboardSensor.activators[0]`, @dnd-kit/core)
    // calls `event.preventDefault()` for Enter unconditionally and starts a
    // keyboard drag instead, per spec §10 that's two distinct keys — Space
    // picks up for movement, Enter activates — so Enter must NOT double as
    // a drag key here.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space],
      },
    }),
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
          resolveRowCollapsed(overNode, collapsedIds)
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

  const renderVisibleRows = (nodes: readonly UnifiedWorkspaceNode[]): ReactNode =>
    nodes.map((node) => {
      const isCollapsed = resolveRowCollapsed(node, collapsedIds);
      const hasVisibleChildren = node.canHaveChildren && node.children.length > 0 && !isCollapsed;
      const row = (
        <UnifiedWorkspaceRow
          key={node.id}
          node={node}
          isCollapsed={isCollapsed}
          isFocused={
            focusedNodeId === node.id ||
            (focusedNodeId === null && flatRows[0]?.node.id === node.id)
          }
          isActive={activeNodeId === node.id}
          isSelected={false}
          isDropTarget={
            dragState?.overNodeId === node.id && dragState.zone ? { zone: dragState.zone } : null
          }
          isMobile={isMobile}
          canMutate={canMutate}
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
      );

      if (!node.canHaveChildren || node.children.length === 0) return row;

      return (
        <div
          key={node.id}
          data-accordion-folder={node.kind === "folder" || undefined}
          className={node.kind === "folder" ? UW_TREE_ACCORDION_FOLDER_CLASS : "contents"}
        >
          {row}
          {hasVisibleChildren && (
            <div
              data-accordion-content={node.kind === "folder" || undefined}
              className={node.kind === "folder" ? UW_TREE_ACCORDION_CONTENT_CLASS : "contents"}
            >
              {renderVisibleRows(node.children)}
            </div>
          )}
        </div>
      );
    });

  // One-time read, same pattern as ChatView.tsx/draftHeroTransition.ts — see
  // `REDUCED_MOTION_DROP_ANIMATION`'s comment.
  const prefersReducedMotion = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );

  return (
    // The six `--uw-tree-*` variables are defined in index.css under this
    // same `[data-unified-workspace-tree]` attribute (§12.3) — no inline
    // style here, so the coarse-pointer/mobile and reduced-motion overrides
    // that live in CSS aren't shadowed by a same-element inline value.
    <div data-unified-workspace-tree className="relative min-w-0">
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
            {renderVisibleRows(controller.roots)}
            {flatRows.length === 0 && (
              <p className="px-2 py-3 text-center text-[11px] text-muted-foreground/60">
                Nothing here yet — use “New thread” to get started.
              </p>
            )}
          </div>
        </SortableContext>

        <RootGutter isActive={dragState?.overRootGutter === true} />

        <DragOverlay
          dropAnimation={prefersReducedMotion ? REDUCED_MOTION_DROP_ANIMATION : DROP_ANIMATION}
        >
          {activeDraggedNode && OverlayIcon ? (
            <div className={UW_TREE_DRAG_OVERLAY_CLASS}>
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
});
