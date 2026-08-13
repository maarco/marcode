import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  Setting2Filled,
  Element3Filled,
  LockFilled,
  LockSlashFilled,
  CodeFilled,
  MessageCircleFilled,
  ActivityFilled,
  LinkFilled,
  ClockFilled,
  DocumentTextFilled,
  Setting5Filled,
  BoxFilled,
  LayerFilled,
  SidebarLeftFilled,
  ArrangeSquareFilled,
  FolderFilled,
  GlobalFilled,
  Code1Filled,
  KeySquareFilled,
} from "@aliimam/icons";
import { ChartNoAxesColumnIcon, GitPullRequestIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { useEditorStore } from "../editor/editor-store";
import { usePillNavPreferences, getPillNavShineGradient } from "../editor/pill-prefs";
import { FLOATING_SURFACE_Z } from "../editor/floating-surface-z";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useAtomValue } from "@effect/atom-react";
import { primaryServerKeybindingsAtom } from "../state/server";
import { formatShortcutLabel, shortcutLabelForCommand } from "../keybindings";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { selectActiveRightPanel, useRightPanelStore } from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { isPreviewSupportedInRuntime } from "../previewStateStore";
import { useComposerDraftStore } from "../composerDraftStore";
import { MarcodeMark } from "./MarcodeMark";
import { hasPillNavMeta, PillNavHoverCard, type PillNavMetaKey } from "./PillNavHoverCard";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { useMediaQuery } from "../hooks/useMediaQuery";

export const TOGGLE_COMMAND_PALETTE_EVENT = "marcode:toggle-command-palette";
// workspace children dispatch these; ChatView (surfaces) and SidebarControl (sidebar) listen
export const WORKSPACE_ACTION_EVENT = "marcode:workspace-action";
export const TOGGLE_SIDEBAR_EVENT = "marcode:toggle-sidebar";
// ChatView portals its thread actions (scripts / open-in / git) into this pill slot
export const PILL_THREAD_ACTIONS_SLOT_ID = "marcode-pill-thread-actions";

export type WorkspaceAction = "terminal" | "diff" | "files" | "browser" | "panel";

// The palette and the code overlay are wired to fixed handlers rather than
// rebindable keybinding commands, so their labels are formatted from a literal
// shortcut. Formatted (not hardcoded "Cmd+K") so Windows/Linux reads "Ctrl+K"
// and the glyphs match every other pill label.
const COMMAND_PALETTE_SHORTCUT = {
  key: "k",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  modKey: true,
} as const;
const CODE_OVERLAY_SHORTCUT = {
  key: "e",
  metaKey: false,
  ctrlKey: false,
  shiftKey: true,
  altKey: false,
  modKey: true,
} as const;
// cyan-400 — the workspace accent, reused so the active code overlay reads as
// part of the same family instead of a one-off text colour.
const CODE_OVERLAY_ACTIVE_TINT = "#22d3ee";

// ─── categories ──────────────────────────────────────────────

interface NavChild {
  /** null = action child (button); rendered active state comes from `active` */
  href: string | null;
  label: string;
  icon: React.ReactNode;
  onClick?: (() => void) | undefined;
  active?: boolean | undefined;
  /** keyboard shortcut label appended to the tooltip */
  shortcut?: string | null | undefined;
  /** rich hover-card key; defaults to `href` when omitted */
  meta?: PillNavMetaKey | undefined;
}

interface NavCategory {
  key: string;
  icon: React.ReactNode;
  /** null = action category (button instead of link) */
  href: string | null;
  label: string;
  color: string;
  children: NavChild[];
  onClick?: (() => void) | undefined;
  shortcut?: string | null | undefined;
  /** rich hover-card key; defaults to `href` when omitted */
  meta?: PillNavMetaKey | undefined;
}

const CATEGORIES: NavCategory[] = [
  {
    key: "home",
    // Bare mark, no wrapper box: `currentColor` picks up the button's own
    // idle/hover/active tint exactly like every other category glyph below.
    icon: <MarcodeMark className="h-5 w-5" />,
    href: "/",
    label: "marcode",
    color: "#f59e0b",
    children: [
      { href: "/connect", label: "Connect", icon: <KeySquareFilled className="h-4 w-4" /> },
      // Upstream links /pull-requests from the sidebar footer they own and
      // Marcode does not render, so this nav has to surface it. It sits here
      // rather than under Settings because it is a workspace destination, not a
      // preference — and `getActiveCategory` already resolves the route to this
      // category, so anywhere else highlights the wrong pill. Their footer entry
      // is gated on the environment's `pullRequests` capability; this one is
      // not, because the route renders its own unavailable state.
      {
        href: "/pull-requests",
        label: "Pull Requests",
        icon: <GitPullRequestIcon className="h-4 w-4" />,
      },
    ],
  },
  {
    key: "settings",
    icon: <Setting2Filled className="h-5 w-5" />,
    href: "/settings",
    label: "Settings",
    color: "#a0927b",
    children: [
      { href: "/settings/general", label: "General", icon: <Setting5Filled className="h-4 w-4" /> },
      {
        href: "/settings/providers",
        label: "Providers",
        icon: <MessageCircleFilled className="h-4 w-4" />,
      },
      {
        href: "/settings/connections",
        label: "Connections",
        icon: <LinkFilled className="h-4 w-4" />,
      },
      {
        href: "/settings/source-control",
        label: "Source Control",
        icon: <BoxFilled className="h-4 w-4" />,
      },
      {
        href: "/settings/keybindings",
        label: "Keybindings",
        icon: <DocumentTextFilled className="h-4 w-4" />,
      },
      {
        href: "/settings/diagnostics",
        label: "Diagnostics",
        icon: <ActivityFilled className="h-4 w-4" />,
      },
      {
        href: "/settings/archived",
        label: "Archived Chats",
        icon: <ClockFilled className="h-4 w-4" />,
      },
      // Upstream's usage page lives at the top-level /usage route and is
      // linked from their sidebar footer. Marcode keeps that footer empty
      // (this nav owns brand/settings), so surface it here or it would be
      // unreachable in the UI.
      {
        href: "/usage",
        label: "Usage",
        icon: <ChartNoAxesColumnIcon className="h-4 w-4" />,
      },
    ],
  },
];

// ─── workspace category (thread-scoped surface toggles) ─────

const WORKSPACE_COLOR = "#22d3ee";
// v2 because the pre-fix code stored `useLocation().pathname`, which poisoned the
// value with settings paths (see `workspacePath` below). Bumping the key drops
// those instead of shipping a fix whose first render still links to /settings.
const LAST_WORKSPACE_PATH_KEY = "marcode-last-workspace-path-v2";

function dispatchWorkspaceAction(action: WorkspaceAction) {
  window.dispatchEvent(new CustomEvent(WORKSPACE_ACTION_EVENT, { detail: { action } }));
}

function loadLastWorkspacePath(): string | null {
  try {
    return localStorage.getItem(LAST_WORKSPACE_PATH_KEY);
  } catch {
    return null;
  }
}

function saveLastWorkspacePath(path: string) {
  try {
    localStorage.setItem(LAST_WORKSPACE_PATH_KEY, path);
  } catch {}
}

