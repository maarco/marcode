import { useAtomValue } from "@effect/atom-react";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon, type ISearchOptions } from "@xterm/addon-search";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
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
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
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
import {
  collectWrappedTerminalLinkLine,
  extractTerminalLinks,
  isTerminalLinkActivation,
  resolvePathLinkTarget,
  resolveWrappedTerminalLinkRange,
  wrappedTerminalLinkRangeIntersectsBufferLine,
} from "../terminal-links";
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
import { useClientSettings } from "../hooks/useSettings";
import * as Schema from "effect/Schema";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useAttachedTerminalSession } from "../state/terminalSessions";
import { serverEnvironment } from "../state/server";
import { previewEnvironment } from "../state/preview";
import { terminalEnvironment } from "../state/terminal";
import { openTerminalLinkInPreview } from "./preview/openTerminalLinkInPreview";
import { useAtomCommand } from "../state/use-atom-command";
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

function maxDrawerHeight(): number {
  if (typeof window === "undefined") return DEFAULT_THREAD_TERMINAL_HEIGHT;
  return Math.max(MIN_DRAWER_HEIGHT, Math.floor(window.innerHeight * MAX_DRAWER_HEIGHT_RATIO));
}

function clampDrawerHeight(height: number): number {
  const safeHeight = Number.isFinite(height) ? height : DEFAULT_THREAD_TERMINAL_HEIGHT;
  const maxHeight = maxDrawerHeight();
  return Math.min(Math.max(Math.round(safeHeight), MIN_DRAWER_HEIGHT), maxHeight);
}

function writeSystemMessage(terminal: Terminal, message: string): void {
  terminal.write(`\r\n[terminal] ${message}\r\n`);
}

function writeTerminalBuffer(terminal: Terminal, buffer: string): void {
  terminal.write("\u001bc");
  if (buffer.length > 0) {
    terminal.write(buffer);
  }
}

function fitTerminalSafely(fitAddon: FitAddon): boolean {
  try {
    fitAddon.fit();
    return true;
  } catch {
    return false;
  }
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

function terminalThemeFromApp(mountElement?: HTMLElement | null): ITheme {
  const isDark = document.documentElement.classList.contains("dark");
  const fallbackBackground = isDark ? "rgb(14, 18, 24)" : "rgb(255, 255, 255)";
  const fallbackForeground = isDark ? "rgb(237, 241, 247)" : "rgb(28, 33, 41)";
  const drawerSurface =
    mountElement?.closest(".thread-terminal-drawer") ??
    document.querySelector(".thread-terminal-drawer") ??
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
      selectionBackground: "rgba(180, 203, 255, 0.25)",
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
    selectionBackground: "rgba(37, 63, 99, 0.2)",
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
  return {
    x: Math.max(8, Math.min(preferredX, Math.max(viewportWidth - 8, 8))),
    y: Math.max(8, Math.min(preferredY, Math.max(viewportHeight - 8, 8))),
  };
}

export function terminalSelectionActionDelayForClickCount(clickCount: number): number {
  return clickCount >= 2 ? MULTI_CLICK_SELECTION_ACTION_DELAY_MS : 0;
}

export function shouldHandleTerminalSelectionMouseUp(
  selectionGestureActive: boolean,
  button: number,
): boolean {
  return selectionGestureActive && button === 0;
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
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  focusRequestId: number;
  autoFocus: boolean;
  resizeEpoch: number;
  drawerHeight: number;
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

export function TerminalViewport({
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
  focusRequestId,
  autoFocus,
  resizeEpoch,
  drawerHeight,
  keybindings,
  onSearchControllerChange,
  onRequestSearch,
}: TerminalViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
  const environmentId = threadRef.environmentId;
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
  const selectionActionMenuOpenRef = useRef(false);
  const selectionActionTimerRef = useRef<number | null>(null);
  const keybindingsRef = useRef(keybindings);
  const runtimeEnvKey = useMemo(() => runtimeEnvSignature(runtimeEnv), [runtimeEnv]);
  const handleSessionExited = useEffectEvent(() => {
    onSessionExited();
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
  const terminalSession = useAttachedTerminalSession({
    environmentId,
    terminal: {
      threadId,
      terminalId,
      cwd,
      ...(worktreePath !== undefined ? { worktreePath } : {}),
      ...(runtimeEnv ? { env: runtimeEnv } : {}),
    },
  });
  const writeTerminal = useEffectEvent((data: string) =>
    runTerminalWrite({
      environmentId,
      input: { threadId, terminalId, data },
    }),
  );
  const resizeTerminal = useEffectEvent((cols: number, rows: number) =>
    runTerminalResize({
      environmentId,
      input: { threadId, terminalId, cols, rows },
    }),
  );
  const terminalBuffer = terminalSession.buffer;
  const terminalError = terminalSession.error;
  const terminalStatus = terminalSession.status;
  const terminalVersion = terminalSession.version;
  const previousSessionRef = useRef({
    buffer: terminalBuffer,
    error: terminalError,
    status: terminalStatus,
    version: terminalVersion,
  });

  useEffect(() => {
    keybindingsRef.current = keybindings;
  }, [keybindings]);

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
      };
    };

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
          return;
        case "copy":
          try {
            await writeTextToClipboard(nextAction.clipboardText, "terminal selection");
          } catch (error) {
            if (requestId !== selectionActionRequestIdRef.current) {
              return;
            }
            const activeTerminal = terminalRef.current;
            if (activeTerminal) {
              writeSystemMessage(
                activeTerminal,
                error instanceof Error ? error.message : "Unable to copy terminal selection",
              );
            }
          }
          if (requestId === selectionActionRequestIdRef.current) {
            terminalRef.current?.focus();
          }
          return;
      }
    };

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

      // Must preventDefault or Chrome's own find bar opens over the panel.
      if (isTerminalFindShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        requestSearch();
        return false;
      }

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
                  position: { x: event.clientX, y: event.clientY },
                  threadRef,
                  openPreview,
                  localApi,
                  fallbackToBrowser,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [drawerHeight, environmentId, resizeEpoch, terminalId, threadId]);
  return (
    <div
      ref={containerRef}
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
  terminalIds: string[];
  activeTerminalId: string;
  terminalGroups: ThreadTerminalGroup[];
  activeTerminalGroupId: string;
  focusRequestId: number;
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
  /** Prefer server-provided tab titles when present (e.g. active subprocess name). */
  terminalLabelsById?: ReadonlyMap<string, string>;
  /** Prefer per-session launch locations when the server already knows a terminal. */
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
  /**
   * Soft-disabled: `aria-disabled`, not `disabled`. A real `disabled` button
   * stops firing pointer events in the trigger, which kills the tooltip that
   * carries the *reason* — a silently dead button is exactly the bug.
   */
  disabled?: boolean;
  pressed?: boolean;
}

