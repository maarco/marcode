/**
 * Translates `UnifiedWorkspaceNode` activation into the existing
 * navigation/right-panel/preview/command operations. Spec §8.
 *
 * The actual RPC/store/router calls are injected via `ops` — this module
 * never touches React, a store, or the network directly, which is what keeps
 * it unit-testable without a DOM. `useUnifiedWorkspaceProject.ts` is the only
 * caller and supplies real `ops` backed by the existing stores/hooks.
 *
 * No React import.
 */
import { getUnifiedWorkspaceDescendantIds } from "./treeOperations";
import type { UnifiedWorkspaceNode } from "./types";

export interface UnifiedWorkspaceActivationOps {
  readonly navigateToThread: (threadId: string) => void;
  /**
   * Resolves the project's reusable draft (existing composer draft session)
   * or creates a new one placed under `parentId`, navigates to it, and
   * returns its identity synchronously so the caller can immediately target
   * a right-panel/preview/command operation at it. Mirrors
   * `useHandleNewThread.ts`'s existing draft-reuse rule; never commits a
   * server thread by itself (spec §8 File: "never create a committed server
   * thread merely because a file row was single-clicked").
   *
   * `parentId` must be a persisted node's id (or `null`) — an ambient node
   * has no persisted entry to nest under, so callers pass `null` for those
   * (see the `file`/`folder` cases below). The server would reject a
   * placement under an ambient id as "parent does not exist" anyway; this
   * just avoids the doomed round trip and its error toast.
   */
  readonly ensureDraftThread: (input: { parentId: string | null }) => {
    readonly draftId: string;
    readonly threadId: string;
  };
  readonly openFile: (threadId: string, relativePath: string) => void;
  readonly openFilesSurface: (threadId: string) => void;
  readonly openTerminal: (threadId: string, terminalId: string) => void;
  readonly openBrowser: (threadId: string, tabId: string) => void;
  readonly runCommand: (threadId: string, scriptId: string) => void;
  /** Opens a fresh preview tab at `url` (desktop-only; distinct from `openBrowser`, which targets an already-live tab). */
  readonly openUrlInPreview: (threadId: string, url: string) => void;
  readonly openUrlExternally: (url: string) => void;
}

export interface UnifiedWorkspaceActivationInput {
  readonly node: UnifiedWorkspaceNode;
  /** Every node in the current tree, flattened — used for descendant-thread lookup. */
  readonly nodesById: ReadonlyMap<string, UnifiedWorkspaceNode>;
  readonly projectId: string;
  /** The thread currently open in the content view, if any, and the physical project it belongs to. */
  readonly activeThreadId: string | null;
  readonly activeThreadProjectId: string | null;
  /** Last-visited timestamp (ISO) per threadId, for "most recently active descendant thread". */
  readonly threadRecencyById: ReadonlyMap<string, string>;
  /** Threads eligible as an activation target (unarchived, undeleted). */
  readonly validThreadIds: ReadonlySet<string>;
  /** True on desktop (embedded `<webview>` preview); false on web. */
  readonly runtimeSupportsEmbeddedPreview: boolean;
  readonly ops: UnifiedWorkspaceActivationOps;
}

/**
 * Spec §8 shared thread-context resolution (file/folder/command/url):
 * 1. active thread when it belongs to the same physical project;
 * 2. most recently active descendant thread;
 * 3. existing project draft thread;
 * 4. new project draft thread.
 *
 * Steps 3/4 are collapsed into one `ensureDraftThread` op call — see its doc.
 */
function resolveActivationThreadId(input: UnifiedWorkspaceActivationInput): string | null {
  if (input.activeThreadId !== null && input.activeThreadProjectId === input.projectId) {
    return input.activeThreadId;
  }

  const descendantThreadIds = getUnifiedWorkspaceDescendantIds(
    input.node.id,
    input.nodesById,
  ).flatMap((id) => {
    const descendant = input.nodesById.get(id);
    return descendant &&
      descendant.activation.kind === "thread" &&
      input.validThreadIds.has(descendant.activation.threadId)
      ? [descendant.activation.threadId]
      : [];
  });
  if (descendantThreadIds.length === 0) {
    return null;
  }
  return descendantThreadIds.toSorted((a, b) => {
    const recencyA = input.threadRecencyById.get(a) ?? "";
    const recencyB = input.threadRecencyById.get(b) ?? "";
    return recencyB.localeCompare(recencyA);
  })[0]!;
}