/**
 * Built per-render (not module-level) because its children reflect live
 * panel state. Exists on thread routes (server or draft) — elsewhere its
 * actions are meaningless, so the category hides instead of playing dead.
 * Drafts get the reduced set: terminal/diff need a started server thread.
 */
function useWorkspaceCategory(): NavCategory | null {
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const draftSession = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  const threadRef =
    routeTarget?.kind === "server"
      ? routeTarget.threadRef
      : draftSession
        ? scopeThreadRef(draftSession.environmentId, draftSession.threadId)
        : null;
  const isServerThread = routeTarget?.kind === "server";
  const terminalOpen = useTerminalUiStateStore((state) =>
    threadRef
      ? selectThreadTerminalUiState(state.terminalUiStateByThreadKey, threadRef).terminalOpen
      : false,
  );
  const activePanelKind = useRightPanelStore((state) =>
    threadRef ? selectActiveRightPanel(state.byThreadKey, threadRef) : null,
  );
  // "Files" no longer opens a right-panel surface — it opens the floating pill
  // with its file sidebar showing (see `dispatchWorkspaceAction("files")`'s
  // handler in ChatView). Drive the item's active state from that, not from
  // `activePanelKind`, which no longer has a "files" kind to match.
  const editorOverlayOpen = useEditorStore((state) => state.isOverlayOpen);
  const editorSidebarView = useEditorStore((state) => state.sidebarView);

  // Remember the last thread route so other pages keep a way back to the workspace.
  // Built from the route params, never from `useLocation()`: pathname updates at
  // navigation start while the params still describe the thread you are leaving, so
  // trusting it saved the *destination* — leaving a thread for Settings persisted
  // "/settings/general" as the workspace, and Back to Workspace linked to the page
  // you were already on. The params are the same source that decides there is a
  // thread at all, so the two can no longer disagree.
  const workspacePath = routeTarget
    ? routeTarget.kind === "server"
      ? `/${routeTarget.threadRef.environmentId}/${routeTarget.threadRef.threadId}`
      : `/draft/${routeTarget.draftId}`
    : null;
  useEffect(() => {
    if (workspacePath) saveLastWorkspacePath(workspacePath);
  }, [workspacePath]);
  const [lastWorkspacePath, setLastWorkspacePath] = useState<string | null>(null);
  useEffect(() => {
    if (!workspacePath) setLastWorkspacePath(loadLastWorkspacePath());
  }, [workspacePath]);

  if (!threadRef) {
    // off-thread: keep the workspace icon as a link back to the last thread
    if (!lastWorkspacePath) return null;
    return {
      key: "workspace",
      icon: <LayerFilled className="h-5 w-5" />,
      href: lastWorkspacePath,
      label: "Back to Workspace",
      color: WORKSPACE_COLOR,
      meta: "workspace:back",
      children: [],
    };
  }
  return {
    key: "workspace",
    icon: <LayerFilled className="h-5 w-5" />,
    href: null,
    label: "Workspace",
    color: WORKSPACE_COLOR,
    meta: "workspace",
    onClick: () => dispatchWorkspaceAction("panel"),
    shortcut: shortcutLabelForCommand(keybindings, "rightPanel.toggle"),
    children: [
      {
        href: null,
        label: "Threads",
        icon: <SidebarLeftFilled className="h-4 w-4" />,
        meta: "workspace:threads",
        onClick: () => window.dispatchEvent(new CustomEvent(TOGGLE_SIDEBAR_EVENT)),
        shortcut: shortcutLabelForCommand(keybindings, "sidebar.toggle"),
      },
      // terminal + diff need a started server thread; hidden on drafts instead of playing dead
      ...(isServerThread
        ? [
            {
              href: null,
              label: "Terminal",
              icon: <Code1Filled className="h-4 w-4" />,
              meta: "workspace:terminal" as const,
              onClick: () => dispatchWorkspaceAction("terminal"),
              active: terminalOpen || activePanelKind === "terminal",
              shortcut: shortcutLabelForCommand(keybindings, "terminal.toggle"),
            },
            {
              href: null,
              label: "Diff",
              icon: <ArrangeSquareFilled className="h-4 w-4" />,
              meta: "workspace:diff" as const,
              onClick: () => dispatchWorkspaceAction("diff"),
              active: activePanelKind === "diff",
              shortcut: shortcutLabelForCommand(keybindings, "diff.toggle"),
            },
          ]
        : []),
      {
        href: null,
        label: "Files",
        icon: <FolderFilled className="h-4 w-4" />,
        meta: "workspace:files",
        onClick: () => dispatchWorkspaceAction("files"),
        active: editorOverlayOpen && editorSidebarView === "files",
      },
      // preview needs the desktop runtime — hide the child instead of rendering a dead button
      ...(isPreviewSupportedInRuntime()
        ? [
            {
              href: null,
              label: "Browser",
              icon: <GlobalFilled className="h-4 w-4" />,
              meta: "workspace:browser" as const,
              onClick: () => dispatchWorkspaceAction("browser"),
              active: activePanelKind === "preview",
              shortcut: shortcutLabelForCommand(keybindings, "preview.toggle"),
            },
          ]
        : []),
    ],
  };
}

// ─── route matching ──────────────────────────────────────────

function getActiveCategory(pathname: string): string | null {
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}

function getCanonicalChild(pathname: string): { href: string; categoryKey: string } | null {
  for (const cat of CATEGORIES) {
    for (const child of cat.children) {
      if (!child.href) continue;
      if (pathname === child.href || pathname.startsWith(child.href + "/")) {
        return { href: child.href, categoryKey: cat.key };
      }
    }
  }
  return null;
}

// ─── recents ─────────────────────────────────────────────────

const RECENTS_KEY = "marcode-pill-recents";
const MAX_RECENTS = 3;

