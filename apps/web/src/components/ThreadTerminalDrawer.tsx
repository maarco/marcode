<<<<<<< HEAD
import { useAtomValue } from "@effect/atom-react";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon, type ISearchOptions } from "@xterm/addon-search";
=======
import { useAtomMount, useAtomValue } from "@effect/atom-react";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { terminalOutputText } from "@t3tools/client-runtime/state/terminal";
import {
<<<<<<< HEAD
=======
  INITIAL_TERMINAL_OUTPUT_CURSOR,
  readTerminalOutputUpdate,
  type TerminalOutputCursor,
  type TerminalOutputUpdate,
  type TerminalSessionState,
} from "@t3tools/client-runtime/state/terminal";
import {
  Plus,
  Square,
  SquareSplitHorizontal,
  SquareSplitVertical,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import {
  AuthPreviewOperateScope,
  AuthOrchestrationOperateScope,
  AuthTerminalOperateScope,
  type ContextMenuItem,
  type ProviderInstanceId,
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import { getTerminalLabel } from "@t3tools/shared/terminalLabels";
import { Terminal, type ITheme } from "@xterm/xterm";
import {
  Fragment,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
<<<<<<< HEAD
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
=======
  useEffect,
  useEffectEvent,
  useLayoutEffect,
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { Button } from "~/components/ui/button";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
// Terminal chrome is filled-icon only, one family. Lucide outlines used to be
// mixed in here; they read thinner than everything else in the pill surfaces.
import {
  AddSquareFilled,
  ArrowDownFilled,
  ArrowUp1Filled,
  CloseSquareFilled,
  Code1Filled,
  FullFilled,
  RowHorizontalFilled,
  RowVerticalFilled,
  SearchNormal1Filled,
  SidebarBottomFilled,
  SidebarRightFilled,
} from "@aliimam/icons";
import { usePillNavPreferences, type TerminalPlacement } from "~/editor/pill-prefs";
import { useRightPanelStore } from "~/rightPanelStore";
import { useTerminalUiStateStore } from "~/terminalUiStateStore";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { cn, isMacPlatform } from "~/lib/utils";
import { pillIconButtonClass } from "./FloatingPillNav";
import { type TerminalContextSelection } from "~/lib/terminalContext";
import { useOpenInPreferredEditor } from "../editorPreferences";
<<<<<<< HEAD
import {
  collectWrappedTerminalLinkLine,
  extractTerminalLinks,
  isTerminalLinkActivation,
  resolvePathLinkTarget,
  resolveWrappedTerminalLinkRange,
  wrappedTerminalLinkRangeIntersectsBufferLine,
} from "../terminal-links";
=======
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";
import { isTerminalUrl } from "../terminal-links";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
import {
  isDiffToggleShortcut,
  isTerminalClearShortcut,
  isTerminalNewShortcut,
  isTerminalSplitShortcut,
  isTerminalSplitVerticalShortcut,
  isTerminalCloseShortcut,
  isTerminalToggleShortcut,
  terminalDeleteShortcutData,
  terminalNavigationShortcutData,
} from "../keybindings";
import {
  DEFAULT_THREAD_TERMINAL_HEIGHT,
  MAX_TERMINALS_PER_GROUP,
  type ThreadTerminalGroup,
} from "../types";
import { readLocalApi } from "~/localApi";
import { confirmTerminalClose } from "~/lib/terminalCloseConfirm";
import { useClientSettings } from "../hooks/useSettings";
import * as Schema from "effect/Schema";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { attachedTerminalSessionAtom } from "../state/terminalSessions";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { serverEnvironment } from "../state/server";
import { previewEnvironment } from "../state/preview";
import { readEnvironmentScope } from "../state/session";
import { terminalEnvironment } from "../state/terminal";
import { useEnvironmentScope } from "../state/session";
import { openTerminalLinkInPreview } from "./preview/openTerminalLinkInPreview";
import { useAtomCommand } from "../state/use-atom-command";
<<<<<<< HEAD
=======
import { preventTerminalCloseShortcut } from "../lib/terminalCloseShortcut";
import { observeResize } from "../lib/observeResize";
import {
  consumePendingTerminalFocus,
  focusTerminal,
  focusTerminalViewport,
  registerTerminalFocusTarget,
} from "../lib/terminalFocus";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
import {
  resolveTerminalFontPreference,
  resolveTerminalFontSizePreference,
  TYPOGRAPHY_ADVANCED_STORAGE_KEY,
} from "../appearanceFonts";
// Required, not cosmetic: xterm.js relies on this stylesheet to hide its own
// internal scaffolding (char-width measurement scratchpad, the offscreen IME
// helper textarea, the composition-view popup, decoration/accessibility
// layers). Without it those elements render inline with default browser
// styles instead of being hidden — see the "333...MMM" garbage-above-prompt
// bug: `.xterm-char-measure-element` renders 32 repeats of a probe character
// per font weight/style variant while measuring cell width, and this rule is
// the only thing that keeps that scratchpad hidden.
import "@xterm/xterm/css/xterm.css";

const MIN_DRAWER_HEIGHT = 180;
const MAX_DRAWER_HEIGHT_RATIO = 0.75;
const MULTI_CLICK_SELECTION_ACTION_DELAY_MS = 260;

/**
 * One icon size per chrome. Mixed sizes in a single control row have shipped
 * here twice; `sm` is the session-sidebar header, `md` the no-sidebar cluster.
 */
// `titlebar` is the panel titlebar's own scale — the pill's 32px/16px. Placement
// buttons portal up there next to Maximize/Close and have to match their
// row-mates, not the denser cluster they came from.
const CHROME_ICON_CLASS = { sm: "size-3", md: "size-3.25", titlebar: "size-4" } as const;
type ChromeSize = keyof typeof CHROME_ICON_CLASS;

/**
 * Box size per chrome. Square on purpose — the cluster used to render 20x21
 * (`h-full` inside a 21.44px row), which is not a square and not a pill.
 *
 * Two scales, deliberately: `sm` is the session-sidebar header, six controls
 * inside a 144px-wide column, so 24px does not fit; `md` is the free-floating
 * cluster. The panel titlebar keeps the pill's own 32px scale via
 * `pillIconButtonClass()` untouched. Everything is round; nothing is square-
 * cornered, and no chrome mixes box sizes.
 */
const CHROME_BOX_CLASS = { sm: "size-5", md: "size-6", titlebar: "size-8" } as const;

/**
 * The pill's button language, at terminal-chrome density.
 *
 * Reuses `pillIconButtonClass` (borderless, round, tinted on hover) and only
 * overrides the box, so the cluster cannot drift away from the pill again.
 * Disabled is styled here rather than via `:disabled` because these buttons are
 * soft-disabled with `aria-disabled` — see TerminalActionButton.
 */
function terminalChromeButtonClass(
  size: ChromeSize,
  options: { active?: boolean; disabled?: boolean } = {},
): string {
  return cn(
    pillIconButtonClass(options.active ?? false),
    CHROME_BOX_CLASS[size],
    options.disabled ? "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-inherit" : "",
  );
}

/** Hex-only (xterm requires #RRGGBB) and mid-tone so both themes stay legible. */
const SEARCH_DECORATIONS = {
  matchBackground: "#5f6b7a",
  matchBorder: "#94a3b8",
  matchOverviewRuler: "#94a3b8",
  activeMatchBackground: "#c2410c",
  activeMatchBorder: "#fb923c",
  activeMatchColorOverviewRuler: "#fb923c",
} as const;

function terminalSearchOptions(caseSensitive: boolean, incremental: boolean): ISearchOptions {
  return {
    caseSensitive,
    incremental,
    regex: false,
    wholeWord: false,
    decorations: SEARCH_DECORATIONS,
  };
}

export interface TerminalSearchResults {
  readonly resultIndex: number;
  readonly resultCount: number;
}

/**
 * The search addon is per-terminal (it owns that instance's decorations), but
 * the find UI lives in the chrome. Each viewport publishes this handle so the
 * chrome can drive whichever terminal is active.
 */
export interface TerminalSearchController {
  findNext: (term: string, caseSensitive: boolean, incremental: boolean) => boolean;
  findPrevious: (term: string, caseSensitive: boolean) => boolean;
  clear: () => void;
  focusTerminal: () => void;
  setResultsListener: (listener: ((results: TerminalSearchResults) => void) | null) => void;
}

export type TerminalSearchControllerMap = Map<string, TerminalSearchController>;

export function terminalFindShortcutLabel(platform = navigator.platform): string {
  return isMacPlatform(platform) ? "⌘F" : "Ctrl+Shift+F";
}

/** Cmd+F on macOS; Ctrl+Shift+F elsewhere, because Ctrl+F is readline forward-char. */
export function isTerminalFindShortcut(event: KeyboardEvent): boolean {
  if (event.type !== "keydown") return false;
  if (event.key.toLowerCase() !== "f") return false;
  if (event.altKey) return false;
  if (event.metaKey && !event.ctrlKey && !event.shiftKey) return true;
  return event.ctrlKey && event.shiftKey && !event.metaKey;
}

interface DrawerLayout {
  viewportHeight: number;
  chatColumnHeight?: number;
  headerHeight?: number;
  composerHeight?: number;
}

function resolveTerminalDrawerMaxHeight(input: DrawerLayout): number {
  const windowCap = Math.max(
    MIN_DRAWER_HEIGHT,
    Math.floor(input.viewportHeight * MAX_DRAWER_HEIGHT_RATIO),
  );
  if (input.chatColumnHeight === undefined) return windowCap;
  // The composer overlays the timeline, so flex layout cannot reserve its
  // height; without this cap a tall drawer pushes it into the header.
  return Math.min(
    windowCap,
    Math.max(0, input.chatColumnHeight - (input.headerHeight ?? 0) - (input.composerHeight ?? 0)),
  );
}

const DRAG_HEIGHT_PROPERTY = "--terminal-drawer-drag-height";

function clampDrawerHeight(height: number, maxHeight: number): number {
  const safeHeight = Number.isFinite(height) ? height : DEFAULT_THREAD_TERMINAL_HEIGHT;
  return Math.min(Math.max(Math.round(safeHeight), MIN_DRAWER_HEIGHT), maxHeight);
}

<<<<<<< HEAD
function writeSystemMessage(terminal: Terminal, message: string): void {
=======
function chatColumnOf(drawer: HTMLElement | null): HTMLElement | null {
  return drawer?.closest<HTMLElement>("[data-chat-column]") ?? null;
}

function readDrawerLayout(column: HTMLElement | null): Omit<DrawerLayout, "composerHeight"> {
  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
  if (!column) return { viewportHeight };
  return {
    viewportHeight,
    chatColumnHeight: column.clientHeight,
    headerHeight: column.querySelector<HTMLElement>("[data-chat-header]")?.offsetHeight ?? 0,
  };
}

function writeSystemMessage(
  terminal: Pick<GhosttyTerminalSurface, "write">,
  message: string,
): void {
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  terminal.write(`\r\n[terminal] ${message}\r\n`);
}

function writeTerminalBuffer(terminal: Terminal, buffer: string): void {
  terminal.write("\u001bc");
  if (buffer.length > 0) {
    terminal.write(buffer);
  }
}

<<<<<<< HEAD
function fitTerminalSafely(fitAddon: FitAddon): boolean {
  try {
    fitAddon.fit();
    return true;
  } catch {
    return false;
  }
=======
export function synchronizeTerminalOutput(
  terminal: Pick<GhosttyTerminalSurface, "resetAndWrite" | "write" | "clearSelection">,
  session: Pick<TerminalSessionState, "output" | "version">,
  cursor: TerminalOutputCursor,
): TerminalOutputCursor {
  if (session.version === 0) return cursor;
  const update = readTerminalOutputUpdate(session.output, cursor);
  writeTerminalOutputUpdate(terminal, update);
  terminal.clearSelection();
  return update.cursor;
}

/** Writes what changed between two session notifications: new output, then a new error. */
export function synchronizeTerminalSession(
  terminal: Pick<GhosttyTerminalSurface, "resetAndWrite" | "write" | "clearSelection">,
  previous: Pick<TerminalSessionState, "output" | "version" | "error">,
  session: Pick<TerminalSessionState, "output" | "version" | "error">,
  cursor: TerminalOutputCursor,
): TerminalOutputCursor {
  const nextCursor =
    session.version === previous.version && session.output === previous.output
      ? cursor
      : synchronizeTerminalOutput(terminal, session, cursor);
  // An attach failure can change only the error, keeping the last buffer.
  if (session.error !== null && session.error !== previous.error) {
    writeSystemMessage(terminal, session.error);
  }
  return nextCursor;
}

function parseTerminalColor(value: string, fallback: GhosttyColor): GhosttyColor {
  if (typeof document === "undefined") return fallback;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallback;

  context.clearRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha === 0) return fallback;

  return {
    r: red ?? fallback.r,
    g: green ?? fallback.g,
    b: blue ?? fallback.b,
  };
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
}

function hexToGhosttyColor(hex: string): GhosttyColor {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

const TERMINAL_PALETTES = {
  light: [
    "#000000",
    "#cd3131",
    "#107c10",
    "#949800",
    "#0451a5",
    "#bc05bc",
    "#0598bc",
    "#555555",
    "#666666",
    "#cd3131",
    "#14ce14",
    "#b5ba00",
    "#0451a5",
    "#bc05bc",
    "#0598bc",
    "#a5a5a5",
  ].map(hexToGhosttyColor),
  dark: [
    "#000000",
    "#cd3131",
    "#0dbc79",
    "#e5e510",
    "#2472c8",
    "#bc3fbc",
    "#11a8cd",
    "#e5e5e5",
    "#666666",
    "#f14c4c",
    "#23d18b",
    "#f5f543",
    "#3b8eea",
    "#d670d6",
    "#29b8db",
    "#e5e5e5",
  ].map(hexToGhosttyColor),
};

// Read visibility when WASM finishes loading, not when setup starts.
function withLiveVisibility(
  visibleRef: { readonly current: boolean },
  options: Omit<GhosttyTerminalSurfaceOptions, "visible">,
): GhosttyTerminalSurfaceOptions {
  return {
    ...options,
    get visible() {
      return visibleRef.current;
    },
  };
}

function runtimeEnvSignature(runtimeEnv: Record<string, string> | undefined): string {
  if (!runtimeEnv) return "";
  return JSON.stringify(
    Object.entries(runtimeEnv)
      .filter(([key, value]) => key.length > 0 && typeof value === "string")
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)),
  );
}

function normalizeComputedColor(value: string | null | undefined, fallback: string): string {
  const normalizedValue = value?.trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0 0 0 / 0)"
  ) {
    return fallback;
  }
  return value ?? fallback;
}

function readThemeColor(styles: CSSStyleDeclaration, variable: string, fallback: string): string {
  return normalizeComputedColor(styles.getPropertyValue(variable), fallback);
}

<<<<<<< HEAD
// ── Marcode fork seam ──────────────────────────────────────────────────
// Upstream replaced this drawer's xterm.js surface with their own Ghostty
// surface (`~/terminal/ghostty/*`). Marcode keeps xterm deliberately: the
// terminal search this file implements (find bar, match navigation, wrapped
// link ranges) has no equivalent there. The cost is real and accepted —
// every upstream change to the terminal subsystem is re-ported by hand, and
// upstream's Ghostty-only helpers are not imported here. Port their fixes
// into this implementation rather than reinstating theirs.
function terminalThemeFromApp(mountElement?: HTMLElement | null): ITheme {
  const isDark = document.documentElement.classList.contains("dark");
  const fallbackBackground = isDark ? "rgb(14, 18, 24)" : "rgb(255, 255, 255)";
  const fallbackForeground = isDark ? "rgb(237, 241, 247)" : "rgb(28, 33, 41)";
=======
function terminalFontOptions(family: string, size: number): { family?: string; size: number } {
  const trimmed = family.trim();
  return trimmed.length > 0 ? { family: trimmed, size } : { size };
}

export function terminalThemeFromApp(mountElement?: HTMLElement | null): GhosttyTheme {
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  const drawerSurface =
    mountElement?.closest("[data-thread-terminal-drawer]") ??
    document.querySelector("[data-thread-terminal-drawer]") ??
    document.body;
  const drawerStyles = getComputedStyle(drawerSurface);
  const bodyStyles = getComputedStyle(document.body);
  const themeStyles = getComputedStyle(document.documentElement);
  const background = normalizeComputedColor(
    drawerStyles.backgroundColor,
    normalizeComputedColor(bodyStyles.backgroundColor, fallbackBackground),
  );
  const foreground = normalizeComputedColor(
    drawerStyles.color,
    normalizeComputedColor(bodyStyles.color, fallbackForeground),
  );
  // Ported from upstream's Ghostty surface: a theme may override the terminal
  // colors explicitly, and those tokens must win over the drawer's computed
  // surface. Marcode still renders through xterm (it carries the terminal
  // search this file implements), so the tokens are applied to ITheme here.
  const themedBackground = readThemeColor(themeStyles, "--terminal-background", background);
  const themedForeground = readThemeColor(themeStyles, "--terminal-foreground", foreground);

  if (isDark) {
    return {
      background: themedBackground,
      foreground: themedForeground,
      cursor: readThemeColor(themeStyles, "--terminal-cursor", "rgb(180, 203, 255)"),
      selectionBackground: readThemeColor(
        themeStyles,
        "--terminal-selection-background",
        "rgba(180, 203, 255, 0.25)",
      ),
      scrollbarSliderBackground: "rgba(255, 255, 255, 0.1)",
      scrollbarSliderHoverBackground: "rgba(255, 255, 255, 0.18)",
      scrollbarSliderActiveBackground: "rgba(255, 255, 255, 0.22)",
      black: "rgb(24, 30, 38)",
      red: "rgb(255, 122, 142)",
      green: "rgb(134, 231, 149)",
      yellow: "rgb(244, 205, 114)",
      blue: "rgb(137, 190, 255)",
      magenta: "rgb(208, 176, 255)",
      cyan: "rgb(124, 232, 237)",
      white: "rgb(210, 218, 230)",
      brightBlack: "rgb(110, 120, 136)",
      brightRed: "rgb(255, 168, 180)",
      brightGreen: "rgb(176, 245, 186)",
      brightYellow: "rgb(255, 224, 149)",
      brightBlue: "rgb(174, 210, 255)",
      brightMagenta: "rgb(229, 203, 255)",
      brightCyan: "rgb(167, 244, 247)",
      brightWhite: "rgb(244, 247, 252)",
    };
  }

  return {
    background: themedBackground,
    foreground: themedForeground,
    cursor: readThemeColor(themeStyles, "--terminal-cursor", "rgb(38, 56, 78)"),
    selectionBackground: readThemeColor(
      themeStyles,
      "--terminal-selection-background",
      "rgba(37, 63, 99, 0.2)",
    ),
<<<<<<< HEAD
    scrollbarSliderBackground: "rgba(0, 0, 0, 0.15)",
    scrollbarSliderHoverBackground: "rgba(0, 0, 0, 0.25)",
    scrollbarSliderActiveBackground: "rgba(0, 0, 0, 0.3)",
    black: "rgb(44, 53, 66)",
    red: "rgb(191, 70, 87)",
    green: "rgb(60, 126, 86)",
    yellow: "rgb(146, 112, 35)",
    blue: "rgb(72, 102, 163)",
    magenta: "rgb(132, 86, 149)",
    cyan: "rgb(53, 127, 141)",
    white: "rgb(210, 215, 223)",
    brightBlack: "rgb(112, 123, 140)",
    brightRed: "rgb(212, 95, 112)",
    brightGreen: "rgb(85, 148, 111)",
    brightYellow: "rgb(173, 133, 45)",
    brightBlue: "rgb(91, 124, 194)",
    brightMagenta: "rgb(153, 107, 172)",
    brightCyan: "rgb(70, 149, 164)",
    brightWhite: "rgb(236, 240, 246)",
  };
}

function getTerminalSelectionRect(mountElement: HTMLElement): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;
  const selectionRoot =
    commonAncestor instanceof Element ? commonAncestor : commonAncestor.parentElement;
  if (!(selectionRoot instanceof Element) || !mountElement.contains(selectionRoot)) {
    return null;
  }

  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  if (rects.length > 0) {
    return rects[rects.length - 1] ?? null;
  }

  const boundingRect = range.getBoundingClientRect();
  return boundingRect.width > 0 || boundingRect.height > 0 ? boundingRect : null;
}

export function resolveTerminalSelectionActionPosition(options: {
  bounds: { left: number; top: number; width: number; height: number };
  selectionRect: { right: number; bottom: number } | null;
  pointer: { x: number; y: number } | null;
  viewport?: { width: number; height: number } | null;
}): { x: number; y: number } {
  const { bounds, selectionRect, pointer, viewport } = options;
  const viewportWidth =
    viewport?.width ??
    (typeof window === "undefined" ? bounds.left + bounds.width + 8 : window.innerWidth);
  const viewportHeight =
    viewport?.height ??
    (typeof window === "undefined" ? bounds.top + bounds.height + 8 : window.innerHeight);
  const drawerLeft = Math.round(bounds.left);
  const drawerTop = Math.round(bounds.top);
  const drawerRight = Math.round(bounds.left + bounds.width);
  const drawerBottom = Math.round(bounds.top + bounds.height);
  const preferredX =
    selectionRect !== null
      ? Math.round(selectionRect.right)
      : pointer === null
        ? Math.round(bounds.left + bounds.width - 140)
        : Math.max(drawerLeft, Math.min(Math.round(pointer.x), drawerRight));
  const preferredY =
    selectionRect !== null
      ? Math.round(selectionRect.bottom + 4)
      : pointer === null
        ? Math.round(bounds.top + 12)
        : Math.max(drawerTop, Math.min(Math.round(pointer.y), drawerBottom));
=======
    foreground: parseTerminalColor(
      terminalForeground,
      isDark ? { r: 237, g: 241, b: 247 } : { r: 28, g: 33, b: 41 },
    ),
    cursor: parseTerminalColor(
      terminalCursor,
      isDark ? { r: 180, g: 203, b: 255 } : { r: 38, g: 56, b: 78 },
    ),
    palette: TERMINAL_PALETTES[isDark ? "dark" : "light"],
    selectionBackground: terminalSelection,
  };
}

