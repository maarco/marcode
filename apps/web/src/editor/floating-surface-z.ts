import type { CSSProperties } from "react";

export const FLOATING_SURFACE_Z = {
  appDesktop: 10000,
  appPanelBackdrop: 10010,
  appPanelBase: 10100,
  codeBackdrop: 11990,
  codePanel: 12000,
  terminalPanel: 12100,
  pillNavGlow: 12990,
  pillNav: 13000,
  pillNavMenu: 13010,
  // Portaled overlays — tooltip / popover / menu / select / combobox /
  // autocomplete / dialog / sheet / command palette. They portal to <body>, so
  // they escape the floating panels' stacking contexts, but they still land at
  // whatever z-index they carry: anything below `pillNav` renders *underneath*
  // the floating terminal, code panel and pill. Above every floating surface,
  // below `toast` so a toast is never covered by a menu.
  portalOverlay: 13100,
  // transient toasts sit above the top chrome (pill nav / notifications) so they
  // are never covered, but below the kollabor assistant surfaces.
  toast: 19500,
  kollaborBackdrop: 19999,
  kollaborBar: 20000,
  kollaborPrompt: 20001,
} as const;

/**
 * z-index for a portaled overlay surface, as an inline style rather than a
 * `z-*` utility class — inline always wins the cascade, so a stray `z-50` in a
 * caller's className can never drop the overlay back under the floating shell.
 * A caller that genuinely needs a different stacking order can still pass its
 * own `zIndex` through `style`.
 *
 * Base UI lets `style` be a function of the part's state, so both forms are
 * accepted and merged.
 */
/**
 * Portaled overlays follow their anchor. When the anchor lives inside a
 * horizontally scrollable strip — the pill nav's control row — scrolling it out
 * of view drags the open overlay off the side of the viewport with it, and the
 * *page* picks up horizontal overflow. Base UI already detects this and stamps
 * `data-anchor-hidden` on the positioner; `visibility: hidden` would not be
 * enough (a hidden box still contributes to `scrollWidth`), so take it out of
 * layout entirely.
 */
export const PORTAL_OVERLAY_ANCHOR_HIDDEN_CLASS = "data-anchor-hidden:hidden";

export function portalOverlayStyle<S>(
  style?: CSSProperties | ((state: S) => CSSProperties | undefined),
): CSSProperties | ((state: S) => CSSProperties) {
  if (typeof style === "function") {
    return (state: S) => ({ zIndex: FLOATING_SURFACE_Z.portalOverlay, ...style(state) });
  }
  return { zIndex: FLOATING_SURFACE_Z.portalOverlay, ...style };
}