function loadRecents(): string[] {
  try {
    const saved = localStorage.getItem(RECENTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveRecents(recents: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {}
}

// ─── edge snapping ──────────────────────────────────────────

type SnapEdge = "top" | "bottom" | "left" | "right";

interface PillPosition {
  edge: SnapEdge;
  offset: number;
}

const STORAGE_KEY = "marcode-pill-position";
const LOCK_KEY = "marcode-pill-locked";
const SCALE_KEY = "marcode-pill-scale";
const SCALE_MIN = 0.6;
const SCALE_MAX = 1.6;
const SCALE_STEP = 0.05;

// drag-to-dock: how far (px) from a screen edge the pill starts
// visually stretching toward it (liquid morph effect begins)
const EDGE_PULL_THRESHOLD = 600;

// drag-to-dock: distance (px) at which the pill locks onto the edge
// and snaps into place on pointer release
const EDGE_SNAP_THRESHOLD = 2000;

// edge summon: invisible zone (px) along each screen edge — when the
// cursor enters this zone and holds still, the pill flies over
const SUMMON_EDGE_PX = 20;

// edge summon: how long (ms) the cursor must stay still inside the
// edge zone before the pill begins its gravity-pull animation
const SUMMON_HOLD_MS = 100;

// edge summon: movement tolerance (px) — small hand tremor within
// this radius won't cancel the idle timer
const SUMMON_JITTER_PX = 5;

function loadPosition(): PillPosition {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { edge: "top", offset: 50 };
}

function savePosition(pos: PillPosition) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {}
}

function loadLocked(): boolean {
  try {
    const saved = localStorage.getItem(LOCK_KEY);
    if (saved === null) return true;
    return saved === "true";
  } catch {
    return true;
  }
}

function saveLocked(locked: boolean) {
  try {
    localStorage.setItem(LOCK_KEY, String(locked));
  } catch {}
}

function loadScale(): number {
  try {
    const saved = localStorage.getItem(SCALE_KEY);
    if (saved) {
      const val = parseFloat(saved);
      if (!isNaN(val)) return clamp(val, SCALE_MIN, SCALE_MAX);
    }
  } catch {}
  return 1;
}

function saveScale(scale: number) {
  try {
    localStorage.setItem(SCALE_KEY, String(scale));
  } catch {}
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function snapToEdge(x: number, y: number): PillPosition {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dTop = y,
    dBottom = h - y,
    dLeft = x,
    dRight = w - x;
  const min = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop) return { edge: "top", offset: clamp((x / w) * 100, 10, 90) };
  if (min === dBottom) return { edge: "bottom", offset: clamp((x / w) * 100, 10, 90) };
  if (min === dLeft) return { edge: "left", offset: clamp((y / h) * 100, 10, 90) };
  return { edge: "right", offset: clamp((y / h) * 100, 10, 90) };
}

function getEdgeProximity(x: number, y: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const distances = { top: y, bottom: h - y, left: x, right: w - x };
  const nearest = (Object.entries(distances) as [SnapEdge, number][]).reduce((a, b) =>
    b[1] < a[1] ? b : a,
  );
  const [edge, dist] = nearest;
  const pull = dist < EDGE_PULL_THRESHOLD ? 1 - dist / EDGE_PULL_THRESHOLD : 0;
  const locked = dist < EDGE_SNAP_THRESHOLD;
  return { edge, dist, pull, locked };
}

// ─── liquid deformation ─────────────────────────────────────

function getLiquidStyle(pull: number, edge: SnapEdge, locked: boolean): React.CSSProperties {
  if (pull === 0) return {};

  const p = pull * pull * pull;
  const stretch = 1 + p * 0.8;
  const squish = 1 - p * 0.25;
  const flat = `${Math.round(24 - p * 22)}px`;
  const round = `${Math.round(24 + p * 8)}px`;

  let scaleX = 1,
    scaleY = 1;
  let borderRadius = round;

  if (edge === "top") {
    scaleY = stretch;
    scaleX = squish;
    borderRadius = `${flat} ${flat} ${round} ${round}`;
  } else if (edge === "bottom") {
    scaleY = stretch;
    scaleX = squish;
    borderRadius = `${round} ${round} ${flat} ${flat}`;
  } else if (edge === "left") {
    scaleX = stretch;
    scaleY = squish;
    borderRadius = `${flat} ${round} ${round} ${flat}`;
  } else {
    scaleX = stretch;
    scaleY = squish;
    borderRadius = `${round} ${flat} ${flat} ${round}`;
  }

  return {
    borderRadius,
    transform: `scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`,
    filter: locked ? "blur(0.8px) brightness(1.1)" : undefined,
  };
}

function getDockedStyle(pos: PillPosition): React.CSSProperties {
  if (pos.edge === "top")
    return {
      top: 0,
      left: `${pos.offset}%`,
      transform: "translateX(-50%)",
      borderRadius: "0 0 24px 24px",
    };
  if (pos.edge === "bottom")
    return {
      bottom: 0,
      left: `${pos.offset}%`,
      transform: "translateX(-50%)",
      borderRadius: "24px 24px 0 0",
    };
  if (pos.edge === "left")
    return {
      left: 0,
      top: `${pos.offset}%`,
      transform: "translateY(-50%)",
      borderRadius: "0 24px 24px 0",
    };
  return {
    right: 0,
    top: `${pos.offset}%`,
    transform: "translateY(-50%)",
    borderRadius: "24px 0 0 24px",
  };
}

// How far (px) the pill keeps from the nearest screen edge along its main
// axis — enough that a wide pill never touches the window boundary, and a
// top-docked one never reaches under the macOS traffic lights.
const EDGE_MARGIN_PX = 20;

/**
 * The most the pill's main axis (width when docked top/bottom, height when
 * docked left/right) can grow before either end would cross `EDGE_MARGIN_PX`
 * short of the screen edge. Anchored to `offset` — the pill's own percentage
 * along that axis, from `PillPosition` — rather than a flat viewport
 * fraction: a pill dragged near one edge has less room on that side than a
 * centred one does, and a flat cap would let it overrun the edge it sits
 * closest to.
 *
 * Expressed in `vw`/`vh` rather than a `window.inner*` read so it tracks a
 * live resize for free (no listener, no re-render) — the browser recomputes
 * viewport units on its own. Dividing by `scale` undoes `pillScale`'s visual
 * stretch (a CSS `transform`, which does not affect layout size) so the cap
 * holds at any zoom level, not just 1x — both edges scale from the pill's
 * own centre on this axis (see `scaleOrigin`), so the correction is uniform.
 */
function dockedMainAxisMaxExtent(offset: number, scale: number, unit: "vw" | "vh"): string {
  const nearest = Math.min(offset, 100 - offset);
  const factor = (2 * nearest) / scale;
  const margin = (EDGE_MARGIN_PX * 2) / scale;
  return `calc(${factor}${unit} - ${margin}px)`;
}

// ─── component ──────────────────────────────────────────────

const MOBILE_NAV_HEIGHT = 58;
const MOBILE_NAV_OFFSET = `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-top, 0px))`;

/**
 * Below Tailwind's `sm` breakpoint — the width at which the pill stops being a
 * floating capsule and becomes a fixed top rail. Anything that renders *into*
 * the pill (the portaled thread-action clusters) must collapse on the same
 * signal, so this is exported rather than re-derived per caller.
 *
 * `max-sm` is `(max-width: 639px)`, which is the exact complement of the `sm:`
 * utilities the pill itself uses; the previous hand-rolled `(max-width: 640px)`
 * left 640px reading as "mobile" here while `sm:` classes had already switched.
 */
export function usePillNavNarrow(): boolean {
  return useMediaQuery("max-sm");
}

/** How far the scroll affordance fades at each edge of the pill row. */
const ROW_FADE_PX = 24;

/**
 * Live overflow state of the pill row, so a row that scrolls can *say* it
 * scrolls. Watches the element (size) and its subtree (the thread-action
 * cluster is portaled in after mount, and its contents change with git state).
 */
function useRowOverflow(ref: React.RefObject<HTMLDivElement | null>) {
  const [overflow, setOverflow] = useState({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next = { start: el.scrollLeft > 1, end: max > 1 && el.scrollLeft < max - 1 };
      setOverflow((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const resize = new ResizeObserver(read);
    resize.observe(el);
    const mutate = new MutationObserver(read);
    mutate.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", read);
      resize.disconnect();
      mutate.disconnect();
    };
  }, [ref]);
  return overflow;
}

/**
 * Gradient pinned to one edge of the scroll row. `sticky` (not `absolute`) so
 * it stays at the visible edge instead of scrolling away with the content, and
 * zero-width so it costs no layout. Colours track the pill's own background —
 * the row's controls fade into the chrome rather than into a hole in it.
 */
function RowEdgeFade({ side, narrow }: { side: "start" | "end"; narrow: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none sticky z-10 h-full w-0 self-stretch",
        side === "start" ? "left-0" : "right-0",
      )}
    >
      <div
        className={cn(
          "absolute top-0 h-full",
          side === "start" ? "left-0 bg-linear-to-r" : "right-0 bg-linear-to-l",
          narrow
            ? "from-background dark:from-[#0a0a0a]"
            : "from-background/95 dark:from-[#0a0a0a]/95",
          "to-transparent",
        )}
        style={{ width: ROW_FADE_PX }}
      />
    </div>
  );
}

export function FloatingPillNav() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const pillRef = useRef<HTMLDivElement>(null);
  const toggleCodeOverlay = useEditorStore((s) => s.toggleOverlay);
  const isCodeOverlayOpen = useEditorStore((s) => s.isOverlayOpen);
  const isMobile = usePillNavNarrow();
  const rowOverflow = useRowOverflow(pillRef);

  const [position, setPosition] = useState<PillPosition>({ edge: "top", offset: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [edgeProximity, setEdgeProximity] = useState<{
    edge: SnapEdge;
    pull: number;
    locked: boolean;
  }>({ edge: "top", pull: 0, locked: true });
  const [isSnapping, setIsSnapping] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [isLocked, setIsLocked] = useState(true);
  const [pillScale, setPillScale] = useState(1);
  const { prefs: pillPrefs } = usePillNavPreferences();
  const shineColors = getPillNavShineGradient(pillPrefs);
  const dragStart = useRef<{ x: number; y: number; pillX: number; pillY: number } | null>(null);
  const hasMoved = useRef(false);
  const isTouchDrag = useRef(false);
  const isTouchDevice = useRef(false);

  // detect touch on first interaction
  useEffect(() => {
    const onTouch = () => {
      isTouchDevice.current = true;
    };
    window.addEventListener("touchstart", onTouch, { once: true, passive: true });
    if (window.matchMedia("(pointer: coarse)").matches) {
      isTouchDevice.current = true;
    }
    return () => window.removeEventListener("touchstart", onTouch);
  }, []);

  // safety: if drag gets stuck (no pointerUp fired), reset after 3s
  useEffect(() => {
    if (!isDragging) return;
    const safety = setTimeout(() => {
      setIsDragging(false);
      setDragPos(null);
      dragStart.current = null;
    }, 3000);
    return () => clearTimeout(safety);
  }, [isDragging]);

  // ─── edge summon state ───────────────────────────────────
  const [summonProgress, setSummonProgress] = useState(0);
  const [summonTarget, setSummonTarget] = useState<{ x: number; y: number; edge: SnapEdge } | null>(
    null,
  );
  const summonAnchor = useRef<{ x: number; y: number } | null>(null);
  const summonIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summonStartTime = useRef<number | null>(null);
  const summonRaf = useRef<number | null>(null);
  const summonStartPos = useRef<{ x: number; y: number } | null>(null);

  // hydration: load from localStorage after mount
  useEffect(() => {
    if (!isMobile) setPosition(loadPosition());
  }, [isMobile]);
  useEffect(() => {
    setRecents(loadRecents());
  }, []);
  useEffect(() => {
    if (!isMobile) setIsLocked(loadLocked());
  }, [isMobile]);
  useEffect(() => {
    if (!isMobile) setPillScale(loadScale());
  }, [isMobile]);

  // mobile: force a fixed top rail; no drag/scale physics on narrow screens.
  useEffect(() => {
    if (isMobile) {
      setPosition({ edge: "top", offset: 50 });
      setIsLocked(true);
      setPillScale(1);
    }
  }, [isMobile]);

  useEffect(() => {
    const root = document.documentElement;
    if (!isMobile) {
      root.style.removeProperty("--marcode-mobile-pill-nav-offset");
      root.removeAttribute("data-mobile-pill-nav");
      return;
    }

    root.style.setProperty("--marcode-mobile-pill-nav-offset", MOBILE_NAV_OFFSET);
    root.setAttribute("data-mobile-pill-nav", "true");

    return () => {
      root.style.removeProperty("--marcode-mobile-pill-nav-offset");
      root.removeAttribute("data-mobile-pill-nav");
    };
  }, [isMobile]);

  // track page visits for recents
  useEffect(() => {
    const match = getCanonicalChild(pathname);
    if (!match) return;
    setRecents((prev) => {
      const next = [match.href, ...prev.filter((h) => h !== match.href)].slice(0, MAX_RECENTS);
      saveRecents(next);
      return next;
    });
  }, [pathname]);

  // ─── edge summon: cursor near screen edge pulls pill there ──

  const cancelSummon = useCallback(() => {
    if (summonIdleTimer.current) {
      clearTimeout(summonIdleTimer.current);
      summonIdleTimer.current = null;
    }
    if (summonRaf.current) {
      cancelAnimationFrame(summonRaf.current);
      summonRaf.current = null;
    }
    summonAnchor.current = null;
    summonStartTime.current = null;
    summonStartPos.current = null;
    setSummonProgress(0);
    setSummonTarget(null);
  }, []);

  const completeSummon = useCallback(
    (target: { x: number; y: number }) => {
      const newPos = snapToEdge(target.x, target.y);
      setPosition(newPos);
      savePosition(newPos);
      setIsSnapping(true);
      setTimeout(() => setIsSnapping(false), 500);
      cancelSummon();
    },
    [cancelSummon],
  );

  const startSummonAnimation = useCallback(
    (anchor: { x: number; y: number }, edge: SnapEdge) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      let startX: number, startY: number;
      switch (position.edge) {
        case "top":
          startX = (position.offset / 100) * w;
          startY = 20;
          break;
        case "bottom":
          startX = (position.offset / 100) * w;
          startY = h - 20;
          break;
        case "left":
          startX = 20;
          startY = (position.offset / 100) * h;
          break;
        case "right":
          startX = w - 20;
          startY = (position.offset / 100) * h;
          break;
      }
      summonStartPos.current = { x: startX, y: startY };
      summonStartTime.current = performance.now();
      setSummonTarget({ x: anchor.x, y: anchor.y, edge });

      const animate = (now: number) => {
        if (!summonStartTime.current) return;
        const elapsed = now - summonStartTime.current;
        const p = Math.min(elapsed / SUMMON_HOLD_MS, 1);
        setSummonProgress(p);
        if (p < 1) {
          summonRaf.current = requestAnimationFrame(animate);
        } else {
          completeSummon(anchor);
        }
      };
      summonRaf.current = requestAnimationFrame(animate);
    },
    [position, completeSummon],
  );

  useEffect(() => {
    // edge summon is mouse-only — skip on touch devices
    if (isTouchDevice.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging || isLocked) return;

      const x = e.clientX,
        y = e.clientY;
      const w = window.innerWidth,
        h = window.innerHeight;
      const dTop = y,
        dBottom = h - y,
        dLeft = x,
        dRight = w - x;
      const minDist = Math.min(dTop, dBottom, dLeft, dRight);

      if (minDist > SUMMON_EDGE_PX) {
        cancelSummon();
        return;
      }

      let nearEdge: SnapEdge;
      if (minDist === dTop) nearEdge = "top";
      else if (minDist === dBottom) nearEdge = "bottom";
      else if (minDist === dLeft) nearEdge = "left";
      else nearEdge = "right";

      if (nearEdge === position.edge) {
        cancelSummon();
        return;
      }

      if (summonRaf.current) return;

      if (summonAnchor.current) {
        const dx = x - summonAnchor.current.x;
        const dy = y - summonAnchor.current.y;
        if (Math.abs(dx) + Math.abs(dy) <= SUMMON_JITTER_PX) {
          return;
        }
        if (summonIdleTimer.current) {
          clearTimeout(summonIdleTimer.current);
          summonIdleTimer.current = null;
        }
      }

      summonAnchor.current = { x, y };
      if (summonIdleTimer.current) clearTimeout(summonIdleTimer.current);
      summonIdleTimer.current = setTimeout(() => {
        if (summonAnchor.current) {
          startSummonAnimation(summonAnchor.current, nearEdge);
        }
      }, 200);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelSummon();
    };
  }, [isDragging, isLocked, position.edge, position.offset, cancelSummon, startSummonAnimation]);

  const isVertical = position.edge === "left" || position.edge === "right";
  // hover cards / tooltips open away from the edge the pill is docked against,
  // so they never fly off-screen or cover the pill itself
  const overlaySide: "top" | "bottom" | "left" | "right" =
    position.edge === "top"
      ? "bottom"
      : position.edge === "bottom"
        ? "top"
        : position.edge === "left"
          ? "right"
          : "left";
  const workspaceCategory = useWorkspaceCategory();
  // href === null ⇔ on a thread route (action form); the off-thread form is a plain link back
  const isOnWorkspaceRoute = workspaceCategory !== null && workspaceCategory.href === null;
  const activeCategory = isOnWorkspaceRoute ? "workspace" : getActiveCategory(pathname);
  const categories = workspaceCategory
    ? [...CATEGORIES.slice(0, 1), workspaceCategory, ...CATEGORIES.slice(1)]
    : CATEGORIES;

  // lookup for rendering recents with their category color + icon
  const childLookup = useMemo(() => {
    const map = new Map<
      string,
      {
        label: string;
        icon: React.ReactNode;
        color: string;
        categoryKey: string;
        meta: PillNavMetaKey | undefined;
      }
    >();
    for (const cat of CATEGORIES) {
      for (const child of cat.children) {
        if (!child.href) continue;
        map.set(child.href, {
          label: child.label,
          icon: child.icon,
          color: cat.color,
          categoryKey: cat.key,
          meta: child.meta,
        });
      }
    }
    return map;
  }, []);

  // recents not in the currently expanded category
  const visibleRecents = useMemo(() => {
    return recents
      .map((href) => {
        const info = childLookup.get(href);
        if (!info) return null;
        if (info.categoryKey === activeCategory) return null;
        return { href, ...info };
      })
      .filter(Boolean) as {
      href: string;
      label: string;
      icon: React.ReactNode;
      color: string;
      categoryKey: string;
      meta: PillNavMetaKey | undefined;
    }[];
  }, [recents, activeCategory, childLookup]);

  // ─── drag handling (mouse: whole pill, touch: grip handle only) ──

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      const pill = pillRef.current;
      if (!pill) return;
      const rect = pill.getBoundingClientRect();
      dragStart.current = {
        x: clientX,
        y: clientY,
        pillX: rect.left + rect.width / 2,
        pillY: rect.top + rect.height / 2,
      };
      hasMoved.current = false;
      setIsDragging(true);
      setIsSnapping(false);
      cancelSummon();
    },
    [cancelSummon],
  );

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragStart.current) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    if (!hasMoved.current && Math.abs(dx) + Math.abs(dy) < 8) return;
    hasMoved.current = true;
    const newX = dragStart.current.pillX + dx;
    const newY = dragStart.current.pillY + dy;
    setDragPos({ x: newX, y: newY });
    const prox = getEdgeProximity(newX, newY);
    setEdgeProximity({ edge: prox.edge, pull: prox.pull, locked: prox.locked });
  }, []);

  const endDrag = useCallback(() => {
    setIsDragging(false);
    if (hasMoved.current && dragPos) {
      const newPos = snapToEdge(dragPos.x, dragPos.y);
      setIsSnapping(true);
      setPosition(newPos);
      savePosition(newPos);
      setTimeout(() => {
        setIsSnapping(false);
        setEdgeProximity({ edge: newPos.edge, pull: 0, locked: false });
      }, 500);
    }
    setDragPos(null);
    dragStart.current = null;
  }, [dragPos]);

  // mouse drag: on the whole pill body (not links/buttons)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isLocked) return;
      if (e.pointerType === "touch") return;
      if ((e.target as HTMLElement).closest("a, button")) return;
      e.preventDefault();
      isTouchDrag.current = false;
      beginDrag(e.clientX, e.clientY);
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    },
    [isLocked, beginDrag],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || e.pointerType === "touch") return;
      moveDrag(e.clientX, e.clientY);
    },
    [isDragging, moveDrag],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || e.pointerType === "touch") return;
      endDrag();
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    },
    [isDragging, endDrag],
  );

  const handlePointerCancel = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    setDragPos(null);
    dragStart.current = null;
  }, [isDragging]);

  // lock toggle: click grip handle to lock/unlock position
  const toggleLock = useCallback(() => {
    if (isMobile) return;
    setIsLocked((prev) => {
      const next = !prev;
      saveLocked(next);
      return next;
    });
  }, [isMobile]);

  // touch drag: on the grip handle only (so taps on nav items aren't hijacked)
  const gripRef = useRef<HTMLButtonElement>(null);
  const touchActive = useRef(false);
  const isLockedRef = useRef(isLocked);
  const beginDragRef = useRef(beginDrag);
  const moveDragRef = useRef(moveDrag);
  const endDragRef = useRef(endDrag);
  isLockedRef.current = isLocked;
  beginDragRef.current = beginDrag;
  moveDragRef.current = moveDrag;
  endDragRef.current = endDrag;

  useEffect(() => {
    const grip = gripRef.current;
    if (!grip) return;

    const onTouchStart = (e: TouchEvent) => {
      if (isLockedRef.current) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      touchActive.current = true;
      isTouchDrag.current = true;
      beginDragRef.current(t.clientX, t.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchActive.current || e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0]!;
      moveDragRef.current(t.clientX, t.clientY);
    };

    const onTouchEnd = () => {
      if (!touchActive.current) return;
      touchActive.current = false;
      endDragRef.current();
    };

    const onTouchCancel = () => {
      if (!touchActive.current) return;
      touchActive.current = false;
      setIsDragging(false);
      setDragPos(null);
      dragStart.current = null;
    };

    grip.addEventListener("touchstart", onTouchStart, { passive: true });
    grip.addEventListener("touchmove", onTouchMove, { passive: false });
    grip.addEventListener("touchend", onTouchEnd, { passive: true });
    grip.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      grip.removeEventListener("touchstart", onTouchStart);
      grip.removeEventListener("touchmove", onTouchMove);
      grip.removeEventListener("touchend", onTouchEnd);
      grip.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  // scroll-to-resize: wheel on grip handle scales the pill
  useEffect(() => {
    const grip = gripRef.current;
    if (!grip) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setPillScale((prev) => {
        const next = clamp(prev + (e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP), SCALE_MIN, SCALE_MAX);
        saveScale(next);
        return next;
      });
    };

    grip.addEventListener("wheel", onWheel, { passive: false });
    return () => grip.removeEventListener("wheel", onWheel);
  }, []);

  const openSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent(TOGGLE_COMMAND_PALETTE_EVENT));
  }, []);

  const commandPaletteShortcut = useMemo(() => formatShortcutLabel(COMMAND_PALETTE_SHORTCUT), []);
  const codeOverlayShortcut = useMemo(() => formatShortcutLabel(CODE_OVERLAY_SHORTCUT), []);

  // ─── style computation ─────────────────────────────────

  const liquidStyle = isDragging
    ? getLiquidStyle(edgeProximity.pull, edgeProximity.edge, edgeProximity.locked)
    : {};

  let liquidScaleX = 1,
    liquidScaleY = 1;
  if (liquidStyle.transform) {
    const m = liquidStyle.transform.match(/scale\(([\d.]+),\s*([\d.]+)\)/);
    if (m) {
      liquidScaleX = parseFloat(m[1]!);
      liquidScaleY = parseFloat(m[2]!);
    }
  }

  // during summon: interpolate pill position from docked to cursor edge
  const summonStart = summonStartPos.current;
  const isSummoning = summonTarget && summonProgress > 0 && summonStart;
  let summonStyle: React.CSSProperties | null = null;
  if (isSummoning) {
    const t = summonProgress * summonProgress * summonProgress;
    const sx = summonStart.x + (summonTarget.x - summonStart.x) * t;
    const sy = summonStart.y + (summonTarget.y - summonStart.y) * t;
    summonStyle = {
      position: "fixed",
      left: sx,
      top: sy,
      transform: "translate(-50%, -50%)",
      zIndex: FLOATING_SURFACE_Z.pillNav,
      transition: "none",
      borderRadius: "24px",
    };
  }

  // transform-origin for pill scale based on docked edge
  const scaleOrigin =
    position.edge === "top"
      ? "top center"
      : position.edge === "bottom"
        ? "bottom center"
        : position.edge === "left"
          ? "center left"
          : "center right";

  const style: React.CSSProperties =
    isMobile && !isDragging
      ? {
          position: "fixed" as const,
          top: 0,
          left: 0,
          right: 0,
          width: "auto",
          maxWidth: "none",
          height: MOBILE_NAV_OFFSET,
          transform: "none",
          transformOrigin: "top center",
          borderRadius: 0,
          zIndex: FLOATING_SURFACE_Z.pillNav,
          transition: "all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }
      : isDragging && dragPos
        ? {
            position: "fixed",
            left: dragPos.x,
            top: dragPos.y,
            transform: `translate(-50%, -50%) scale(${(liquidScaleX * pillScale).toFixed(3)}, ${(liquidScaleY * pillScale).toFixed(3)})`,
            borderRadius: liquidStyle.borderRadius || "9999px",
            filter: liquidStyle.filter,
            zIndex: FLOATING_SURFACE_Z.pillNav,
            transition: "border-radius 0.08s ease-out, filter 0.08s ease-out",
            willChange: "left, top, transform",
            transformOrigin:
              edgeProximity.edge === "top"
                ? "center top"
                : edgeProximity.edge === "bottom"
                  ? "center bottom"
                  : edgeProximity.edge === "left"
                    ? "left center"
                    : "right center",
          }
        : summonStyle
          ? {
              ...summonStyle,
              transform: `translate(-50%, -50%) scale(${pillScale})`,
              transformOrigin: scaleOrigin,
            }
          : (() => {
              const docked = getDockedStyle(position);
              const baseTransform = docked.transform || "";
              return {
                position: "fixed" as const,
                ...docked,
                transform: pillScale === 1 ? baseTransform : `${baseTransform} scale(${pillScale})`,
                transformOrigin: scaleOrigin,
                zIndex: FLOATING_SURFACE_Z.pillNav,
                transition: isSnapping
                  ? "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
                  : "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                ...(isVertical
                  ? { maxHeight: dockedMainAxisMaxExtent(position.offset, pillScale, "vh") }
                  : { maxWidth: dockedMainAxisMaxExtent(position.offset, pillScale, "vw") }),
              };
            })();

  const vert = isVertical && !isDragging;
  // Recents are shortcuts to pages that are already one tap away under their
  // category, so they are the first thing to go when the row is a 390px window
  // onto a much wider set of controls.
  const hasRecents = pillPrefs.showRecents && !isMobile && visibleRecents.length > 0;
  // `RowEdgeFade` is a horizontal-scroll affordance (it renders as a vertical
  // strip pinned to the row's left/right edge); a vertically docked pill
  // never scrolls sideways, so it never earns one. It can still overflow and
  // scroll on its own axis — see the column's `overflow-y-auto` above — just
  // without a matching fade hint; a column that tall is rare enough that the
  // gap reads as a reasonable place to stop, not a missing affordance.
  const showEdgeFades = !vert && !isDragging;

  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="pill-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {isDragging && edgeProximity.pull > 0.2 && (
        <div
          className="fixed pointer-events-none"
          style={{
            ...getEdgeGlowStyle(edgeProximity.edge, edgeProximity.pull, dragPos),
            zIndex: FLOATING_SURFACE_Z.pillNavGlow,
            transition: "opacity 0.15s ease",
          }}
        />
      )}

      {/* summon glow: pulsing beacon at cursor edge position */}
      {summonTarget && summonProgress > 0 && (
        <SummonGlow target={summonTarget} progress={summonProgress} />
      )}

      <div
        ref={pillRef}
        style={style}
        className={cn(
          "flex items-center gap-0.5 px-2 py-1.5",
          "bg-background/95 dark:bg-[#0a0a0a]/95 backdrop-blur-xl",
          // The nav overlaps the frameless window's titlebar drag region.
          // Make the entire bar an interactive Electron hit target; otherwise
          // window dragging wins even when the bar is visually on top.
          "[-webkit-app-region:no-drag]",
          "touch-manipulation",
          isDragging && edgeProximity.pull > 0.6
            ? "shadow-[0_0_40px_rgba(255,255,255,0.15),0_0_80px_rgba(255,255,255,0.05)]"
            : isDragging && edgeProximity.pull > 0.2
              ? "shadow-[0_0_20px_rgba(255,255,255,0.08)]"
              : "shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
          isDragging && "cursor-grabbing",
          !isDragging && "cursor-default",
          vert && "flex-col",
          "[&>*]:shrink-0",
          isMobile
            ? "max-w-full justify-start overflow-x-auto overflow-y-hidden overscroll-x-contain no-scrollbar border-b border-border/40 bg-background dark:bg-[#0a0a0a] pl-[max(env(safe-area-inset-left,0px),0.75rem)] pr-[max(env(safe-area-inset-right,0px),0.75rem)] py-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] backdrop-blur-none [-webkit-overflow-scrolling:touch] [&>*]:shrink-0"
            : vert
              ? // Docked left/right: cross-axis is width, and the main-axis cap
                // below does nothing to bound it, so a wide *line* stacked into
                // this column — the portaled thread-action cluster, whose own row
                // never learned to wrap (see GitActionsControl/ProjectScriptsControl)
                // — dragged the whole column out to that line's width instead of
                // staying icon-width. Cap to one icon column (w-8 + the pill's own
                // px-2) and let lines wrap inside it instead of stretching it; no
                // horizontal scroll in a vertical dock. The main axis is height:
                // `dockedMainAxisMaxExtent` sets the precise offset-aware cap
                // inline while resting; this flat one is the floor for drag/summon,
                // when that inline style is not in play — and `overflow-y-auto` is
                // what makes a column taller than the screen reachable at all,
                // rather than just spilling past the window edge unseen.
                "max-w-12 overflow-x-hidden max-h-[calc(100vh-2.5rem)] overflow-y-auto no-scrollbar"
              : // Horizontal dock: `dockedMainAxisMaxExtent` sets the precise
                // offset-aware width cap inline while resting (see the style
                // computation above); this flat one is the floor for drag/summon,
                // and keeps even those transient states off the window edge
                // instead of flush against — or past — it.
                "max-w-[calc(100vw-2.5rem)] overflow-x-auto no-scrollbar",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        data-pill-nav=""
      >
        {/* ── shine border overlay ── */}
        <style>{`
          @keyframes sb-shine-pulse {
            0%   { background-position: 0% 0%; }
            50%  { background-position: 100% 100%; }
            100% { background-position: 0% 0%; }
          }
        `}</style>
        <div
          aria-hidden="true"
          style={{
            display: isMobile ? "none" : undefined,
            position: "absolute",
            inset: 0,
            padding: "1px",
            borderRadius: "inherit",
            backgroundImage: `radial-gradient(transparent, transparent, ${shineColors}, transparent, transparent)`,
            backgroundSize: "300% 300%",
            animation: "sb-shine-pulse 14s linear infinite",
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor" as React.CSSProperties["WebkitMaskComposite"],
            mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            maskComposite: "exclude" as unknown as string,
            pointerEvents: "none",
          }}
        />

        {showEdgeFades && rowOverflow.start && <RowEdgeFade narrow={isMobile} side="start" />}

        {/* ── category icons + expanded children ── */}
        {categories.map((cat) => {
          const isActive = activeCategory === cat.key;

          return (
            <div key={cat.key} className={cn("flex items-center gap-0.5", vert && "flex-col")}>
              <PillItem
                href={cat.href}
                onClick={cat.onClick}
                label={cat.label}
                icon={cat.icon}
                active={isActive}
                tint={isActive ? cat.color : undefined}
                meta={cat.meta}
                shortcut={cat.shortcut}
                side={overlaySide}
              />
              <AnimatePresence mode="popLayout">
                {isActive &&
                  cat.children.map((child, i) => {
                    const isChildActive = child.href
                      ? pathname === child.href || pathname.startsWith(child.href + "/")
                      : (child.active ?? false);
                    return (
                      <motion.div
                        key={child.href ?? child.label}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0 }}
                        transition={{
                          delay: i * 0.06,
                          type: "spring",
                          stiffness: 600,
                          damping: 20,
                          mass: 0.5,
                        }}
                      >
                        <PillItem
                          href={child.href}
                          onClick={child.onClick}
                          label={child.label}
                          icon={child.icon}
                          active={isChildActive}
                          tint={cat.color}
                          meta={child.meta}
                          shortcut={child.shortcut}
                          side={overlaySide}
                        />
                      </motion.div>
                    );
                  })}
              </AnimatePresence>
            </div>
          );
        })}

        <Divider vertical={vert} />

        {/* ── search / command palette ── */}
        <PillItem
          href={null}
          onClick={openSearch}
          label="Search"
          icon={<Element3Filled className="h-5 w-5" />}
          active={false}
          meta="search"
          shortcut={commandPaletteShortcut}
          side={overlaySide}
        />

        {/* ── recents ── */}
        {hasRecents && (
          <>
            <Divider vertical={vert} />
            <AnimatePresence mode="popLayout">
              {visibleRecents.map((recent, i) => (
                <motion.div
                  key={recent.href}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ delay: i * 0.04, duration: 0.15 }}
                >
                  <PillItem
                    href={recent.href}
                    label={recent.label}
                    icon={recent.icon}
                    active={false}
                    tint={recent.color}
                    dimmed
                    meta={recent.meta}
                    side={overlaySide}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </>
        )}

        <Divider vertical={vert} />

        {/* ── utility ── */}
        <PillItem
          href={null}
          onClick={toggleCodeOverlay}
          label="Code Editor"
          icon={<CodeFilled className="h-5 w-5" />}
          active={isCodeOverlayOpen}
          tint={isCodeOverlayOpen ? CODE_OVERLAY_ACTIVE_TINT : undefined}
          meta="code-editor"
          shortcut={codeOverlayShortcut}
          side={overlaySide}
        />

        {/*
          Thread actions portal target — ChatView fills this on thread routes.
          It sits *after* every global control so the contextual cluster (scripts
          / open-in / git) is what falls off the end of a narrow row, never
          Settings, Search or the Code Editor. Rendered unconditionally: ChatView
          resolves this node once on mount, so a slot that unmounts with the
          workspace category would leave it portaling into a detached element.
          `:empty` ignores `::before`, so the divider only appears once the
          cluster has actually filled the slot.
        */}
        <div
          id={PILL_THREAD_ACTIONS_SLOT_ID}
          className={cn(
            "flex items-center gap-1 empty:hidden",
            vert
              ? // Cascade the column's width cap down to the portaled clusters
                // (scripts / open-in / git) — each is its own "line" stacked here,
                // and without this they'd size to their own wide row instead of
                // respecting it (see the container's `max-w-12` above).
                "max-w-full flex-col before:my-0.5 before:h-px before:w-5 before:bg-foreground/10 dark:before:bg-white/10"
              : "before:mx-0.5 before:h-5 before:w-px before:bg-foreground/10 dark:before:bg-white/10",
            "before:shrink-0 before:content-['']",
          )}
        />

        <PillNavHoverCard
          metaKey="pill:lock"
          side={overlaySide}
          render={
            <button
              ref={gripRef}
              type="button"
              onClick={toggleLock}
              className={cn(
                "flex items-center justify-center w-8 h-8 sm:w-6 sm:h-6 rounded-full transition-colors",
                "touch-none select-none",
                isMobile && "hidden",
                isLocked
                  ? "text-foreground/50 dark:text-white/50 hover:text-foreground/70 dark:hover:text-white/70 cursor-pointer"
                  : "text-foreground/20 dark:text-white/20 hover:text-foreground/40 dark:hover:text-white/40 cursor-grab active:cursor-grabbing",
                vert && "rotate-90",
              )}
              aria-pressed={isLocked}
              aria-label={isLocked ? "Unlock position" : "Lock position"}
            >
              {isLocked ? (
                <LockFilled className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
              ) : (
                <LockSlashFilled className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
              )}
            </button>
          }
        />

        {showEdgeFades && rowOverflow.end && <RowEdgeFade narrow={isMobile} side="end" />}
      </div>
    </>
  );
}