function terminalSelectionLineRange(position: { start: { y: number }; end: { y: number } }): {
  lineStart: number;
  lineEnd: number;
} {
  const lineStart = position.start.y + 1;
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  return {
    x: Math.max(8, Math.min(preferredX, Math.max(viewportWidth - 8, 8))),
    y: Math.max(8, Math.min(preferredY, Math.max(viewportHeight - 8, 8))),
  };
}

<<<<<<< HEAD
export function terminalSelectionActionDelayForClickCount(clickCount: number): number {
  return clickCount >= 2 ? MULTI_CLICK_SELECTION_ACTION_DELAY_MS : 0;
}

export function shouldHandleTerminalSelectionMouseUp(
  selectionGestureActive: boolean,
  button: number,
): boolean {
  return selectionGestureActive && button === 0;
=======
export type TerminalContextMenuAction =
  | "add-to-chat"
  | "copy"
  | "paste"
  | "select-all"
  | "scroll-to-bottom";

function terminalSelectionMenuItems(options?: {
  canAddToChat?: boolean;
}): ContextMenuItem<"add-to-chat" | "copy">[] {
  return [
    ...(options?.canAddToChat === false
      ? []
      : ([{ id: "add-to-chat", label: "Add to chat" }] satisfies ContextMenuItem<"add-to-chat">[])),
    { id: "copy", label: "Copy" },
  ];
}

function terminalContextMenuItems(options: {
  hasSelection: boolean;
  canAddToChat?: boolean;
  readOnly?: boolean;
}): ContextMenuItem<TerminalContextMenuAction>[] {
  const { hasSelection, canAddToChat = true } = options;
  return [
    ...terminalSelectionMenuItems({ canAddToChat }).map((item) => ({
      ...item,
      disabled: !hasSelection,
    })),
    { id: "paste", label: "Paste", ...(options.readOnly ? { disabled: true } : {}) },
    { id: "select-all", label: "Select all" },
    { id: "scroll-to-bottom", label: "Jump to latest" },
  ];
}

/** A superseded popup's unsettled promise must not cancel the newer right-click flow. */
export function shouldClearTerminalSelectionAction(options: {
  actionPending: boolean;
  openMenuRequestId: number | null;
  currentRequestId: number;
}): boolean {
  return options.actionPending || options.openMenuRequestId === options.currentRequestId;
}

/**
 * A writable session's output generation. A new one is a fresh PTY (or a
 * reconnect) that has not seen the surface's grid yet.
 */
function writableSessionGeneration(
  session: TerminalSessionState,
  canOperate: boolean,
): number | null {
  return canOperate && session.version > 0 && session.status === "running"
    ? session.output.generation
    : null;
}

export function shouldHandleTerminalExit(
  current: TerminalSessionState["status"],
  synchronized: TerminalSessionState["status"],
  alreadyHandled: boolean,
  version: number,
): boolean {
  return (
    version > 0 &&
    (current === "closed" || current === "exited") &&
    current !== synchronized &&
    !alreadyHandled
  );
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
}

interface TerminalViewportProps {
  advancedTypography: boolean;
  threadRef: ScopedThreadRef;
  threadId: ThreadId;
  terminalId: string;
  terminalLabel: string;
  cwd: string;
  worktreePath?: string | null;
  runtimeEnv?: Record<string, string>;
  onSessionExited: () => void;
<<<<<<< HEAD
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  focusRequestId: number;
  autoFocus: boolean;
  resizeEpoch: number;
  drawerHeight: number;
=======
  onAddTerminalContext?: (selection: TerminalContextSelection) => void;
  /** Focuses the viewport when it mounts; otherwise focus arrives through `focusTerminal`. */
  autoFocus?: boolean;
  visible: boolean;
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  keybindings: ResolvedKeybindingsConfig;
  /** Publishes/retracts this terminal's search handle for the chrome's find bar. */
  onSearchControllerChange?: (
    terminalId: string,
    controller: TerminalSearchController | null,
  ) => void;
  /** Cmd+F inside the terminal opens the chrome's find bar instead of Chrome's. */
  onRequestSearch?: () => void;
}

interface TerminalLaunchLocation {
  readonly cwd: string;
  readonly worktreePath?: string | null;
  readonly runtimeEnv?: Record<string, string>;
}

export function TerminalViewport(props: TerminalViewportProps) {
  const sessionKey = JSON.stringify([
    props.threadRef.environmentId,
    props.threadId,
    props.terminalId,
    props.cwd,
    props.worktreePath ?? null,
    runtimeEnvSignature(props.runtimeEnv),
  ]);
  return <TerminalSessionViewport key={sessionKey} {...props} />;
}

function TerminalSessionViewport({
  advancedTypography,
  threadRef,
  threadId,
  terminalId,
  terminalLabel,
  cwd,
  worktreePath,
  runtimeEnv,
  onSessionExited,
  onAddTerminalContext,
<<<<<<< HEAD
  focusRequestId,
  autoFocus,
  resizeEpoch,
  drawerHeight,
=======
  autoFocus = false,
  visible,
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  keybindings,
  onSearchControllerChange,
  onRequestSearch,
}: TerminalViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
<<<<<<< HEAD
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchResultsListenerRef = useRef<((results: TerminalSearchResults) => void) | null>(null);
  const publishSearchController = useEffectEvent((controller: TerminalSearchController | null) => {
    onSearchControllerChange?.(terminalId, controller);
  });
  const requestSearch = useEffectEvent(() => {
    onRequestSearch?.();
  });
=======
  const autoFocusedRef = useRef(false);
  const terminalRef = useRef<GhosttyTerminalSurface | null>(null);
  const visibleRef = useRef(visible);
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  const environmentId = threadRef.environmentId;
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const hasTerminalWriteAccess = useEffectEvent(() =>
    readEnvironmentScope(environmentId, AuthTerminalOperateScope),
  );
  const canOpenHostEditor = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const canActivateTerminalLink = useEffectEvent(
    (text: string) =>
      isTerminalUrl(text) || readEnvironmentScope(environmentId, AuthOrchestrationOperateScope),
  );
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const openInPreferredEditor = useOpenInPreferredEditor(
    environmentId,
    serverConfig?.availableEditors ?? [],
  );
  const openTerminalPath = useEffectEvent((target: string) => openInPreferredEditor(target));
  const openPreview = useAtomCommand(previewEnvironment.open, {
    reportFailure: false,
  });
  const runTerminalWrite = useAtomCommand(terminalEnvironment.write, {
    reportFailure: false,
  });
  const runTerminalResize = useAtomCommand(terminalEnvironment.resize, {
    reportFailure: false,
  });
  const hasHandledExitRef = useRef(false);
  const selectionPointerRef = useRef<{ x: number; y: number } | null>(null);
  const selectionGestureActiveRef = useRef(false);
  const selectionActionRequestIdRef = useRef(0);
<<<<<<< HEAD
  // ── Marcode fork seam ──
  // Marcode's xterm surface tracks only whether a selection popup is on
  // screen. Upstream replaced this with openSelectionMenuRequestIdRef for
  // their Ghostty surface's context-menu flow, which this fork does not run.
  const selectionActionMenuOpenRef = useRef(false);
  const selectionActionTimerRef = useRef<number | null>(null);
  const keybindingsRef = useRef(keybindings);
  const runtimeEnvKey = useMemo(() => runtimeEnvSignature(runtimeEnv), [runtimeEnv]);
=======
  const openSelectionMenuRequestIdRef = useRef<number | null>(null);
  const readKeybindings = useEffectEvent(() => keybindings);
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  const handleSessionExited = useEffectEvent(() => {
    if (hasTerminalWriteAccess()) onSessionExited();
  });
  const handleAddTerminalContext = useEffectEvent((selection: TerminalContextSelection) => {
    onAddTerminalContext(selection);
  });
  const readTerminalLabel = useEffectEvent(() => terminalLabel);
  const terminalFontFamily = useClientSettings((settings) =>
    resolveTerminalFontPreference({
      advanced: advancedTypography,
      code: settings.fontFamilyCode,
      terminal: settings.fontFamilyTerminal,
    }),
  );
  const terminalFontSize = useClientSettings((settings) =>
    resolveTerminalFontSizePreference({
      advanced: advancedTypography,
      code: settings.fontSizeCode,
      terminal: settings.fontSizeTerminal,
    }),
  );
  const terminalFontRef = useRef({ family: terminalFontFamily, size: terminalFontSize });
<<<<<<< HEAD
  const terminalSession = useAttachedTerminalSession({
    environmentId,
    terminal: {
      threadId,
      terminalId,
      cwd,
      ...(worktreePath !== undefined ? { worktreePath } : {}),
      ...(runtimeEnv ? { env: runtimeEnv } : {}),
    },
=======
  // Keyed by the launch (see TerminalViewport), so the atom is fixed for this surface.
  const terminalSessionAtom = attachedTerminalSessionAtom(environmentId, {
    threadId,
    terminalId,
    cwd,
    ...(worktreePath !== undefined ? { worktreePath } : {}),
    ...(runtimeEnv ? { env: runtimeEnv } : {}),
    ...(providerInstanceId ? { providerInstanceId } : {}),
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  });
  // Attaching starts with the viewport, while the WASM surface is still loading;
  // the surface reads the session itself, so output chunks never re-render here.
  useAtomMount(terminalSessionAtom);
  const readTerminalSession = useEffectEvent(() => appAtomRegistry.get(terminalSessionAtom));
  const subscribeTerminalSession = useEffectEvent(
    (listener: (session: TerminalSessionState) => void) =>
      appAtomRegistry.subscribe(terminalSessionAtom, listener),
  );
  const writeTerminal = useEffectEvent((data: string) =>
    runTerminalWrite({
      environmentId,
      input: { threadId, terminalId, data },
    }),
  );
  const resizeTerminal = useEffectEvent((cols: number, rows: number) => {
    if (writableSessionGeneration(readTerminalSession(), hasTerminalWriteAccess()) === null) {
      return;
    }
    return runTerminalResize({
      environmentId,
      input: { threadId, terminalId, cols, rows },
<<<<<<< HEAD
    }),
  );
  // ── Marcode fork seam ──
  // Upstream replaced the session's flat `buffer` with chunked output plus a
  // read cursor for their Ghostty surface. This xterm drawer reconciles by
  // diffing the whole buffer, so flatten the chunks back to one string here
  // rather than reshape the reconciliation loop below.
  const terminalBuffer = terminalOutputText(terminalSession.output);
  const terminalError = terminalSession.error;
  const terminalStatus = terminalSession.status;
  const terminalVersion = terminalSession.version;
  const previousSessionRef = useRef({
    buffer: terminalBuffer,
    error: terminalError,
    status: terminalStatus,
    version: terminalVersion,
  });
=======
    });
  });
  const outputCursorRef = useRef<TerminalOutputCursor>(INITIAL_TERMINAL_OUTPUT_CURSOR);
  const synchronizedStatusRef = useRef<TerminalSessionState["status"]>("closed");
  const synchronizeTerminalStatus = useEffectEvent(
    (terminal: GhosttyTerminalSurface, status: TerminalSessionState["status"], version: number) => {
      const synchronized = synchronizedStatusRef.current;
      if (version > 0 && status === "running") {
        hasHandledExitRef.current = false;
      } else if (
        shouldHandleTerminalExit(status, synchronized, hasHandledExitRef.current, version)
      ) {
        hasHandledExitRef.current = true;
        writeSystemMessage(terminal, status === "closed" ? "Terminal closed" : "Process exited");
        window.setTimeout(() => {
          if (hasHandledExitRef.current) {
            handleSessionExited();
          }
        }, 0);
      }
      if (version > 0) synchronizedStatusRef.current = status;
    },
  );
  const openLinkInPreview = useEffectEvent(
    (url: string, forceBrowser: boolean, fallbackToBrowser: () => void) =>
      openTerminalLinkInPreview({ url, threadRef, openPreview, fallbackToBrowser, forceBrowser }),
  );
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7

  useLayoutEffect(() => {
    if (terminalRef.current) terminalRef.current.input.readOnly = !canOperateTerminal;
    if (canOperateTerminal && visibleRef.current)
      consumePendingTerminalFocus(threadRef, terminalId);
  }, [canOperateTerminal, terminalId, threadRef]);

  // Links re-read the grant on activation; only the hovered link's styling needs a nudge.
  const linkActivationScopeRef = useRef(canOpenHostEditor);
  useEffect(() => {
    if (linkActivationScopeRef.current === canOpenHostEditor) return;
    linkActivationScopeRef.current = canOpenHostEditor;
    terminalRef.current?.refreshLinkActivation();
  }, [canOpenHostEditor]);

<<<<<<< HEAD
=======
  useLayoutEffect(() => {
    visibleRef.current = visible;
    terminalRef.current?.setVisible(visible);
    // A request made while this viewport was hidden could not focus it.
    if (visible) consumePendingTerminalFocus(threadRef, terminalId);
  }, [terminalId, threadRef, visible]);

>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  useEffect(() => {
    const current = terminalFontRef.current;
    if (current.family === terminalFontFamily && current.size === terminalFontSize) return;
    terminalFontRef.current = { family: terminalFontFamily, size: terminalFontSize };
    const activeTerminal = terminalRef.current;
    if (!activeTerminal) return;
    const family = terminalFontFamily.trim();
    if (family.length > 0) activeTerminal.options.fontFamily = family;
    activeTerminal.options.fontSize = terminalFontSize;
    // The cell grid is derived from font metrics, so a size change without a
    // refit leaves the viewport reporting stale cols/rows to the pty.
    const activeFit = fitAddonRef.current;
    if (activeFit) fitTerminalSafely(activeFit);
  }, [terminalFontFamily, terminalFontSize]);

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    const localApi = readLocalApi();

<<<<<<< HEAD
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const terminal = new Terminal({
      cursorBlink: true,
      lineHeight: 1,
      fontSize: 12,
      scrollback: 5_000,
      // Required by the search addon: highlight-all and the match counter go
      // through registerDecoration, which throws without this.
      allowProposedApi: true,
      fontFamily:
        '"SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, monospace',
      theme: terminalThemeFromApp(mount),
    });
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.open(mount);
    fitTerminalSafely(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    const searchResultsDisposable = searchAddon.onDidChangeResults((results) => {
      searchResultsListenerRef.current?.(results);
    });
    // A throw from the addon must never reach React — an addon failure has to
    // degrade to "no results", not unmount the terminal and kill the session.
    const guardSearch = (run: () => boolean): boolean => {
      try {
        return run();
      } catch (error) {
        console.warn("[terminal] search failed", error);
        return false;
      }
    };
    publishSearchController({
      findNext: (term, caseSensitive, incremental) =>
        guardSearch(() =>
          searchAddon.findNext(term, terminalSearchOptions(caseSensitive, incremental)),
        ),
      findPrevious: (term, caseSensitive) =>
        guardSearch(() =>
          searchAddon.findPrevious(term, terminalSearchOptions(caseSensitive, false)),
        ),
      clear: () => {
        guardSearch(() => {
          searchAddon.clearDecorations();
          return true;
        });
        terminalRef.current?.clearSelection();
      },
      focusTerminal: () => terminalRef.current?.focus(),
      setResultsListener: (listener) => {
        searchResultsListenerRef.current = listener;
      },
    });

    previousSessionRef.current = {
      buffer: "",
      status: "closed",
      error: null,
      version: 0,
    };

    const clearSelectionAction = () => {
      selectionActionRequestIdRef.current += 1;
      if (selectionActionTimerRef.current !== null) {
        window.clearTimeout(selectionActionTimerRef.current);
        selectionActionTimerRef.current = null;
      }
    };

    const readSelectionAction = (): {
      position: { x: number; y: number };
      clipboardText: string;
      selection: TerminalContextSelection;
    } | null => {
      const activeTerminal = terminalRef.current;
      const mountElement = containerRef.current;
      if (!activeTerminal || !mountElement || !activeTerminal.hasSelection()) {
        return null;
      }
      const selectionText = activeTerminal.getSelection();
      const selectionPosition = activeTerminal.getSelectionPosition();
      const normalizedText = selectionText.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
      if (!selectionPosition || normalizedText.length === 0) {
        return null;
      }
      const lineStart = selectionPosition.start.y + 1;
      const lineCount = normalizedText.split("\n").length;
      const lineEnd = Math.max(lineStart, lineStart + lineCount - 1);
      const bounds = mountElement.getBoundingClientRect();
      const selectionRect = getTerminalSelectionRect(mountElement);
      const position = resolveTerminalSelectionActionPosition({
        bounds,
        selectionRect:
          selectionRect === null
            ? null
            : { right: selectionRect.right, bottom: selectionRect.bottom },
        pointer: selectionPointerRef.current,
      });
      return {
        position,
        clipboardText: selectionText,
        selection: {
          terminalId,
          terminalLabel: readTerminalLabel(),
          lineStart,
          lineEnd,
          text: normalizedText,
        },
=======
    const setup = async (): Promise<(() => void) | null> => {
      const setupFont = terminalFontRef.current;
      const terminalOptions = withLiveVisibility(visibleRef, {
        theme: terminalThemeFromApp(mount),
        font: terminalFontOptions(setupFont.family, setupFont.size),
        onData: (data) => handleData(data),
        onResize: (cols, rows) => void resizeTerminal(cols, rows),
        onSelectionChange: () => handleSelectionChange(),
        beforeKey: (event) => handleBeforeKey(event),
        onLinkActivate: (text, event) => handleLinkActivate(text, event),
        canActivateLink: (text) => canActivateTerminalLink(text),
        // Surface listeners start before WASM loading finishes and the terminal handler exists.
        onContextMenu: (event) => {
          if (terminalRef.current) void showTerminalContextMenu(event);
        },
      });
      const terminal = await GhosttyTerminalSurface.create(mount, terminalOptions);
      if (cancelled) {
        terminal.dispose();
        return null;
      }
      terminal.setVisible(visibleRef.current);
      // Re-read theme changes during WASM loading, before the observer was installed.
      terminal.setTheme(terminalThemeFromApp(mount));
      setupTerminal = terminal;
      terminalRef.current = terminal;
      terminal.input.readOnly = !hasTerminalWriteAccess();
      // Reapply font settings hydrated during loading, when terminalRef was null.
      const currentFont = terminalFontRef.current;
      if (currentFont.family !== setupFont.family || currentFont.size !== setupFont.size) {
        void terminal.setFont(terminalFontOptions(currentFont.family, currentFont.size));
      }
      const latestSession = readTerminalSession();
      const initialOutput = readTerminalOutputUpdate(
        latestSession.output,
        INITIAL_TERMINAL_OUTPUT_CURSOR,
      );
      if (initialOutput.type === "reset" && initialOutput.data.length > 0) {
        writeTerminalOutputUpdate(terminal, initialOutput);
      }
      outputCursorRef.current = initialOutput.cursor;
      if (latestSession.error !== null) writeSystemMessage(terminal, latestSession.error);
      synchronizedStatusRef.current = "closed";
      synchronizeTerminalStatus(terminal, latestSession.status, latestSession.version);
      // Read and subscribe in one synchronous step so no output lands between them.
      let previousSession = latestSession;
      let resizeGeneration = writableSessionGeneration(latestSession, hasTerminalWriteAccess());
      setupCleanups.push(
        subscribeTerminalSession((session) => {
          const nextResizeGeneration = writableSessionGeneration(session, hasTerminalWriteAccess());
          if (nextResizeGeneration !== resizeGeneration) {
            resizeGeneration = nextResizeGeneration;
            // The first fit can precede authorization/attach; replay the grid for each writable session, including
            // reconnects.
            if (nextResizeGeneration !== null) terminal.resendSize();
          }
          const previous = previousSession;
          previousSession = session;
          synchronizeTerminalStatus(terminal, session.status, session.version);
          outputCursorRef.current = synchronizeTerminalSession(
            terminal,
            previous,
            session,
            outputCursorRef.current,
          );
        }),
      );
      if (
        hasTerminalWriteAccess() &&
        visibleRef.current &&
        mount.contains(document.activeElement)
      ) {
        terminal.focus();
      }

      const dismissSelectionAction = (supersede = false) => {
        const ownsMenu =
          openSelectionMenuRequestIdRef.current === selectionActionRequestIdRef.current;
        if (supersede || ownsMenu) selectionActionRequestIdRef.current += 1;
        if (ownsMenu) void localApi?.contextMenu.close();
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
      };
    };

<<<<<<< HEAD
    const showSelectionAction = async () => {
      if (!localApi) {
        clearSelectionAction();
        return;
      }
      if (selectionActionMenuOpenRef.current) {
        return;
      }
      const nextAction = readSelectionAction();
      if (!nextAction) {
        clearSelectionAction();
        return;
      }
      const requestId = ++selectionActionRequestIdRef.current;
      selectionActionMenuOpenRef.current = true;
      const clicked = await localApi.contextMenu
        .show(
          [
            { id: "add-to-chat", label: "Add to chat" },
            { id: "copy", label: "Copy" },
          ],
          nextAction.position,
        )
        .finally(() => {
          selectionActionMenuOpenRef.current = false;
        });
      if (requestId !== selectionActionRequestIdRef.current || clicked === null) {
        return;
      }
      switch (clicked) {
        case "add-to-chat":
          handleAddTerminalContext(nextAction.selection);
          terminalRef.current?.clearSelection();
          terminalRef.current?.focus();
=======
      const readSelectionAction = (
        pointer: SelectionActionPoint | null = null,
      ): {
        position: { x: number; y: number };
        clipboardText: string;
        selection: TerminalContextSelection;
      } | null => {
        const activeTerminal = terminalRef.current;
        const mountElement = containerRef.current;
        if (!activeTerminal || !mountElement || !activeTerminal.hasSelection()) {
          return null;
        }
        const selectionText = activeTerminal.getSelection();
        const selectionPosition = activeTerminal.getSelectionPosition();
        const normalizedText = selectionText.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
        if (!selectionPosition || normalizedText.length === 0) {
          return null;
        }
        const { lineStart, lineEnd } = terminalSelectionLineRange(selectionPosition);
        const bounds = mountElement.getBoundingClientRect();
        const position = resolveSelectionActionPosition({
          bounds,
          selectionRect: activeTerminal.getSelectionEndClientRect(),
          pointer,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        });
        return {
          position,
          clipboardText: selectionText,
          selection: {
            terminalId,
            terminalLabel: readTerminalLabel(),
            lineStart,
            lineEnd,
            text: normalizedText,
          },
        };
      };

      const addSelectionToChat = (selection: TerminalContextSelection) => {
        handleAddTerminalContext(selection);
        terminalRef.current?.clearSelection();
        terminalRef.current?.focus();
      };

      const reportIfCurrent = (requestId: number, error: unknown, fallback: string) => {
        if (requestId !== selectionActionRequestIdRef.current) return;
        const activeTerminal = terminalRef.current;
        if (activeTerminal) {
          writeSystemMessage(activeTerminal, error instanceof Error ? error.message : fallback);
        }
      };

      const focusIfCurrent = (requestId: number) => {
        if (requestId === selectionActionRequestIdRef.current) {
          terminalRef.current?.focus();
        }
      };

      const copySelection = async (text: string, requestId: number) => {
        try {
          await writeTextToClipboard(text, "terminal selection");
        } catch (error) {
          reportIfCurrent(requestId, error, "Unable to copy terminal selection");
        }
        focusIfCurrent(requestId);
      };

      const pasteFromClipboard = async (requestId: number) => {
        if (!hasTerminalWriteAccess()) return;
        const activeTerminal = terminalRef.current;
        if (!activeTerminal) return;
        try {
          // Let the surface own clipboard reads so paste shortcuts can supersede an in-flight menu paste.
          await activeTerminal.pasteFromClipboard(
            () => readTextFromClipboard("terminal input"),
            () => requestId === selectionActionRequestIdRef.current,
          );
        } catch (error) {
          reportIfCurrent(requestId, error, "Unable to read the clipboard");
          return;
        }
        focusIfCurrent(requestId);
      };

      const showTerminalContextMenu = async (event: MouseEvent) => {
        if (!localApi || !terminalRef.current) return;
        // Prevent default before awaits; native menus offer a permanently disabled Paste over the canvas.
        event.preventDefault();
        clearSelectionAction();
        const selectionAction = readSelectionAction();
        const requestId = selectionActionRequestIdRef.current;
        let clicked: TerminalContextMenuAction | null;
        try {
          clicked = await localApi.contextMenu.show(
            terminalContextMenuItems({
              hasSelection: selectionAction !== null,
              canAddToChat: canAddSelectionToChat(),
              readOnly: !hasTerminalWriteAccess(),
            }),
            { x: event.clientX, y: event.clientY },
          );
        } catch (error) {
          reportIfCurrent(requestId, error, "Unable to open the terminal context menu");
          focusIfCurrent(requestId);
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
          return;
        case "copy":
          try {
            await writeTextToClipboard(nextAction.clipboardText, "terminal selection");
          } catch (error) {
            if (requestId !== selectionActionRequestIdRef.current) {
              return;
            }
<<<<<<< HEAD
            const activeTerminal = terminalRef.current;
            if (activeTerminal) {
              writeSystemMessage(
                activeTerminal,
                error instanceof Error ? error.message : "Unable to copy terminal selection",
              );
=======
            return;
          case "copy":
            if (selectionAction) await copySelection(selectionAction.clipboardText, requestId);
            return;
          case "paste":
            await pasteFromClipboard(requestId);
            return;
          case "select-all":
            terminalRef.current?.selectAll();
            focusIfCurrent(requestId);
            return;
          case "scroll-to-bottom":
            terminalRef.current?.scrollToBottom();
            focusIfCurrent(requestId);
            return;
        }
      };

      const showSelectionAction = async (pointer: SelectionActionPoint | null) => {
        if (!localApi) {
          clearSelectionAction();
          return;
        }
        if (openSelectionMenuRequestIdRef.current === selectionActionRequestIdRef.current) {
          return;
        }
        const nextAction = readSelectionAction(pointer);
        if (!nextAction) {
          clearSelectionAction();
          return;
        }
        const requestId = ++selectionActionRequestIdRef.current;
        openSelectionMenuRequestIdRef.current = requestId;
        const clicked = await localApi.contextMenu
          .show(
            terminalSelectionMenuItems({ canAddToChat: canAddSelectionToChat() }),
            nextAction.position,
          )
          .finally(() => {
            if (openSelectionMenuRequestIdRef.current === requestId) {
              openSelectionMenuRequestIdRef.current = null;
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
            }
          }
          if (requestId === selectionActionRequestIdRef.current) {
            terminalRef.current?.focus();
          }
          return;
      }
    };

<<<<<<< HEAD
    const sendTerminalInput = async (data: string, fallbackError: string) => {
      const activeTerminal = terminalRef.current;
      if (!activeTerminal) return;
      const result = await writeTerminal(data);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        writeSystemMessage(activeTerminal, error instanceof Error ? error.message : fallbackError);
      }
    };

    terminal.attachCustomKeyEventHandler((event) => {
      const currentKeybindings = keybindingsRef.current;
      const options = { context: { terminalFocus: true, terminalOpen: true } };
=======
      const sendTerminalInput = async (data: string, fallbackError: string) => {
        if (!hasTerminalWriteAccess()) return;
        const activeTerminal = terminalRef.current;
        if (!activeTerminal) return;
        const result = await writeTerminal(data);
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          writeSystemMessage(
            activeTerminal,
            error instanceof Error ? error.message : fallbackError,
          );
        }
      };

      function handleBeforeKey(event: KeyboardEvent): boolean {
        const currentKeybindings = readKeybindings();
        const options = { context: { terminalFocus: true, terminalOpen: true } };
        if (preventTerminalCloseShortcut(event, currentKeybindings)) {
          return false;
        }
        if (
          isTerminalToggleShortcut(event, currentKeybindings, options) ||
          isTerminalSplitShortcut(event, currentKeybindings, options) ||
          isTerminalSplitVerticalShortcut(event, currentKeybindings, options) ||
          isTerminalNewShortcut(event, currentKeybindings, options) ||
          isDiffToggleShortcut(event, currentKeybindings, options)
        ) {
          return false;
        }
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7

      // Must preventDefault or Chrome's own find bar opens over the panel.
      if (isTerminalFindShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        requestSearch();
        return false;
      }

<<<<<<< HEAD
      if (
        isTerminalToggleShortcut(event, currentKeybindings, options) ||
        isTerminalSplitShortcut(event, currentKeybindings, options) ||
        isTerminalSplitVerticalShortcut(event, currentKeybindings, options) ||
        isTerminalNewShortcut(event, currentKeybindings, options) ||
        isTerminalCloseShortcut(event, currentKeybindings, options) ||
        isDiffToggleShortcut(event, currentKeybindings, options)
      ) {
        return false;
      }

      const navigationData = terminalNavigationShortcutData(event);
      if (navigationData !== null) {
        event.preventDefault();
        event.stopPropagation();
        void sendTerminalInput(navigationData, "Failed to move cursor");
        return false;
=======
      function handleLinkActivate(text: string, event: MouseEvent): void {
        if (!canActivateTerminalLink(text)) return;
        const latestTerminal = terminalRef.current;
        if (!latestTerminal) return;
        if (isTerminalUrl(text)) {
          if (!localApi) {
            writeSystemMessage(latestTerminal, "Opening links is unavailable in this browser.");
            return;
          }
          const fallbackToBrowser = () => {
            void localApi.shell.openExternal(text).catch((error: unknown) => {
              writeSystemMessage(
                latestTerminal,
                error instanceof Error ? error.message : "Unable to open link",
              );
            });
          };
          if (!readEnvironmentScope(environmentId, AuthPreviewOperateScope)) {
            fallbackToBrowser();
            return;
          }
          void openLinkInPreview(text, event.metaKey || event.ctrlKey, fallbackToBrowser).catch(
            (error: unknown) => {
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Unable to open link",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
            },
          );
          return;
        }
        const target = resolvePathLinkTarget(text, cwd);
        void (async () => {
          const result = await openTerminalPath(target);
          if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
            return;
          }
          const error = squashAtomCommandFailure(result);
          writeSystemMessage(
            latestTerminal,
            error instanceof Error ? error.message : "Unable to open path",
          );
        })();
      }

      function handleData(data: string): void {
        if (!hasTerminalWriteAccess()) return;
        void (async () => {
          const result = await writeTerminal(data);
          if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
          const error = squashAtomCommandFailure(result);
          writeSystemMessage(
            terminal,
            error instanceof Error ? error.message : "Terminal write failed",
          );
        })();
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
      }

      const deleteData = terminalDeleteShortcutData(event);
      if (deleteData !== null) {
        event.preventDefault();
        event.stopPropagation();
        void sendTerminalInput(deleteData, "Failed to delete terminal input");
        return false;
      }

      if (!isTerminalClearShortcut(event)) return true;
      event.preventDefault();
      event.stopPropagation();
      void sendTerminalInput("\u000c", "Failed to clear terminal");
      return false;
    });

    const terminalLinksDisposable = terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const activeTerminal = terminalRef.current;
        if (!activeTerminal) {
          callback(undefined);
          return;
        }

        const wrappedLine = collectWrappedTerminalLinkLine(bufferLineNumber, (bufferLineIndex) =>
          activeTerminal.buffer.active.getLine(bufferLineIndex),
        );
        if (!wrappedLine) {
          callback(undefined);
          return;
        }

        const links = extractTerminalLinks(wrappedLine.text)
          .map((match) => ({
            match,
            range: resolveWrappedTerminalLinkRange(wrappedLine, match),
          }))
          .filter(({ range }) =>
            wrappedTerminalLinkRangeIntersectsBufferLine(range, bufferLineNumber),
          );
        if (links.length === 0) {
          callback(undefined);
          return;
        }

        callback(
          links.map(({ match, range }) => ({
            text: match.text,
            range,
            activate: (event: MouseEvent) => {
              if (!isTerminalLinkActivation(event)) return;

              const latestTerminal = terminalRef.current;
              if (!latestTerminal) return;

              if (match.kind === "url") {
                if (!localApi) {
                  writeSystemMessage(
                    latestTerminal,
                    "Opening links is unavailable in this browser.",
                  );
                  return;
                }
                const fallbackToBrowser = () => {
                  void localApi.shell.openExternal(match.text).catch((error: unknown) => {
                    writeSystemMessage(
                      latestTerminal,
                      error instanceof Error ? error.message : "Unable to open link",
                    );
                  });
                };
                void openTerminalLinkInPreview({
                  url: match.text,
                  threadRef,
                  openPreview,
                  fallbackToBrowser,
                  // Upstream added an explicit escape to the system browser.
                  forceBrowser: event.metaKey || event.ctrlKey,
                });
                return;
              }

              const target = resolvePathLinkTarget(match.text, cwd);
              void (async () => {
                const result = await openTerminalPath(target);
                if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
                  return;
                }
                const error = squashAtomCommandFailure(result);
                writeSystemMessage(
                  latestTerminal,
                  error instanceof Error ? error.message : "Unable to open path",
                );
              })();
            },
          })),
        );
      },
    });

    const inputDisposable = terminal.onData((data) => {
      void (async () => {
        const result = await writeTerminal(data);
        if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
          return;
        }
        const error = squashAtomCommandFailure(result);
        writeSystemMessage(
          terminal,
          error instanceof Error ? error.message : "Terminal write failed",
        );
      })();
    });

    const selectionDisposable = terminal.onSelectionChange(() => {
      if (terminalRef.current?.hasSelection()) {
        return;
      }
      clearSelectionAction();
    });

    const handleMouseUp = (event: MouseEvent) => {
      const shouldHandle = shouldHandleTerminalSelectionMouseUp(
        selectionGestureActiveRef.current,
        event.button,
      );
      selectionGestureActiveRef.current = false;
      if (!shouldHandle) {
        return;
      }
      selectionPointerRef.current = { x: event.clientX, y: event.clientY };
      const delay = terminalSelectionActionDelayForClickCount(event.detail);
      selectionActionTimerRef.current = window.setTimeout(() => {
        selectionActionTimerRef.current = null;
        window.requestAnimationFrame(() => {
          void showSelectionAction();
        });
      }, delay);
    };
    const handlePointerDown = (event: PointerEvent) => {
      clearSelectionAction();
      selectionGestureActiveRef.current = event.button === 0;
    };
    window.addEventListener("mouseup", handleMouseUp);
    mount.addEventListener("pointerdown", handlePointerDown);

<<<<<<< HEAD
    const themeObserver = new MutationObserver(() => {
      const activeTerminal = terminalRef.current;
      if (!activeTerminal) return;
      activeTerminal.options.theme = terminalThemeFromApp(containerRef.current);
      activeTerminal.refresh(0, activeTerminal.rows - 1);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const fitTimer = window.setTimeout(() => {
      const activeTerminal = terminalRef.current;
      const activeFitAddon = fitAddonRef.current;
      if (!activeTerminal || !activeFitAddon) return;
      const wasAtBottom =
        activeTerminal.buffer.active.viewportY >= activeTerminal.buffer.active.baseY;
      fitTerminalSafely(activeFitAddon);
      if (wasAtBottom) {
        activeTerminal.scrollToBottom();
      }
      void resizeTerminal(activeTerminal.cols, activeTerminal.rows);
    }, 30);

    return () => {
      window.clearTimeout(fitTimer);
      inputDisposable.dispose();
      selectionDisposable.dispose();
      terminalLinksDisposable.dispose();
      searchResultsDisposable.dispose();
      if (selectionActionTimerRef.current !== null) {
        window.clearTimeout(selectionActionTimerRef.current);
      }
      window.removeEventListener("mouseup", handleMouseUp);
      mount.removeEventListener("pointerdown", handlePointerDown);
      themeObserver.disconnect();
      // Sessions persist across mounts, so an addon left loaded per mount is a
      // real leak — retract the handle and dispose both addons explicitly.
      publishSearchController(null);
      searchResultsListenerRef.current = null;
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      searchAddon.dispose();
      fitAddon.dispose();
      terminal.dispose();
    };
    // autoFocus is intentionally omitted;
    // it is only read at mount time and must not trigger terminal teardown/recreation.
  }, [cwd, environmentId, runtimeEnvKey, terminalId, threadId, worktreePath]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const current = {
      buffer: terminalBuffer,
      error: terminalError,
      status: terminalStatus,
      version: terminalVersion,
    };
    if (!terminal) {
      previousSessionRef.current = current;
      return;
    }

    const previous = previousSessionRef.current;
    if (current.version === previous.version) {
      return;
    }

    if (
      current.buffer.length >= previous.buffer.length &&
      current.buffer.startsWith(previous.buffer)
    ) {
      terminal.write(current.buffer.slice(previous.buffer.length));
    } else {
      writeTerminalBuffer(terminal, current.buffer);
    }
    terminal.clearSelection();

    if (current.error !== null && current.error !== previous.error) {
      writeSystemMessage(terminal, current.error);
    }

    if (current.status === "running") {
      hasHandledExitRef.current = false;
    } else if (
      (current.status === "closed" || current.status === "exited") &&
      current.status !== previous.status &&
      !hasHandledExitRef.current
    ) {
      hasHandledExitRef.current = true;
      writeSystemMessage(
        terminal,
        current.status === "closed" ? "Terminal closed" : "Process exited",
      );
      window.setTimeout(() => {
        if (hasHandledExitRef.current) {
          handleSessionExited();
        }
      }, 0);
    }

    if (previous.version === 0 && autoFocus) {
      window.requestAnimationFrame(() => {
        terminal.focus();
      });
    }
    previousSessionRef.current = current;
  }, [autoFocus, terminalBuffer, terminalError, terminalStatus, terminalVersion]);

  useEffect(() => {
    if (!autoFocus) return;
    const terminal = terminalRef.current;
    if (!terminal) return;
    const frame = window.requestAnimationFrame(() => {
      terminal.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [autoFocus, focusRequestId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;
    const wasAtBottom = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY;
    const frame = window.requestAnimationFrame(() => {
      fitTerminalSafely(fitAddon);
      if (wasAtBottom) {
        terminal.scrollToBottom();
      }
      void resizeTerminal(terminal.cols, terminal.rows);
=======
    void setup()
      .then((nextTeardown) => {
        if (cancelled) {
          nextTeardown?.();
          return;
        }
        teardown = nextTeardown;
      })
      .catch((error: unknown) => {
        for (const cleanup of setupCleanups.toReversed()) cleanup();
        setupCleanups = [];
        if (terminalRef.current === setupTerminal) terminalRef.current = null;
        setupTerminal?.dispose();
        setupTerminal = null;
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Unable to initialize libghostty-vt";
        mount.textContent = `${message}. Close and reopen the terminal to retry.`;
      });

    return () => {
      cancelled = true;
      const hadFocus = mount.contains(document.activeElement);
      teardown?.();
      if (hasTerminalWriteAccess() && hadFocus && mount.isConnected) {
        mount.focus({ preventScroll: true });
      }
    };
  }, [cwd, environmentId, terminalId]);

  const attachContainer = (mount: HTMLDivElement) => {
    containerRef.current = mount;
    const focus = () =>
      focusTerminalViewport({
        mount,
        surface: terminalRef.current,
        canOperate: readEnvironmentScope(environmentId, AuthTerminalOperateScope),
        visible: visibleRef.current,
      });
    // Once per viewport: a re-attached ref (a fresh callback identity) must not
    // pull focus back on every render of a chatty terminal. As a request, it
    // waits for the grant or for the viewport to show when it cannot focus yet.
    if (autoFocus && !autoFocusedRef.current) {
      autoFocusedRef.current = true;
      focusTerminal(threadRef, terminalId);
    }
    const unregister = registerTerminalFocusTarget({
      threadRef,
      terminalId,
      focus,
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
    });
    return () => {
      unregister();
      containerRef.current = null;
    };
  };
  return (
    <div
      ref={attachContainer}
      tabIndex={-1}
      // p-2 keeps the xterm rows off the panel edge; FitAddon measures this element,
      // so the padding correctly shrinks the usable grid instead of clipping it.
      className="relative h-full w-full overflow-hidden rounded-[4px] bg-background p-2"
    />
  );
}

interface ThreadTerminalDrawerProps {
  mode?: "drawer" | "panel" | "floating";
  threadRef: ScopedThreadRef;
  threadId: ThreadId;
  cwd: string;
  worktreePath?: string | null;
  runtimeEnv?: Record<string, string>;
  visible?: boolean;
  height: number;
  /** Space the chat column keeps for the composer overlay; only read in drawer mode. */
  composerHeight?: number;
  terminalIds: string[];
  activeTerminalId: string;
  terminalGroups: ThreadTerminalGroup[];
  activeTerminalGroupId: string;
  onSplitTerminal: () => void;
  onSplitTerminalVertical: () => void;
  onNewTerminal: () => void;
  splitShortcutLabel?: string | undefined;
  splitVerticalShortcutLabel?: string | undefined;
  newShortcutLabel?: string | undefined;
  closeShortcutLabel?: string | undefined;
  onActiveTerminalChange: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  onHeightChange: (height: number) => void;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  keybindings: ResolvedKeybindingsConfig;
  terminalLabelsById?: ReadonlyMap<string, string>;
  terminalLaunchLocationsById?: ReadonlyMap<string, TerminalLaunchLocation>;
}

/**
 * Placement controls — bottom / right / float.
 *
 * Rendered in BOTH terminal chromes (the session sidebar and the no-sidebar
 * action cluster). Living in only one of them stranded the user: the right
 * panel renders the cluster, so docking right hid the only way back out.
 *
 * The option matching the current placement is NOT rendered. It used to render
 * as a live button whose onClick set the placement it already had — a dead
 * control that read as a choice. The user can already see where the terminal
 * is, so there is nothing left for an "active" state to tell them. Two buttons
 * always render, so the row width is constant and nothing shifts on change.
 */
interface TerminalPlacementOption {
  readonly value: TerminalPlacement;
  readonly label: string;
  readonly Icon: (props: { className?: string }) => ReactNode;
}

const TERMINAL_PLACEMENT_OPTIONS: ReadonlyArray<TerminalPlacementOption> = [
  { value: "bottom", label: "Dock Terminal to Bottom", Icon: SidebarBottomFilled },
  { value: "right", label: "Dock Terminal to Right", Icon: SidebarRightFilled },
  { value: "floating", label: "Float Terminal", Icon: FullFilled },
];

/** Every rendered placement button must actually move the terminal. */
export function visibleTerminalPlacementOptions(
  placement: TerminalPlacement,
): ReadonlyArray<TerminalPlacementOption> {
  return TERMINAL_PLACEMENT_OPTIONS.filter((option) => option.value !== placement);
}

function TerminalPlacementControls({
  placement,
  onChange,
  size = "sm",
}: {
  placement: TerminalPlacement;
  onChange: (next: TerminalPlacement) => void;
  size?: ChromeSize;
}) {
  const iconClass = CHROME_ICON_CLASS[size];
  return (
    <>
      {visibleTerminalPlacementOptions(placement).map((option) => (
        <TerminalActionButton
          key={option.value}
          className={terminalChromeButtonClass(size)}
          label={option.label}
          onClick={() => onChange(option.value)}
        >
          <option.Icon className={iconClass} />
        </TerminalActionButton>
      ))}
    </>
  );
}

/**
 * Placement, routed to whichever chrome owns it.
 *
 * Floating has a titlebar, and dock/float belongs there with maximize and close
 * — it is window chrome, not a terminal action, and that row already carries the
 * pill's round 32px treatment instead of this cluster's denser scale. Docked
 * has no titlebar, so the cluster keeps them.
 *
 * Portaled rather than lifted: the placement setter does real store handoff
 * (opening/closing the right-panel surface, setting terminalOpen), so it stays
 * here and only the rendered buttons move.
 */
function TerminalPlacementSlot({
  placement,
  onChange,
  size = "sm",
}: {
  placement: TerminalPlacement;
  onChange: (next: TerminalPlacement) => void;
  size?: ChromeSize;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const floating = placement === "floating";
  useEffect(() => {
    if (!floating) {
      setSlot(null);
      return;
    }
    // The shell renders its titlebar before children, so the slot exists by the
    // time this runs — but the panel also unmounts on close, so re-read rather
    // than caching a node that can go stale.
    setSlot(document.querySelector<HTMLElement>("[data-terminal-titlebar-slot]"));
  }, [floating]);

  const controls = (
    <TerminalPlacementControls
      placement={placement}
      onChange={onChange}
      size={floating ? "titlebar" : size}
    />
  );
  if (!floating) return controls;
  return slot ? createPortal(controls, slot) : null;
}

interface TerminalActionButtonProps {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
<<<<<<< HEAD
  /**
   * Soft-disabled: `aria-disabled`, not `disabled`. A real `disabled` button
   * stops firing pointer events in the trigger, which kills the tooltip that
   * carries the *reason* — a silently dead button is exactly the bug.
   */
  disabled?: boolean;
  pressed?: boolean;
=======
  disabled?: boolean;
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
}

function TerminalActionButton({
  label,
  className,
  onClick,
  children,
<<<<<<< HEAD
  disabled = false,
  pressed,
=======
  disabled,
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
}: TerminalActionButtonProps) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
<<<<<<< HEAD
            className={className}
            onClick={disabled ? undefined : onClick}
            aria-label={label}
            aria-disabled={disabled ? true : undefined}
            {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
=======
            className={cn(className, disabled && "opacity-64 cursor-not-allowed")}
            onClick={disabled ? undefined : onClick}
            aria-label={label}
            aria-disabled={disabled}
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
          />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverPopup
        tooltipStyle
        side="bottom"
        sideOffset={6}
        align="center"
        className="pointer-events-none select-none"
      >
        {label}
      </PopoverPopup>
    </Popover>
  );
}

<<<<<<< HEAD
/**
 * The action set shared by both terminal chromes.
 *
 * It exists as one component on purpose: split/new/find/close previously lived
 * inline in the sidebar header AND in the no-sidebar cluster, and every fix
 * landed in one copy. Chrome-specific styling is a parameter; *which controls
 * exist, with which icon and label*, is not.
 */
interface TerminalChromeActionsProps {
  size: ChromeSize;
  splitLabel: string;
  splitVerticalLabel: string;
  newLabel: string;
  closeLabel: string;
  findLabel: string;
  findOpen: boolean;
  splitDisabled: boolean;
  /** The sidebar chrome gives every session row its own close, so it omits this. */
  showClose: boolean;
  onSplit: () => void;
  onSplitVertical: () => void;
  onNew: () => void;
  onClose: () => void;
  onToggleFind: () => void;
}

function TerminalChromeActions({
  size,
  splitLabel,
  splitVerticalLabel,
  newLabel,
  closeLabel,
  findLabel,
  findOpen,
  splitDisabled,
  showClose,
  onSplit,
  onSplitVertical,
  onNew,
  onClose,
  onToggleFind,
}: TerminalChromeActionsProps) {
  const iconClass = CHROME_ICON_CLASS[size];
  const actions: ReadonlyArray<{
    key: string;
    label: string;
    disabled: boolean;
    pressed?: boolean;
    onClick: () => void;
    icon: ReactNode;
  }> = [
    {
      key: "split",
      label: splitLabel,
      disabled: splitDisabled,
      onClick: onSplit,
      icon: <RowHorizontalFilled className={iconClass} />,
    },
    {
      key: "split-vertical",
      label: splitVerticalLabel,
      disabled: splitDisabled,
      onClick: onSplitVertical,
      icon: <RowVerticalFilled className={iconClass} />,
    },
    {
      key: "find",
      label: findLabel,
      disabled: false,
      pressed: findOpen,
      onClick: onToggleFind,
      icon: <SearchNormal1Filled className={iconClass} />,
    },
    {
      key: "new",
      label: newLabel,
      disabled: false,
      onClick: onNew,
      icon: <AddSquareFilled className={iconClass} />,
    },
    ...(showClose
      ? [
          {
            key: "close",
            label: closeLabel,
            disabled: false,
            onClick: onClose,
            icon: <CloseSquareFilled className={iconClass} />,
          },
        ]
      : []),
  ];
  return (
    <>
      {/* No 1px rules between these: round pills separate by spacing, and the
          rules were the last thing making this row read as a bordered toolbar
          instead of part of the pill surface. */}
      {actions.map((action) => (
        <Fragment key={action.key}>
          <TerminalActionButton
            className={terminalChromeButtonClass(size, {
              active: action.key === "find" && findOpen,
              disabled: action.disabled,
            })}
            label={action.label}
            disabled={action.disabled}
            {...(action.pressed === undefined ? {} : { pressed: action.pressed })}
            onClick={action.onClick}
          >
            {action.icon}
          </TerminalActionButton>
        </Fragment>
      ))}
    </>
  );
}

/**
 * Find bar — one instance per drawer, driving whichever terminal is active.
 *
 * Anchored top-right in both chromes; in the no-sidebar chrome it sits below
 * the floating action cluster so the two never overlap.
 */
function TerminalFindBar({
  open,
  size,
  activeTerminalId,
  controllersRef,
  onClose,
}: {
  open: boolean;
  size: ChromeSize;
  activeTerminalId: string;
  controllersRef: RefObject<TerminalSearchControllerMap>;
  onClose: () => void;
}) {
  const iconClass = CHROME_ICON_CLASS[size];
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<TerminalSearchResults>({
    resultIndex: -1,
    resultCount: 0,
  });

  const controllerFor = useCallback(
    (terminalId: string) => controllersRef.current?.get(terminalId) ?? null,
    [controllersRef],
  );

  // Subscribe to the active terminal only, and always hand the previous one
  // back its null listener — otherwise a closed session keeps pushing counts.
  useEffect(() => {
    if (!open) return;
    const controller = controllerFor(activeTerminalId);
    if (!controller) return;
    controller.setResultsListener(setResults);
    return () => {
      controller.setResultsListener(null);
    };
  }, [activeTerminalId, controllerFor, open]);

  // The toolbar toggle is a popover trigger, and the popup claims focus a tick
  // after the click — a single rAF focus loses the race and the user types into
  // nothing. Retry briefly until the input actually holds focus.
  useEffect(() => {
    if (!open) return;
    let attempts = 0;
    const claimFocus = () => {
      const input = inputRef.current;
      if (!input) return;
      if (document.activeElement !== input) {
        input.focus();
        input.select();
      }
      attempts += 1;
      if (attempts < 5 && document.activeElement !== input) {
        timer = window.setTimeout(claimFocus, 40);
      }
    };
    let timer = window.setTimeout(claimFocus, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Live search as the query/case changes, so the highlight tracks typing.
  const lastCaseSensitiveRef = useRef(caseSensitive);
  useEffect(() => {
    if (!open) return;
    const controller = controllerFor(activeTerminalId);
    if (!controller) return;
    if (query.length === 0) {
      controller.clear();
      lastCaseSensitiveRef.current = caseSensitive;
      setResults({ resultIndex: -1, resultCount: 0 });
      return;
    }
    // The addon caches highlights keyed on the term alone, so toggling case
    // with the same term reuses the stale match set and reports a wrong count.
    if (lastCaseSensitiveRef.current !== caseSensitive) {
      controller.clear();
      lastCaseSensitiveRef.current = caseSensitive;
    }
    controller.findNext(query, caseSensitive, true);
  }, [activeTerminalId, caseSensitive, controllerFor, open, query]);

  const closeFind = useCallback(
    (returnFocus: boolean) => {
      const controller = controllerFor(activeTerminalId);
      controller?.setResultsListener(null);
      controller?.clear();
      setResults({ resultIndex: -1, resultCount: 0 });
      onClose();
      if (returnFocus) controller?.focusTerminal();
    },
    [activeTerminalId, controllerFor, onClose],
  );

  // Closing from the toolbar toggle must still clear decorations.
  useEffect(() => {
    if (open) return;
    controllerFor(activeTerminalId)?.clear();
    setResults({ resultIndex: -1, resultCount: 0 });
  }, [activeTerminalId, controllerFor, open]);

  const step = useCallback(
    (direction: "next" | "previous") => {
      if (query.length === 0) return;
      const controller = controllerFor(activeTerminalId);
      if (!controller) return;
      if (direction === "next") controller.findNext(query, caseSensitive, false);
      else controller.findPrevious(query, caseSensitive);
    },
    [activeTerminalId, caseSensitive, controllerFor, query],
  );

  if (!open) return null;

  const hasQuery = query.length > 0;
  const hasMatches = results.resultCount > 0;
  const stepDisabled = !hasQuery || !hasMatches;
  // A disabled control always states why, or it reads as a broken button.
  const stepSuffix = !hasQuery ? " (Type to Search)" : hasMatches ? "" : " (No Matches)";
  const countLabel = !hasQuery
    ? ""
    : hasMatches
      ? `${Math.max(results.resultIndex + 1, 1)}/${results.resultCount}`
      : "0/0";

  return (
    <div
      data-terminal-find-bar=""
      className={cn("pointer-events-none absolute right-2 z-30", size === "sm" ? "top-2" : "top-9")}
    >
      <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-border/80 bg-background/95 p-0.5 pl-2.5 shadow-sm backdrop-blur">
        <input
          ref={inputRef}
          type="text"
          value={query}
          spellCheck={false}
          autoComplete="off"
          aria-label="Find in Terminal"
          placeholder="Find"
          className="h-5 w-36 border-0 bg-transparent p-0 text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeFind(true);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              step(event.shiftKey ? "previous" : "next");
              return;
            }
            // A second Cmd+F re-selects instead of falling through to Chrome.
            if (isTerminalFindShortcut(event.nativeEvent)) {
              event.preventDefault();
              event.stopPropagation();
              inputRef.current?.select();
            }
          }}
        />
        <span
          className="min-w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {countLabel}
        </span>
        <TerminalActionButton
          className={cn(
            terminalChromeButtonClass(size, { active: caseSensitive }),
            "text-[10px] font-semibold leading-none",
          )}
          label="Match Case"
          pressed={caseSensitive}
          onClick={() => setCaseSensitive((value) => !value)}
        >
          Aa
        </TerminalActionButton>
        <TerminalActionButton
          className={terminalChromeButtonClass(size, { disabled: stepDisabled })}
          label={`Previous Match${stepSuffix}`}
          disabled={stepDisabled}
          onClick={() => step("previous")}
        >
          <ArrowUp1Filled className={iconClass} />
        </TerminalActionButton>
        <TerminalActionButton
          className={terminalChromeButtonClass(size, { disabled: stepDisabled })}
          label={`Next Match${stepSuffix}`}
          disabled={stepDisabled}
          onClick={() => step("next")}
        >
          <ArrowDownFilled className={iconClass} />
        </TerminalActionButton>
=======
function TerminalSplitPanes({
  terminalIds,
  splitDirection,
  activeTerminalId,
  terminalLabelById,
  resolveLaunchLocation,
  onActiveTerminalChange,
  onCloseTerminal,
  advancedTypography,
  threadRef,
  threadId,
  onAddTerminalContext,
  visible,
  keybindings,
}: {
  terminalIds: readonly string[];
  splitDirection: "horizontal" | "vertical";
  activeTerminalId: string;
  terminalLabelById: ReadonlyMap<string, string>;
  resolveLaunchLocation: (terminalId: string) => TerminalLaunchLocation;
  onActiveTerminalChange: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  advancedTypography: boolean;
  threadRef: ScopedThreadRef;
  threadId: ThreadId;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  visible: boolean;
  keybindings: ResolvedKeybindingsConfig;
}) {
  return (
    <div
      className="grid h-full w-full min-w-0 gap-0 overflow-hidden"
      style={
        splitDirection === "vertical"
          ? {
              gridTemplateRows: `repeat(${terminalIds.length}, minmax(0, 1fr))`,
            }
          : {
              gridTemplateColumns: `repeat(${terminalIds.length}, minmax(0, 1fr))`,
            }
      }
    >
      {terminalIds.map((terminalId) => {
        const terminalLaunchLocation = resolveLaunchLocation(terminalId);
        return (
          <div
            key={terminalId}
            className={`min-h-0 min-w-0 ${
              splitDirection === "vertical"
                ? "border-t first:border-t-0"
                : "border-l first:border-l-0"
            } ${terminalId === activeTerminalId ? "border-border" : "border-border/70"}`}
            onPointerDown={() => {
              if (terminalId !== activeTerminalId) {
                onActiveTerminalChange(terminalId);
              }
            }}
          >
            <div className="h-full">
              <TerminalViewport
                advancedTypography={advancedTypography}
                threadRef={threadRef}
                threadId={threadId}
                terminalId={terminalId}
                terminalLabel={terminalLabelById.get(terminalId) ?? "Terminal"}
                cwd={terminalLaunchLocation.cwd}
                {...(terminalLaunchLocation.worktreePath !== undefined
                  ? { worktreePath: terminalLaunchLocation.worktreePath }
                  : {})}
                {...(terminalLaunchLocation.runtimeEnv
                  ? { runtimeEnv: terminalLaunchLocation.runtimeEnv }
                  : {})}
                onSessionExited={() => onCloseTerminal(terminalId)}
                onAddTerminalContext={onAddTerminalContext}
                visible={visible}
                keybindings={keybindings}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TerminalSidebarGroup({
  terminalGroup,
  activeTerminalId,
  showHeader,
  terminalLabelById,
  closeShortcutLabel,
  canOperateTerminal,
  onActiveTerminalChange,
  onCloseTerminal,
}: {
  terminalGroup: ThreadTerminalGroup;
  activeTerminalId: string;
  showHeader: boolean;
  terminalLabelById: ReadonlyMap<string, string>;
  closeShortcutLabel: string | undefined;
  canOperateTerminal: boolean;
  onActiveTerminalChange: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
}) {
  const isGroupActive = terminalGroup.terminalIds.includes(activeTerminalId);
  const groupActiveTerminalId = isGroupActive
    ? activeTerminalId
    : (terminalGroup.terminalIds[0] ?? activeTerminalId);
  const terminalCount = terminalGroup.terminalIds.length;
  const isSplitGroup = terminalCount > 1;
  const groupLabel = !isSplitGroup
    ? "Single"
    : terminalGroup.splitDirection === "vertical"
      ? "Stacked"
      : "Side by side";
  const GroupIcon = !isSplitGroup
    ? Square
    : terminalGroup.splitDirection === "vertical"
      ? SquareSplitVertical
      : SquareSplitHorizontal;

  return (
    <div className="pb-0.5">
      {showHeader && (
        <button
          type="button"
          className={`flex h-[22px] w-full cursor-pointer items-center gap-1 rounded px-1.5 text-2xs ${
            isGroupActive
              ? "bg-accent/50 text-foreground"
              : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
          }`}
          onClick={() => onActiveTerminalChange(groupActiveTerminalId)}
        >
          <GroupIcon className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{groupLabel}</span>
          <span className="text-muted-foreground/70 text-3xs tabular-nums">{terminalCount}</span>
        </button>
      )}

      <div className="flex flex-col gap-0.5">
        {terminalGroup.terminalIds.map((terminalId) => {
          const isActive = terminalId === activeTerminalId;
          const terminalLabel = terminalLabelById.get(terminalId) ?? "Terminal";
          const closeTerminalLabel = `Close ${terminalLabel}${
            isActive && closeShortcutLabel ? ` (${closeShortcutLabel})` : ""
          }`;
          return (
            <div
              key={terminalId}
              className={cn(
                "group/tab flex h-6 w-full items-center gap-0.5 rounded-md pr-2 pl-1.5 text-xs",
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {canOperateTerminal ? (
                <PanelTabCloseButton
                  label={closeTerminalLabel}
                  onClick={() => onCloseTerminal(terminalId)}
                  tooltip={closeTerminalLabel}
                >
                  <TerminalSquare className="size-3 shrink-0" />
                </PanelTabCloseButton>
              ) : (
                <TerminalSquare className="size-3 shrink-0" />
              )}
              <button
                type="button"
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
                onClick={() => onActiveTerminalChange(terminalId)}
              >
                <span className="truncate">{terminalLabel}</span>
              </button>
            </div>
          );
        })}
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
      </div>
    </div>
  );
}

export default function ThreadTerminalDrawer({
  mode = "drawer",
  threadRef,
  threadId,
  cwd,
  worktreePath,
  runtimeEnv,
  visible = true,
  height,
  composerHeight = 0,
  terminalIds,
  activeTerminalId,
  terminalGroups,
  activeTerminalGroupId,
  onSplitTerminal,
  onSplitTerminalVertical,
  onNewTerminal,
  splitShortcutLabel,
  splitVerticalShortcutLabel,
  newShortcutLabel,
  closeShortcutLabel,
  onActiveTerminalChange,
  onCloseTerminal,
  onHeightChange,
  onAddTerminalContext,
  keybindings,
  terminalLabelsById,
  terminalLaunchLocationsById,
}: ThreadTerminalDrawerProps) {
<<<<<<< HEAD
  // "floating" shares the panel layout (fill the container, no self-resize);
  // only the ownership attribute differs, so the store can tell them apart.
  const terminalPlacement = usePillNavPreferences((state) => state.prefs.terminalPlacement);
  const setTerminalPlacementPref = usePillNavPreferences((state) => state.setTerminalPlacement);
  const openRightPanelTerminalGroups = useRightPanelStore((state) => state.openTerminalGroups);
  const closeRightPanelSurface = useRightPanelStore((state) => state.closeSurface);
  // One place owns the terminal at a time. Moving it hands the surface over and
  // tears down the old host, or the same session renders in two places at once.
  const setTerminalPlacement = useCallback(
    (next: TerminalPlacement) => {
      const surfaces =
        useRightPanelStore.getState().byThreadKey[scopedThreadKey(threadRef)]?.surfaces ?? [];
      const terminalSurfaces = surfaces.filter((surface) => surface.kind === "terminal");
      if (next === "right") {
        // Every group, not just the active one — the panel shows a surface per tab,
        // so handing over a single id silently left the other sessions with no host.
        openRightPanelTerminalGroups(threadRef, terminalGroups, activeTerminalId);
      } else {
        for (const surface of terminalSurfaces) closeRightPanelSurface(threadRef, surface.id);
        // The drawer/floating hosts are gated on terminalOpen. Coming back from
        // the right panel it is false, so without this the terminal just vanishes.
        useTerminalUiStateStore.getState().setTerminalOpen(threadRef, true);
      }
      setTerminalPlacementPref(next);
    },
    [
      activeTerminalId,
      closeRightPanelSurface,
      openRightPanelTerminalGroups,
      setTerminalPlacementPref,
      terminalGroups,
      threadRef,
    ],
  );
  const isPanel = mode === "panel" || mode === "floating";
  // Advanced typography splits the terminal font from the code font; the
  // viewport resolves the actual family/size from it (upstream feature).
=======
  const canOperateTerminal = useEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope);
  const isPanel = mode === "panel";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  const [advancedTypography] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
<<<<<<< HEAD
  const terminalOwner =
    mode === "floating" ? "floating" : mode === "panel" ? "right-panel" : "drawer";
  const controlledDrawerHeight = clampDrawerHeight(height);
  const [drawerHeightState, setDrawerHeightState] = useState(() => ({
    threadId,
    height: controlledDrawerHeight,
  }));
  const drawerHeight =
    drawerHeightState.threadId === threadId ? drawerHeightState.height : controlledDrawerHeight;
  const setDrawerHeight = useCallback(
    (update: SetStateAction<number>) => {
      setDrawerHeightState((current) => {
        const currentHeight =
          current.threadId === threadId ? current.height : controlledDrawerHeight;
        const nextHeight = typeof update === "function" ? update(currentHeight) : update;
        return nextHeight === currentHeight && current.threadId === threadId
          ? current
          : { threadId, height: nextHeight };
      });
    },
    [controlledDrawerHeight, threadId],
  );
  const setDrawerHeightFromWindowResize = useEffectEvent((nextHeight: number) => {
    setDrawerHeight(nextHeight);
  });
  const [resizeEpoch, setResizeEpoch] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const searchControllersRef = useRef<TerminalSearchControllerMap>(new Map());
  const handleSearchControllerChange = useCallback(
    (terminalId: string, controller: TerminalSearchController | null) => {
      if (controller) searchControllersRef.current.set(terminalId, controller);
      else searchControllersRef.current.delete(terminalId);
    },
    [],
  );
  const openFind = useCallback(() => setFindOpen(true), []);
  const toggleFind = useCallback(() => setFindOpen((value) => !value), []);
  const drawerHeightRef = useRef(drawerHeight);
  const lastSyncedHeightRef = useRef(controlledDrawerHeight);
  const onHeightChangeRef = useRef(onHeightChange);
=======
  const drawerRef = useRef<HTMLElement | null>(null);
  const [drawerLayout, setDrawerLayout] = useState(() => readDrawerLayout(null));
  const maxDrawerHeight = resolveTerminalDrawerMaxHeight({ ...drawerLayout, composerHeight });
  const drawerHeight = clampDrawerHeight(height, maxDrawerHeight);
  // A drag only writes the drawer's style; the store hears the height once, at
  // pointerup. The custom property outranks the rendered height while it is set.
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  const resizeStateRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    height: number;
    drawer: HTMLElement | null;
  } | null>(null);

  const normalizedTerminalIds = (() => {
    const normalizedIds: string[] = [];
    const seen = new Set<string>();
    for (const id of terminalIds) {
      const trimmedId = id.trim();
      if (trimmedId.length === 0 || seen.has(trimmedId)) continue;
      seen.add(trimmedId);
      normalizedIds.push(trimmedId);
    }
    return normalizedIds;
  })();
  const resolvedTerminalGroups = (() => {
    if (normalizedTerminalIds.length === 0) {
      return [];
    }
    const validTerminalIdSet = new Set(normalizedTerminalIds);
    const assignedTerminalIds = new Set<string>();
    const usedGroupIds = new Set<string>();
    const nextGroups: ThreadTerminalGroup[] = [];

    const assignUniqueGroupId = (groupId: string): string => {
      if (!usedGroupIds.has(groupId)) {
        usedGroupIds.add(groupId);
        return groupId;
      }
      let suffix = 2;
      while (usedGroupIds.has(`${groupId}-${suffix}`)) {
        suffix += 1;
      }
      const uniqueGroupId = `${groupId}-${suffix}`;
      usedGroupIds.add(uniqueGroupId);
      return uniqueGroupId;
    };

    for (const terminalGroup of terminalGroups) {
      const nextTerminalIds: string[] = [];
      const seenGroupTerminalIds = new Set<string>();
      for (const id of terminalGroup.terminalIds) {
        const terminalId = id.trim();
        if (terminalId.length === 0) continue;
        if (seenGroupTerminalIds.has(terminalId)) continue;
        seenGroupTerminalIds.add(terminalId);
        if (!validTerminalIdSet.has(terminalId)) continue;
        if (assignedTerminalIds.has(terminalId)) continue;
        nextTerminalIds.push(terminalId);
      }
      if (nextTerminalIds.length === 0) continue;

      for (const terminalId of nextTerminalIds) {
        assignedTerminalIds.add(terminalId);
      }

      const baseGroupId =
        terminalGroup.id.trim().length > 0
          ? terminalGroup.id.trim()
          : `group-${nextTerminalIds[0] ?? normalizedTerminalIds[0] ?? ""}`;
      nextGroups.push({
        id: assignUniqueGroupId(baseGroupId),
        terminalIds: nextTerminalIds,
        ...(terminalGroup.splitDirection === "vertical"
          ? { splitDirection: "vertical" as const }
          : {}),
      });
    }

    for (const terminalId of normalizedTerminalIds) {
      if (assignedTerminalIds.has(terminalId)) continue;
      nextGroups.push({
        id: assignUniqueGroupId(`group-${terminalId}`),
        terminalIds: [terminalId],
      });
    }

    const terminalOrderIndex = new Map(
      normalizedTerminalIds.map((id, index) => [id, index] as const),
    );
    nextGroups.sort((left, right) => {
      const rank = (ids: readonly string[]) =>
        Math.min(...ids.map((id) => terminalOrderIndex.get(id) ?? Number.POSITIVE_INFINITY));
      return rank(left.terminalIds) - rank(right.terminalIds);
    });

    return nextGroups;
  })();
  const groupIndexByTerminalId = (() => {
    const next = new Map<string, number>();
    for (const [index, terminalGroup] of resolvedTerminalGroups.entries()) {
      for (const terminalId of terminalGroup.terminalIds) next.set(terminalId, index);
    }
    return next;
  })();
  const terminalLabelById = (() => {
    const next = new Map<string, string>();
    for (const terminalId of normalizedTerminalIds) {
      next.set(terminalId, terminalLabelsById?.get(terminalId) ?? getTerminalLabel(terminalId));
    }
    return next;
  })();

  const resolvedActiveTerminalId =
    normalizedTerminalIds.length === 0
      ? ""
      : normalizedTerminalIds.includes(activeTerminalId)
        ? activeTerminalId
        : (normalizedTerminalIds[0] ?? "");

  const groupIndexById = resolvedTerminalGroups.findIndex(
    (terminalGroup) => terminalGroup.id === activeTerminalGroupId,
  );
  const resolvedActiveGroupIndex =
    groupIndexById >= 0
      ? groupIndexById
      : (groupIndexByTerminalId.get(resolvedActiveTerminalId) ?? 0);

  const visibleTerminalIds =
    resolvedTerminalGroups[resolvedActiveGroupIndex]?.terminalIds ??
    (normalizedTerminalIds.length > 0 ? [resolvedActiveTerminalId] : []);
  const splitDirection =
    resolvedTerminalGroups[resolvedActiveGroupIndex]?.splitDirection ?? "horizontal";
  const hasTerminalSidebar = normalizedTerminalIds.length > 1;
  const showGroupHeaders =
    resolvedTerminalGroups.length > 1 ||
    resolvedTerminalGroups.some((terminalGroup) => terminalGroup.terminalIds.length > 1);
  const hasReachedSplitLimit = visibleTerminalIds.length >= MAX_TERMINALS_PER_GROUP;
  const resolveTerminalLaunchLocation = (terminalId: string): TerminalLaunchLocation =>
    terminalLaunchLocationsById?.get(terminalId) ?? {
      cwd,
      ...(worktreePath !== undefined ? { worktreePath } : {}),
      ...(runtimeEnv ? { runtimeEnv } : {}),
    };
  const splitTerminalActionLabel = hasReachedSplitLimit
    ? `Split Terminal Horizontally (max ${MAX_TERMINALS_PER_GROUP} per group)`
    : splitShortcutLabel
      ? `Split Terminal Horizontally (${splitShortcutLabel})`
      : "Split Terminal Horizontally";
  const splitTerminalVerticalActionLabel = hasReachedSplitLimit
    ? `Split Terminal Vertically (max ${MAX_TERMINALS_PER_GROUP} per group)`
    : splitVerticalShortcutLabel
      ? `Split Terminal Vertically (${splitVerticalShortcutLabel})`
      : "Split Terminal Vertically";
  const newTerminalActionLabel = newShortcutLabel
    ? `New Terminal (${newShortcutLabel})`
    : "New Terminal";
  const closeTerminalActionLabel = closeShortcutLabel
    ? `Close Terminal (${closeShortcutLabel})`
    : "Close Terminal";
<<<<<<< HEAD
  const findTerminalActionLabel = findOpen
    ? "Hide Find"
    : `Find in Terminal (${terminalFindShortcutLabel()})`;
  const onSplitTerminalAction = useCallback(() => {
    if (hasReachedSplitLimit) return;
=======
  const onSplitTerminalAction = () => {
    if (!canOperateTerminal || hasReachedSplitLimit) return;
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
    onSplitTerminal();
  };
  const onSplitTerminalVerticalAction = () => {
    if (!canOperateTerminal || hasReachedSplitLimit) return;
    onSplitTerminalVertical();
  };
  const onNewTerminalAction = () => {
    if (!canOperateTerminal) return;
    onNewTerminal();
  };
  const confirmCloseTerminal = (terminalId: string) => {
    if (!canOperateTerminal) return;
    const label = terminalLabelById.get(terminalId) ?? getTerminalLabel(terminalId);
    void confirmTerminalClose([label]).then((confirmed) => {
      if (confirmed && readEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope)) {
        onCloseTerminal(terminalId);
      }
    });
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: drawerHeight,
      height: drawerHeight,
      drawer: event.currentTarget.parentElement,
    };
  };

  const handleResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    event.preventDefault();
    const clampedHeight = clampDrawerHeight(
      resizeState.startHeight + (resizeState.startY - event.clientY),
      maxDrawerHeight,
    );
    if (clampedHeight === resizeState.height) {
      return;
    }
    resizeState.height = clampedHeight;
    resizeState.drawer?.style.setProperty(DRAG_HEIGHT_PROPERTY, `${clampedHeight}px`);
  };

  const handleResizePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    resizeStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeState.drawer?.style.removeProperty(DRAG_HEIGHT_PROPERTY);
    // A drag that ends where it started keeps the stored preference, which may
    // be taller than the capped height the drag started from.
    if (resizeState.height === resizeState.startHeight || resizeState.height === height) return;
    onHeightChange(resizeState.height);
  };

  const drawerLayoutRef = useRef(drawerLayout);
  const updateDrawerLayout = useEffectEvent(
    (column: HTMLElement | null, source: "window" | "column") => {
      const layout = readDrawerLayout(column);
      const previous = drawerLayoutRef.current;
      const heightBudgetChanged =
        layout.viewportHeight !== previous.viewportHeight ||
        layout.chatColumnHeight !== previous.chatColumnHeight ||
        layout.headerHeight !== previous.headerHeight;
      // The column also reports width-only changes, such as every frame of a
      // right panel drag; the surface refits itself for those.
      if (!heightBudgetChanged && source === "column") return;
      drawerLayoutRef.current = layout;
      const resizeState = resizeStateRef.current;
      if (resizeState) {
        const liveHeight = clampDrawerHeight(
          resizeState.height,
          resolveTerminalDrawerMaxHeight({ ...layout, composerHeight }),
        );
        if (liveHeight !== resizeState.height) {
          resizeState.height = liveHeight;
          resizeState.drawer?.style.setProperty(DRAG_HEIGHT_PROPERTY, `${liveHeight}px`);
        }
      }
      if (heightBudgetChanged) setDrawerLayout(layout);
    },
  );
  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    // The column and window may have resized while the drawer was hidden and
    // not listening, so measure before the first visible paint.
    const column = isPanel ? null : chatColumnOf(drawerRef.current);
    const onWindowResize = () => updateDrawerLayout(column, "window");
    onWindowResize();
    const header = column?.querySelector<HTMLElement>("[data-chat-header]");
    const stopObserving = column
      ? observeResize(header ? [column, header] : column, () =>
          updateDrawerLayout(column, "column"),
        )
      : undefined;
    window.addEventListener("resize", onWindowResize);
    return () => {
      stopObserving?.();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [isPanel, visible]);

  if (normalizedTerminalIds.length === 0) {
    return (
      <aside
        ref={drawerRef}
        data-thread-terminal-drawer
        data-terminal-owner={terminalOwner}
        className={cn(
          "relative flex min-w-0 flex-col overflow-hidden bg-background",
          isPanel ? "h-full flex-1" : "z-45 shrink-0 border-t border-border/80",
        )}
        style={isPanel ? undefined : { height: `var(${DRAG_HEIGHT_PROPERTY}, ${drawerHeight}px)` }}
      >
        {!isPanel ? (
          <div
            className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerEnd}
            onPointerCancel={handleResizePointerEnd}
            onLostPointerCapture={handleResizePointerEnd}
          />
        ) : null}
        {/* Placement stays reachable with zero sessions. Without it, closing the
            last terminal in the right panel or the floating window stranded the
            surface with no way to dock it back. */}
        <div className="pointer-events-none absolute right-2 top-2 z-20">
          <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-border/80 bg-background/70 p-0.5">
            <TerminalPlacementSlot
              placement={terminalPlacement}
              onChange={setTerminalPlacement}
              size="md"
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center text-sm text-muted-foreground">
          <p>No terminal sessions for this thread yet.</p>
          <Button
            size="xs"
            variant="outline"
            onClick={onNewTerminalAction}
            disabled={!canOperateTerminal}
          >
            {newTerminalActionLabel}
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      ref={drawerRef}
      data-thread-terminal-drawer
      data-terminal-owner={terminalOwner}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden bg-background",
        isPanel ? "h-full flex-1" : "z-45 shrink-0 border-t border-border/80",
      )}
      style={isPanel ? undefined : { height: `var(${DRAG_HEIGHT_PROPERTY}, ${drawerHeight}px)` }}
    >
      {!isPanel ? (
        <div
          className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          onLostPointerCapture={handleResizePointerEnd}
        />
      ) : null}

      {!hasTerminalSidebar && (
        <div className="pointer-events-none absolute right-2 top-2 z-20">
<<<<<<< HEAD
          <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-border/80 bg-background/70 p-0.5">
            <TerminalPlacementSlot
              placement={terminalPlacement}
              onChange={setTerminalPlacement}
              size="md"
            />
            <TerminalChromeActions
              size="md"
              splitLabel={splitTerminalActionLabel}
              splitVerticalLabel={splitTerminalVerticalActionLabel}
              newLabel={newTerminalActionLabel}
              closeLabel={closeTerminalActionLabel}
              findLabel={findTerminalActionLabel}
              findOpen={findOpen}
              splitDisabled={hasReachedSplitLimit}
              showClose
              onSplit={onSplitTerminalAction}
              onSplitVertical={onSplitTerminalVerticalAction}
              onNew={onNewTerminalAction}
              onClose={() => confirmCloseTerminal(resolvedActiveTerminalId)}
              onToggleFind={toggleFind}
            />
=======
          <div className="pointer-events-auto inline-flex items-center overflow-hidden rounded-md border border-border/80 bg-background shadow-xs">
            <TerminalActionButton
              disabled={!canOperateTerminal}
              className={`p-1 text-foreground/90 transition-colors ${
                hasReachedSplitLimit
                  ? "cursor-not-allowed opacity-64 hover:bg-transparent"
                  : "hover:bg-accent"
              }`}
              onClick={onSplitTerminalAction}
              label={splitTerminalActionLabel}
            >
              <SquareSplitHorizontal className="size-3.25" />
            </TerminalActionButton>
            <div className="h-4 w-px bg-border/80" />
            <TerminalActionButton
              disabled={!canOperateTerminal}
              className={`p-1 text-foreground/90 transition-colors ${
                hasReachedSplitLimit
                  ? "cursor-not-allowed opacity-64 hover:bg-transparent"
                  : "hover:bg-accent"
              }`}
              onClick={onSplitTerminalVerticalAction}
              label={splitTerminalVerticalActionLabel}
            >
              <SquareSplitVertical className="size-3.25" />
            </TerminalActionButton>
            <div className="h-4 w-px bg-border/80" />
            <TerminalActionButton
              disabled={!canOperateTerminal}
              className="p-1 text-foreground/90 transition-colors hover:bg-accent"
              onClick={onNewTerminalAction}
              label={newTerminalActionLabel}
            >
              <Plus className="size-3.25" />
            </TerminalActionButton>
            <div className="h-4 w-px bg-border/80" />
            <TerminalActionButton
              disabled={!canOperateTerminal}
              className="p-1 text-foreground/90 transition-colors hover:bg-accent"
              onClick={() => confirmCloseTerminal(resolvedActiveTerminalId)}
              label={closeTerminalActionLabel}
            >
              <Trash2 className="size-3.25" />
            </TerminalActionButton>
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
          </div>
        </div>
      )}

      <TerminalFindBar
        open={findOpen}
        size={hasTerminalSidebar ? "sm" : "md"}
        activeTerminalId={resolvedActiveTerminalId}
        controllersRef={searchControllersRef}
        onClose={() => setFindOpen(false)}
      />

      <div className="min-h-0 w-full flex-1">
        <div
          className={cn(
            "flex h-full min-h-0 bg-(--terminal-background)",
            hasTerminalSidebar && "gap-1.5",
          )}
        >
          <div className="min-w-0 flex-1">
<<<<<<< HEAD
            {isSplitView ? (
              <div
                className="grid h-full w-full min-w-0 gap-0 overflow-hidden"
                style={
                  splitDirection === "vertical"
                    ? {
                        gridTemplateRows: `repeat(${visibleTerminalIds.length}, minmax(0, 1fr))`,
                      }
                    : {
                        gridTemplateColumns: `repeat(${visibleTerminalIds.length}, minmax(0, 1fr))`,
                      }
                }
              >
                {visibleTerminalIds.map((terminalId) => {
                  const terminalLaunchLocation = resolveTerminalLaunchLocation(terminalId);
                  return (
                    <div
                      key={terminalId}
                      className={`min-h-0 min-w-0 ${
                        splitDirection === "vertical"
                          ? "border-t first:border-t-0"
                          : "border-l first:border-l-0"
                      } ${
                        terminalId === resolvedActiveTerminalId
                          ? "border-border"
                          : "border-border/70"
                      }`}
                      onMouseDown={() => {
                        if (terminalId !== resolvedActiveTerminalId) {
                          onActiveTerminalChange(terminalId);
                        }
                      }}
                    >
                      <div className="h-full">
                        <TerminalViewport
                          advancedTypography={advancedTypography}
                          threadRef={threadRef}
                          threadId={threadId}
                          terminalId={terminalId}
                          terminalLabel={terminalLabelById.get(terminalId) ?? "Terminal"}
                          cwd={terminalLaunchLocation.cwd}
                          {...(terminalLaunchLocation.worktreePath !== undefined
                            ? { worktreePath: terminalLaunchLocation.worktreePath }
                            : {})}
                          {...(terminalLaunchLocation.runtimeEnv
                            ? { runtimeEnv: terminalLaunchLocation.runtimeEnv }
                            : {})}
                          onSessionExited={() => onCloseTerminal(terminalId)}
                          onAddTerminalContext={onAddTerminalContext}
                          focusRequestId={focusRequestId}
                          autoFocus={terminalId === resolvedActiveTerminalId}
                          resizeEpoch={resizeEpoch}
                          drawerHeight={drawerHeight}
                          keybindings={keybindings}
                          onSearchControllerChange={handleSearchControllerChange}
                          onRequestSearch={openFind}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full">
                <TerminalViewport
                  advancedTypography={advancedTypography}
                  key={resolvedActiveTerminalId}
                  threadRef={threadRef}
                  threadId={threadId}
                  terminalId={resolvedActiveTerminalId}
                  terminalLabel={terminalLabelById.get(resolvedActiveTerminalId) ?? "Terminal"}
                  cwd={activeTerminalLaunchLocation.cwd}
                  {...(activeTerminalLaunchLocation.worktreePath !== undefined
                    ? { worktreePath: activeTerminalLaunchLocation.worktreePath }
                    : {})}
                  {...(activeTerminalLaunchLocation.runtimeEnv
                    ? { runtimeEnv: activeTerminalLaunchLocation.runtimeEnv }
                    : {})}
                  onSessionExited={() => onCloseTerminal(resolvedActiveTerminalId)}
                  onAddTerminalContext={onAddTerminalContext}
                  focusRequestId={focusRequestId}
                  autoFocus
                  resizeEpoch={resizeEpoch}
                  drawerHeight={drawerHeight}
                  keybindings={keybindings}
                  onSearchControllerChange={handleSearchControllerChange}
                  onRequestSearch={openFind}
                />
              </div>
            )}
          </div>

          {hasTerminalSidebar && (
            <aside className="order-first flex w-36 min-w-36 flex-col border border-border/70 bg-muted/10">
              {/* h-6, not h-[22px]: the buttons are square 20px pills now, and a
                  22px row forced them to stretch to 20x21 — not a square, not a
                  pill. Height follows the control, never the other way round. */}
              <div className="flex h-6 items-center justify-between gap-1 border-b border-border/70 px-0.5">
                <div className="inline-flex items-center gap-0.5">
                  <TerminalPlacementSlot
                    placement={terminalPlacement}
                    onChange={setTerminalPlacement}
                  />
                </div>
                <div className="inline-flex items-center gap-0.5">
                  {/* No Close here: every session row below carries its own
                      close, so a header close would be the same action twice. */}
                  <TerminalChromeActions
                    size="sm"
                    splitLabel={splitTerminalActionLabel}
                    splitVerticalLabel={splitTerminalVerticalActionLabel}
                    newLabel={newTerminalActionLabel}
                    closeLabel={closeTerminalActionLabel}
                    findLabel={findTerminalActionLabel}
                    findOpen={findOpen}
                    splitDisabled={hasReachedSplitLimit}
                    showClose={false}
                    onSplit={onSplitTerminalAction}
                    onSplitVertical={onSplitTerminalVerticalAction}
                    onNew={onNewTerminalAction}
                    onClose={() => confirmCloseTerminal(resolvedActiveTerminalId)}
                    onToggleFind={toggleFind}
                  />
=======
            <TerminalSplitPanes
              terminalIds={visibleTerminalIds}
              splitDirection={splitDirection}
              activeTerminalId={resolvedActiveTerminalId}
              terminalLabelById={terminalLabelById}
              resolveLaunchLocation={resolveTerminalLaunchLocation}
              onActiveTerminalChange={onActiveTerminalChange}
              onCloseTerminal={onCloseTerminal}
              advancedTypography={advancedTypography}
              threadRef={threadRef}
              threadId={threadId}
              onAddTerminalContext={onAddTerminalContext}
              visible={visible}
              keybindings={keybindings}
            />
          </div>

          {hasTerminalSidebar && (
            <aside className="flex w-36 min-w-36 flex-col border border-border/70 bg-muted/10">
              <div className="flex h-[22px] items-stretch justify-end border-b border-border/70">
                <div className="inline-flex h-full items-stretch">
                  <TerminalActionButton
                    disabled={!canOperateTerminal}
                    className={`inline-flex h-full items-center px-1 text-foreground/90 transition-colors ${
                      hasReachedSplitLimit
                        ? "cursor-not-allowed opacity-64 hover:bg-transparent"
                        : "hover:bg-accent/70"
                    }`}
                    onClick={onSplitTerminalAction}
                    label={splitTerminalActionLabel}
                  >
                    <SquareSplitHorizontal className="size-3.25" />
                  </TerminalActionButton>
                  <TerminalActionButton
                    disabled={!canOperateTerminal}
                    className={`inline-flex h-full items-center border-l border-border/70 px-1 text-foreground/90 transition-colors ${
                      hasReachedSplitLimit
                        ? "cursor-not-allowed opacity-64 hover:bg-transparent"
                        : "hover:bg-accent/70"
                    }`}
                    onClick={onSplitTerminalVerticalAction}
                    label={splitTerminalVerticalActionLabel}
                  >
                    <SquareSplitVertical className="size-3.25" />
                  </TerminalActionButton>
                  <TerminalActionButton
                    disabled={!canOperateTerminal}
                    className="inline-flex h-full items-center border-l border-border/70 px-1 text-foreground/90 transition-colors hover:bg-accent/70"
                    onClick={onNewTerminalAction}
                    label={newTerminalActionLabel}
                  >
                    <Plus className="size-3.25" />
                  </TerminalActionButton>
                  <TerminalActionButton
                    disabled={!canOperateTerminal}
                    className="inline-flex h-full items-center border-l border-border/70 px-1 text-foreground/90 transition-colors hover:bg-accent/70"
                    onClick={() => confirmCloseTerminal(resolvedActiveTerminalId)}
                    label={closeTerminalActionLabel}
                  >
                    <Trash2 className="size-3.25" />
                  </TerminalActionButton>
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
<<<<<<< HEAD
                {resolvedTerminalGroups.map((terminalGroup) => {
                  const isGroupActive =
                    terminalGroup.terminalIds.includes(resolvedActiveTerminalId);
                  return (
                    // A group reads as one block of subtle grey — no header row,
                    // no connector rule, no elbow glyphs. Membership is the tint.
                    <div
                      key={terminalGroup.id}
                      className={
                        showGroupHeaders
                          ? `mb-1 rounded-md p-0.5 ${
                              isGroupActive ? "bg-foreground/[0.07]" : "bg-foreground/[0.035]"
                            }`
                          : "pb-0.5"
                      }
                    >
                      <div>
                        {terminalGroup.terminalIds.map((terminalId) => {
                          const isActive = terminalId === resolvedActiveTerminalId;
                          const closeTerminalLabel = `Close ${
                            terminalLabelById.get(terminalId) ?? "Terminal"
                          }${isActive && closeShortcutLabel ? ` (${closeShortcutLabel})` : ""}`;
                          return (
                            <div
                              key={terminalId}
                              // Rounded-full, like everything else in this chrome.
                              // A 4px-radius chip next to round pills was the
                              // last square corner in the surface.
                              className={`group flex h-6 items-center gap-1 rounded-full pl-1.5 pr-0.5 text-[11px] ${
                                isActive
                                  ? "bg-accent text-foreground"
                                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                              }`}
                            >
                              <button
                                type="button"
                                className="flex h-full min-w-0 flex-1 items-center gap-1 rounded-full text-left"
                                onClick={() => onActiveTerminalChange(terminalId)}
                              >
                                <Code1Filled className="size-3 shrink-0" />
                                <span className="truncate">
                                  {terminalLabelById.get(terminalId) ?? "Terminal"}
                                </span>
                              </button>
                              {normalizedTerminalIds.length > 1 && (
                                <Popover>
                                  <PopoverTrigger
                                    openOnHover
                                    render={
                                      <button
                                        type="button"
                                        className={cn(
                                          terminalChromeButtonClass("sm"),
                                          "opacity-0 group-hover:opacity-100",
                                        )}
                                        onClick={() => confirmCloseTerminal(terminalId)}
                                        aria-label={closeTerminalLabel}
                                      />
                                    }
                                  >
                                    <CloseSquareFilled className="size-3" />
                                  </PopoverTrigger>
                                  <PopoverPopup
                                    tooltipStyle
                                    side="bottom"
                                    sideOffset={6}
                                    align="center"
                                    className="pointer-events-none select-none"
                                  >
                                    {closeTerminalLabel}
                                  </PopoverPopup>
                                </Popover>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
=======
                {resolvedTerminalGroups.map((terminalGroup) => (
                  <TerminalSidebarGroup
                    key={terminalGroup.id}
                    terminalGroup={terminalGroup}
                    activeTerminalId={resolvedActiveTerminalId}
                    showHeader={showGroupHeaders}
                    terminalLabelById={terminalLabelById}
                    closeShortcutLabel={closeShortcutLabel}
                    canOperateTerminal={canOperateTerminal}
                    onActiveTerminalChange={onActiveTerminalChange}
                    onCloseTerminal={confirmCloseTerminal}
                  />
                ))}
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
              </div>
            </aside>
          )}
        </div>
      </div>
    </aside>
  );
}