function TerminalActionButton({
  label,
  className,
  onClick,
  children,
  disabled = false,
  pressed,
}: TerminalActionButtonProps) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            className={className}
            onClick={disabled ? undefined : onClick}
            aria-label={label}
            aria-disabled={disabled ? true : undefined}
            {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
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
  terminalIds,
  activeTerminalId,
  terminalGroups,
  activeTerminalGroupId,
  focusRequestId,
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
  const [advancedTypography] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
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
  const resizeStateRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const didResizeDuringDragRef = useRef(false);

  const normalizedTerminalIds = useMemo(() => {
    const normalizedIds: string[] = [];
    const seen = new Set<string>();
    for (const id of terminalIds) {
      const trimmedId = id.trim();
      if (trimmedId.length === 0 || seen.has(trimmedId)) continue;
      seen.add(trimmedId);
      normalizedIds.push(trimmedId);
    }
    return normalizedIds;
  }, [terminalIds]);

  const resolvedActiveTerminalId =
    normalizedTerminalIds.length === 0
      ? ""
      : normalizedTerminalIds.includes(activeTerminalId)
        ? activeTerminalId
        : (normalizedTerminalIds[0] ?? "");

  const resolvedTerminalGroups = useMemo(() => {
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
  }, [normalizedTerminalIds, terminalGroups]);

  const resolvedActiveGroupIndex = useMemo(() => {
    const indexById = resolvedTerminalGroups.findIndex(
      (terminalGroup) => terminalGroup.id === activeTerminalGroupId,
    );
    if (indexById >= 0) return indexById;
    const indexByTerminal = resolvedTerminalGroups.findIndex((terminalGroup) =>
      terminalGroup.terminalIds.includes(resolvedActiveTerminalId),
    );
    return indexByTerminal >= 0 ? indexByTerminal : 0;
  }, [activeTerminalGroupId, resolvedActiveTerminalId, resolvedTerminalGroups]);

  const visibleTerminalIds =
    resolvedTerminalGroups[resolvedActiveGroupIndex]?.terminalIds ??
    (normalizedTerminalIds.length > 0 ? [resolvedActiveTerminalId] : []);
  const splitDirection =
    resolvedTerminalGroups[resolvedActiveGroupIndex]?.splitDirection ?? "horizontal";
  const hasTerminalSidebar = normalizedTerminalIds.length > 1;
  const isSplitView = visibleTerminalIds.length > 1;
  const showGroupHeaders =
    resolvedTerminalGroups.length > 1 ||
    resolvedTerminalGroups.some((terminalGroup) => terminalGroup.terminalIds.length > 1);
  const hasReachedSplitLimit = visibleTerminalIds.length >= MAX_TERMINALS_PER_GROUP;
  const terminalLabelById = useMemo(() => {
    const next = new Map<string, string>();
    for (const terminalId of normalizedTerminalIds) {
      next.set(terminalId, terminalLabelsById?.get(terminalId) ?? getTerminalLabel(terminalId));
    }
    return next;
  }, [normalizedTerminalIds, terminalLabelsById]);
  const resolveTerminalLaunchLocation = useCallback(
    (terminalId: string): TerminalLaunchLocation => {
      return (
        terminalLaunchLocationsById?.get(terminalId) ?? {
          cwd,
          ...(worktreePath !== undefined ? { worktreePath } : {}),
          ...(runtimeEnv ? { runtimeEnv } : {}),
        }
      );
    },
    [cwd, runtimeEnv, terminalLaunchLocationsById, worktreePath],
  );
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
  const findTerminalActionLabel = findOpen
    ? "Hide Find"
    : `Find in Terminal (${terminalFindShortcutLabel()})`;
  const onSplitTerminalAction = useCallback(() => {
    if (hasReachedSplitLimit) return;
    onSplitTerminal();
  }, [hasReachedSplitLimit, onSplitTerminal]);
  const onSplitTerminalVerticalAction = useCallback(() => {
    if (hasReachedSplitLimit) return;
    onSplitTerminalVertical();
  }, [hasReachedSplitLimit, onSplitTerminalVertical]);
  const onNewTerminalAction = useCallback(() => {
    onNewTerminal();
  }, [onNewTerminal]);

  useEffect(() => {
    onHeightChangeRef.current = onHeightChange;
  }, [onHeightChange]);

  useEffect(() => {
    drawerHeightRef.current = drawerHeight;
  }, [drawerHeight]);

  const syncHeight = useCallback((nextHeight: number) => {
    const clampedHeight = clampDrawerHeight(nextHeight);
    if (lastSyncedHeightRef.current === clampedHeight) return;
    lastSyncedHeightRef.current = clampedHeight;
    onHeightChangeRef.current(clampedHeight);
  }, []);

  useEffect(() => {
    lastSyncedHeightRef.current = controlledDrawerHeight;
  }, [controlledDrawerHeight, threadId]);

  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    didResizeDuringDragRef.current = false;
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: drawerHeightRef.current,
    };
  }, []);

  const handleResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;
      event.preventDefault();
      const clampedHeight = clampDrawerHeight(
        resizeState.startHeight + (resizeState.startY - event.clientY),
      );
      if (clampedHeight === drawerHeightRef.current) {
        return;
      }
      didResizeDuringDragRef.current = true;
      drawerHeightRef.current = clampedHeight;
      setDrawerHeight(clampedHeight);
    },
    [setDrawerHeight],
  );

  const handleResizePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;
      resizeStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!didResizeDuringDragRef.current) {
        return;
      }
      syncHeight(drawerHeightRef.current);
      setResizeEpoch((value) => value + 1);
    },
    [syncHeight],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    const onWindowResize = () => {
      const clampedHeight = clampDrawerHeight(drawerHeightRef.current);
      const changed = clampedHeight !== drawerHeightRef.current;
      if (changed) {
        setDrawerHeightFromWindowResize(clampedHeight);
        drawerHeightRef.current = clampedHeight;
      }
      if (!resizeStateRef.current) {
        syncHeight(clampedHeight);
      }
      setResizeEpoch((value) => value + 1);
    };
    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
    };
  }, [syncHeight, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setResizeEpoch((value) => value + 1);
  }, [visible]);

  useEffect(() => {
    return () => {
      syncHeight(drawerHeightRef.current);
    };
  }, [syncHeight]);

  if (normalizedTerminalIds.length === 0) {
    return (
      <aside
        data-terminal-owner={terminalOwner}
        className={cn(
          "thread-terminal-drawer relative flex min-w-0 flex-col overflow-hidden bg-background",
          isPanel ? "h-full flex-1" : "shrink-0 border-t border-border/80",
        )}
        style={isPanel ? undefined : { height: `${drawerHeight}px` }}
      >
        {!isPanel ? (
          <div
            className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerEnd}
            onPointerCancel={handleResizePointerEnd}
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
          <button
            type="button"
            className="rounded-md border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            onClick={onNewTerminalAction}
          >
            {newTerminalActionLabel}
          </button>
        </div>
      </aside>
    );
  }

  const activeTerminalLaunchLocation = resolveTerminalLaunchLocation(resolvedActiveTerminalId);

  return (
    <aside
      data-terminal-owner={terminalOwner}
      className={cn(
        "thread-terminal-drawer relative flex min-w-0 flex-col overflow-hidden bg-background",
        isPanel ? "h-full flex-1" : "shrink-0 border-t border-border/80",
      )}
      style={isPanel ? undefined : { height: `${drawerHeight}px` }}
    >
      {!isPanel ? (
        <div
          className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
        />
      ) : null}

      {!hasTerminalSidebar && (
        <div className="pointer-events-none absolute right-2 top-2 z-20">
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
              onClose={() => onCloseTerminal(resolvedActiveTerminalId)}
              onToggleFind={toggleFind}
            />
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
        <div className={`flex h-full min-h-0 ${hasTerminalSidebar ? "gap-1.5" : ""}`}>
          <div className="min-w-0 flex-1">
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
                      <div className="h-full p-1">
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
              <div className="h-full p-1">
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
                    onClose={() => onCloseTerminal(resolvedActiveTerminalId)}
                    onToggleFind={toggleFind}
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
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
                                        onClick={() => onCloseTerminal(terminalId)}
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
              </div>
            </aside>
          )}
        </div>
      </div>
    </aside>
  );
}