// ─── summon glow ─────────────────────────────────────────────

function SummonGlow({ target, progress }: { target: { x: number; y: number }; progress: number }) {
  const [pulse, setPulse] = useState(0.5);

  useEffect(() => {
    let raf: number;
    const animate = () => {
      const freq = 4 + progress * 12;
      const val = Math.pow(
        0.5 + 0.5 * Math.sin((performance.now() / 1000) * freq * Math.PI * 2),
        0.6,
      );
      setPulse(val);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [progress]);

  const size = 60 + progress * 80;

  return (
    <>
      <div
        className="fixed pointer-events-none"
        style={{
          zIndex: FLOATING_SURFACE_Z.pillNavGlow,
          left: target.x,
          top: target.y,
          transform: "translate(-50%, -50%)",
          width: size * 1.6,
          height: size * 1.6,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,255,255,${0.08 * pulse}) 0%, transparent 60%)`,
        }}
      />
      <div
        className="fixed pointer-events-none"
        style={{
          zIndex: FLOATING_SURFACE_Z.pillNavGlow,
          left: target.x,
          top: target.y,
          transform: "translate(-50%, -50%)",
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,255,255,${(0.25 + progress * 0.5) * pulse}) 0%, rgba(255,255,255,${0.1 * pulse}) 40%, transparent 70%)`,
        }}
      />
    </>
  );
}

