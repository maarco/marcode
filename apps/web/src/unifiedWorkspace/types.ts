import type { ProjectWorkspaceLayoutErrorTag } from "@t3tools/contracts";

/**
 * Frozen seam between the runtime projection (Agent 3, `useUnifiedWorkspaceProject`)
 * and the tree presentation (Agent 2, `components/unified-workspace/**`).
 *
 * Nodes are presentation-ready facts. Nothing here imports React, and nothing
 * here holds a runtime object — placement and identity only.
 */

export type UnifiedWorkspaceNodeKind =
  | "file"
  | "folder"
  | "thread"
  | "terminal"
  | "browser"
  | "command"
  | "url";

/** Right-hand affordance on a row. Reuses existing status vocabularies. */
export type UnifiedWorkspaceStatus =
  | { kind: "thread"; threadId: string; hasPendingApprovals: boolean; hasPendingUserInput: boolean }
  | { kind: "terminal"; terminalId: string; running: boolean }
  | { kind: "browser"; tabId: string; loading: boolean }
  | { kind: "port"; port: number }
  | { kind: "broken"; relativePath: string };

/** What clicking a row does. Resolved by `activateNode`, never by the component. */
export type UnifiedWorkspaceActivation =
  | { kind: "thread"; threadId: string }
  | { kind: "file"; relativePath: string }
  | { kind: "folder"; relativePath: string }
  | { kind: "terminal"; threadId: string; terminalId: string }
  | { kind: "browser"; threadId: string; tabId: string }
  | { kind: "command"; scriptId: string }
  | { kind: "url"; url: string }
  | { kind: "none" };

export type UnifiedWorkspaceNode = {
  /** `node:<environmentId>:<projectId>:<projectWorkspaceItemId>` — unique across grouped projects. */
  id: string;
  kind: UnifiedWorkspaceNodeKind;
  label: string;
  parentId: string | null;
  depth: number;
  children: readonly UnifiedWorkspaceNode[];
  isLive: boolean;
  /**
   * True for file/folder nodes projected live from the on-disk file index with
   * no persisted `ProjectWorkspaceEntry` behind them — same "synthesized fresh
   * every render, never written to the layout" contract as a live terminal/
   * browser node, just sourced from disk instead of a runtime registry (spec
   * override of §4: the project row and its folders show on-disk children
   * without requiring attachment). `canMove`/`canRename`/`canRemove` are
   * always `false` on these — there is no persisted entry to move, relabel,
   * or remove; attaching the same path creates a separate, real entry that
   * takes over rendering for that path (see `buildTree.ts`'s dedupe-by-path).
   */
  isAmbient: boolean;
  isBroken: boolean;
  canHaveChildren: boolean;
  canMove: boolean;
  canRename: boolean;
  canRemove: boolean;
  activation: UnifiedWorkspaceActivation;
  status: UnifiedWorkspaceStatus | null;
  /** Direct children known from the authoritative layout/index, including lazy folder children. */
  directChildCount?: number;
  /** Favicon URL for browser/url nodes when the preview snapshot has one. */
  iconUrl?: string;
  /** Full path/URL for tooltips and copy actions. */
  tooltip?: string;
  /**
   * Set on a file/folder node whose on-disk parent directory differs from
   * where it's actually rendered in the tree — e.g. an attached file placed
   * at the project root while its real path is `.plans/README.md` sits next
   * to an unrelated ambient root `README.md`. The immediate real parent's
   * basename (e.g. `.plans`), for a short "· .plans" hint next to the label
   * so two same-named rows are tellable apart without printing a full path
   * inline. Never set on an ambient node (it's always exactly where its own
   * disk path says) or on a node with no disk-path context to compare
   * against (nested under a thread/command/url).
   */
  disambiguator?: string;
};

export type UnifiedWorkspaceMoveTarget = {
  nodeId: string;
  parentId: string | null;
  beforeId: string | null;
};

export type UnifiedWorkspaceMutationResult =
  | { ok: true }
  | { ok: false; tag: ProjectWorkspaceLayoutErrorTag | "offline" | "unsupported"; message: string };

export type UnifiedWorkspaceAttachCandidate = {
  relativePath: string;
  kind: "file" | "folder";
  /** True when this path is already attached; the dialog focuses the existing node instead. */
  alreadyAttached: boolean;
};

/** Reasons the tree renders read-only (old server, feature-flag degradation, disconnected). */
export type UnifiedWorkspaceCapabilities = {
  canMutate: boolean;
  reason: string | null;
};

export type UnifiedWorkspaceDiagnostic = {
  code:
    | "duplicate-id"
    | "missing-parent"
    | "cycle"
    | "invalid-target"
    | "stale-entry"
    | "index-truncated";
  nodeId: string;
  detail: string;
};

/**
 * Returned by `useUnifiedWorkspaceProject({ environmentId, projectId })`.
 * The tree component consumes this and callback props only — no RPC calls.
 */
export type UnifiedWorkspaceController = {
  roots: readonly UnifiedWorkspaceNode[];
  layoutVersion: number;
  capabilities: UnifiedWorkspaceCapabilities;
  diagnostics: readonly UnifiedWorkspaceDiagnostic[];

  activateNode: (nodeId: string) => void;
  moveNode: (target: UnifiedWorkspaceMoveTarget) => Promise<UnifiedWorkspaceMutationResult>;
  attachPath: (input: {
    kind: "file" | "folder";
    relativePath: string;
    parentId: string | null;
  }) => Promise<UnifiedWorkspaceMutationResult>;
  addUrlShortcut: (input: {
    label: string;
    url: string;
    parentId: string | null;
  }) => Promise<UnifiedWorkspaceMutationResult>;
  renameNode: (nodeId: string, label: string) => Promise<UnifiedWorkspaceMutationResult>;
  /** "Remove from sidebar" — never deletes the underlying resource. */
  removeNode: (nodeId: string) => Promise<UnifiedWorkspaceMutationResult>;
  createThread: (input: { parentId: string | null }) => void;
  runCommand: (nodeId: string) => void;
  /** Converts a live browser node into a durable URL shortcut. */
  pinBrowserShortcut: (nodeId: string) => Promise<UnifiedWorkspaceMutationResult>;
  /** Closes a live terminal/browser resource. Leaves layout untouched. */
  closeLiveNode: (nodeId: string) => void;
  /**
   * Expands/collapses one ambient (disk-projected) folder's on-disk children,
   * one level deep — the disclosure-arrow click on an `isAmbient` folder node
   * routes here instead of the tree's local collapse state. Ephemeral UI
   * state only: never persisted to the layout, same "synthesized fresh every
   * render" contract as a live terminal/browser node. No-ops for a non-folder
   * or non-ambient node id.
   */
  toggleAmbientFolder: (nodeId: string) => void;
  listAttachCandidates: (kind: "file" | "folder") => readonly UnifiedWorkspaceAttachCandidate[];
};