/**
 * Resolves (steps 1-2) or ensures a draft (steps 3-4) and returns the
 * threadId every subsequent op in this activation should target.
 * `draftPlacementParentId` seeds a freshly-created draft's placement (spec
 * §9): pass the activating file/folder node's own id, or `null` when there is
 * no sensible nesting target (command/url).
 */
function resolveThreadIdForActivation(
  input: UnifiedWorkspaceActivationInput,
  draftPlacementParentId: string | null,
): string {
  const existing = resolveActivationThreadId(input);
  if (existing !== null) {
    input.ops.navigateToThread(existing);
    return existing;
  }
  return input.ops.ensureDraftThread({ parentId: draftPlacementParentId }).threadId;
}

export function activateUnifiedWorkspaceNode(input: UnifiedWorkspaceActivationInput): void {
  const { node, ops } = input;
  switch (node.activation.kind) {
    case "thread": {
      ops.navigateToThread(node.activation.threadId);
      return;
    }
    case "terminal": {
      ops.navigateToThread(node.activation.threadId);
      ops.openTerminal(node.activation.threadId, node.activation.terminalId);
      return;
    }
    case "browser": {
      ops.navigateToThread(node.activation.threadId);
      ops.openBrowser(node.activation.threadId, node.activation.tabId);
      return;
    }
    case "file": {
      const threadId = resolveThreadIdForActivation(input, node.isAmbient ? null : node.id);
      ops.openFile(threadId, node.activation.relativePath);
      return;
    }
    case "folder": {
      const threadId = resolveThreadIdForActivation(input, node.isAmbient ? null : node.id);
      ops.openFilesSurface(threadId);
      return;
    }
    case "command": {
      const threadId = resolveThreadIdForActivation(input, null);
      ops.runCommand(threadId, node.activation.scriptId);
      return;
    }
    case "url": {
      const threadId = resolveThreadIdForActivation(input, null);
      if (input.runtimeSupportsEmbeddedPreview) {
        ops.openUrlInPreview(threadId, node.activation.url);
      } else {
        ops.openUrlExternally(node.activation.url);
      }
      return;
    }
    case "none":
      return;
  }
}

// --- Command-run cross-component bridge -----------------------------------
//
// `runCommand` reuses `ChatView.tsx`'s existing `runProjectScript` (terminal
// open/write), which lives inside a per-thread component instance the
// sidebar cannot call directly. Mirrors the existing
// `components/preview/previewActionBus.ts` window-event convention used for
// the same kind of "some other mounted view should handle this" hand-off.

const RUN_COMMAND_EVENT = "marcode:unified-workspace-run-command";

export interface UnifiedWorkspaceRunCommandRequest {
  readonly environmentId: string;
  readonly threadId: string;
  readonly scriptId: string;
}

/**
 * Fire-and-forget: dispatched after the target thread's route is active (or
 * already was). If no `ChatView` instance for that thread is mounted/
 * subscribed when this fires, the request is silently dropped — same
 * best-effort contract as `previewActionBus`'s `dispatchPreviewAction`.
 */
export function requestUnifiedWorkspaceCommandRun(
  request: UnifiedWorkspaceRunCommandRequest,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<UnifiedWorkspaceRunCommandRequest>(RUN_COMMAND_EVENT, { detail: request }),
  );
}

export function subscribeUnifiedWorkspaceCommandRun(
  listener: (request: UnifiedWorkspaceRunCommandRequest) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<UnifiedWorkspaceRunCommandRequest>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(RUN_COMMAND_EVENT, handler);
  return () => window.removeEventListener(RUN_COMMAND_EVENT, handler);
}