// ─── edge glow ──────────────────────────────────────────────

function getEdgeGlowStyle(
  edge: SnapEdge,
  pull: number,
  dragPos: { x: number; y: number } | null,
): React.CSSProperties {
  const opacity = pull * 0.6;
  const spread = 80 + pull * 120;
  const thickness = 2 + pull * 6;
  const x = dragPos?.x ?? 0;
  const y = dragPos?.y ?? 0;
  const gradient = `radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 40%, transparent 70%)`;

  const base: React.CSSProperties = { opacity };

  if (edge === "top")
    return {
      ...base,
      top: 0,
      left: x - spread,
      width: spread * 2,
      height: thickness,
      background: gradient,
    };
  if (edge === "bottom")
    return {
      ...base,
      bottom: 0,
      left: x - spread,
      width: spread * 2,
      height: thickness,
      background: gradient,
    };
  if (edge === "left")
    return {
      ...base,
      left: 0,
      top: y - spread,
      width: thickness,
      height: spread * 2,
      background: gradient,
    };
  return {
    ...base,
    right: 0,
    top: y - spread,
    width: thickness,
    height: spread * 2,
    background: gradient,
  };
}

// ─── pill item ──────────────────────────────────────────────

// Single source of truth for pill-nav button styling. The thread-action controls
// portaled into the pill import `pillIconButtonClass` so they read as pill items
// (borderless, round, brighter on hover) instead of bordered header buttons.
// No background, border or ring on hover anywhere in the pill — only a
// brightness change — per Marco: "I don't want any backgrounds or borders
// around the icons. Just make the icon brighter on hover."
const PILL_BASE = "group relative flex items-center justify-center rounded-full transition-colors";
const PILL_ACTIVE = "bg-foreground/15 dark:bg-white/15";
const PILL_IDLE =
  "text-foreground/40 dark:text-white/40 hover:text-foreground dark:hover:text-white";

