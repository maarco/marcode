import type { CSSProperties } from "react";

// Keep the floating nav above every application surface, including future
// panels that are added to this scale. This is the largest portable CSS
// z-index value supported by browsers.
const MAX_Z_INDEX = 2_147_483_647;

export const FLOATING_SURFACE_Z = {
  appDesktop: 10000,
  appPanelBackdrop: 10010,
  appPanelBase: 10100,
  codeBackdrop: 11990,
  codePanel: 12000,
  terminalPanel: 12100,
  pillNavGlow: MAX_Z_INDEX - 2,
  pillNav: MAX_Z_INDEX,
  pillNavMenu: MAX_Z_INDEX,
  // Portaled overlays — tooltip / popover / menu / select / combobox /
  // autocomplete / dialog / sheet / command palette. They portal to <body>, so
  // they escape the floating panels' stacking contexts. Keep them below the
  // always-on-top nav so the nav remains usable while overlays are open.
  portalOverlay: 13100,
  // A tooltip describes whatever is under the pointer, including controls
  // inside an open popover, menu, or dialog, so it sits one tier above the
  // rest of the portaled overlays rather than tying with them on DOM order.
  portalOverlayTooltip: 13150,
  // transient toasts remain above the regular app chrome, but below the
  // always-on-top pill nav and kollabor assistant surfaces.
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
