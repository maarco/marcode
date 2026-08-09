/**
 * App-derived theme for Ghostty canvas surfaces.
 *
 * Marcode's thread terminal renders through xterm (it carries the terminal
 * search this fork adds), so `ThreadTerminalDrawer` builds an xterm `ITheme`.
 * The Settings → Appearance font previews render a real Ghostty surface and
 * need the same colors in Ghostty's shape, so that conversion lives here
 * rather than in the drawer — a Ghostty consumer should not have to import
 * from the xterm one.
 */
import type { GhosttyColor, GhosttyTheme } from "./core";

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
}

function readThemeColor(styles: CSSStyleDeclaration, variable: string): string | null {
  const value = styles.getPropertyValue(variable).trim();
  return value.length > 0 ? value : null;
}

/**
 * Reads the terminal color tokens off the document, falling back to the
 * built-in light/dark pair. Mirrors the token names the xterm drawer reads so
 * a theme styles both surfaces identically.
 */
export function ghosttyThemeFromApp(): GhosttyTheme {
  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const fallbackBackground: GhosttyColor = isDark
    ? { r: 14, g: 18, b: 24 }
    : { r: 255, g: 255, b: 255 };
  const fallbackForeground: GhosttyColor = isDark
    ? { r: 237, g: 241, b: 247 }
    : { r: 28, g: 33, b: 41 };
  const fallbackCursor: GhosttyColor = isDark
    ? { r: 180, g: 203, b: 255 }
    : { r: 38, g: 56, b: 78 };

  if (typeof document === "undefined") {
    return {
      background: fallbackBackground,
      foreground: fallbackForeground,
      cursor: fallbackCursor,
    };
  }

  const styles = getComputedStyle(document.documentElement);
  const background = readThemeColor(styles, "--terminal-background");
  const foreground = readThemeColor(styles, "--terminal-foreground");
  const cursor = readThemeColor(styles, "--terminal-cursor");
  const selection = readThemeColor(styles, "--terminal-selection-background");

  return {
    background: background
      ? parseTerminalColor(background, fallbackBackground)
      : fallbackBackground,
    foreground: foreground
      ? parseTerminalColor(foreground, fallbackForeground)
      : fallbackForeground,
    cursor: cursor ? parseTerminalColor(cursor, fallbackCursor) : fallbackCursor,
    selectionBackground:
      selection ?? (isDark ? "rgba(180, 203, 255, 0.25)" : "rgba(37, 63, 99, 0.2)"),
  };
}