export function pillIconButtonClass(active = false) {
  return cn(
    PILL_BASE,
    "h-8 w-8 shrink-0",
    active ? PILL_ACTIVE : PILL_IDLE,
    "disabled:pointer-events-none disabled:opacity-30",
    // `aria-disabled` rather than `disabled` wherever the reason for being
    // disabled is worth reading: a truly disabled button swallows pointer
    // events, so its tooltip — the only thing that explains the block — never
    // opens. Same dimming, hover kept alive for the tooltip.
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-30",
  );
}

/**
 * The hover surface every control in the pill shares.
 *
 * The thread actions (scripts, open-in, git) portal into the pill from their own
 * components, and their flat forms fell back to a native `title` — a different
 * delay, a different look, and nothing at all on a disabled control. They use
 * this instead, so one bar has one tooltip.
 *
 * `side` defaults to bottom because the pill lives at the top by default; the
 * positioner flips on collision, so a dragged pill still reads correctly.
 */
export function PillTooltip({
  label,
  side = "bottom",
  render,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  render: React.ReactElement<Record<string, unknown>>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger closeDelay={0} delay={200} render={render} />
      <TooltipPopup side={side}>{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * A labelled row inside a pill control's popover — the open-in picker and the
 * collapsed git cluster both use it, so the two read as one surface instead of
 * two lookalikes that drifted apart.
 */
export function pillMenuRowClass() {
  return "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-foreground/80 transition-colors hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-40 dark:text-white/80 dark:hover:bg-white/10";
}

/**
 * A pill control plus its hover surface.
 *
 * The hover surface is always portaled to <body>. It cannot live inside the
 * pill: the pill root sets `overflow-x-auto` (which clips it) *and* `transform`
 * + `backdrop-filter` (which pins it into the pill's own stacking context). Both
 * primitives portal out and carry `FLOATING_SURFACE_Z.portalOverlay`.
 *
 * Entries with a `PILL_NAV_META` key (explicit `meta`, or the item's own href)
 * get the rich card; everything else falls back to the plain label tooltip.
 */
function PillItem({
  href,
  onClick,
  label,
  icon,
  active,
  tint,
  dimmed,
  shortcut,
  meta,
  side,
}: {
  href: string | null;
  onClick?: (() => void) | undefined;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  tint?: string | undefined;
  dimmed?: boolean | undefined;
  shortcut?: string | null | undefined;
  meta?: PillNavMetaKey | undefined;
  side: "top" | "bottom" | "left" | "right";
}) {
  const tooltipLabel = shortcut ? `${label} (${shortcut})` : label;
  // No hover background/border/ring — brighten instead. Untinted icons (the
  // /40-opacity default) go to full opacity; tinted ones (workspace children,
  // always rendered at their category's full accent colour via `style` below,
  // so an opacity ramp would be invisible) get a brightness bump instead —
  // `filter` isn't touched by the inline `color`, so it still reads on hover.
  const classes = cn(
    PILL_BASE,
    "w-8 h-8",
    active && PILL_ACTIVE,
    !active && (tint ? "hover:brightness-125" : PILL_IDLE),
    dimmed && "opacity-50",
  );

  const control = href ? (
    <Link
      to={href}
      aria-label={label}
      className={classes}
      style={tint ? { color: tint } : undefined}
    >
      {icon}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={classes}
      style={tint ? { color: tint } : undefined}
    >
      {icon}
    </button>
  );

  const metaKey = meta ?? href;
  if (hasPillNavMeta(metaKey)) {
    return <PillNavHoverCard metaKey={metaKey} render={control} shortcut={shortcut} side={side} />;
  }

  return <PillTooltip label={tooltipLabel} side={side} render={control} />;
}

// ─── divider ────────────────────────────────────────────────

function Divider({ vertical }: { vertical: boolean }) {
  return vertical ? (
    <div className="w-5 h-px bg-foreground/10 dark:bg-white/10 mx-auto my-0.5" />
  ) : (
    <div className="w-px h-5 bg-foreground/10 dark:bg-white/10 mx-0.5" />
  );
}
