export type FloatingShellEdge = "top" | "bottom" | "left" | "right";

export const FLOATING_PILL_NAV_TOP_INSET_ATTRIBUTE = "data-floating-pill-nav-top";
export const FLOATING_PILL_NAV_TOP_INSET_VARIABLE = "--marcode-floating-pill-nav-top-inset";
export const FLOATING_PILL_NAV_TOP_GAP_PX = 8;
export const FLOATING_PILL_NAV_EDGE_MARGIN_PX = 20;
export const FLOATING_PILL_NAV_HEADER_HEIGHT_PX = 52;

/**
 * Keep the visual centre of a docked pill inside the viewport with a small
 * breathing room at either end of its main axis. The result preserves the
 * existing 10–90% snap range unless the pill itself needs a tighter bound.
 */
export function clampFloatingPillNavOffset(input: {
  readonly edge: FloatingShellEdge;
  readonly offset: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly visualExtent: number;
  readonly margin?: number;
}): number {
  const viewport =
    input.edge === "top" || input.edge === "bottom" ? input.viewportWidth : input.viewportHeight;
  const offset = Number.isFinite(input.offset) ? input.offset : 50;
  const visualExtent = Math.max(0, input.visualExtent);
  const margin = Math.max(0, input.margin ?? FLOATING_PILL_NAV_EDGE_MARGIN_PX);
  if (!Number.isFinite(viewport) || viewport <= 0 || !Number.isFinite(visualExtent)) {
    return Math.max(10, Math.min(90, offset));
  }

  const minCenter = margin + visualExtent / 2;
  const maxCenter = viewport - margin - visualExtent / 2;
  if (minCenter > maxCenter) return 50;

  const minOffset = Math.max(10, (minCenter / viewport) * 100);
  const maxOffset = Math.min(90, (maxCenter / viewport) * 100);
  return Math.max(minOffset, Math.min(maxOffset, offset));
}

/**
 * Return the space shared workspace headers must leave below a pill that
 * overlaps the top header band. This is measured from the actual transformed
 * rectangle, so dragging a pill across the header cannot put a title under it.
 * A pill docked to a side edge is a tall strip beside the header, so its height
 * must never push the header down. Mobile uses a full-width rail and needs no
 * extra gap.
 */
export function resolveFloatingPillNavTopInset(input: {
  readonly edge: FloatingShellEdge;
  readonly isMobile: boolean;
  readonly isDragging: boolean;
  readonly top: number;
  readonly bottom: number;
}): string | null {
  const top = Number.isFinite(input.top) ? input.top : 0;
  const bottom = Number.isFinite(input.bottom) ? input.bottom : 0;
  const dockedToSide = input.edge === "left" || input.edge === "right";
  if (
    !input.isMobile &&
    (dockedToSide || bottom <= 0 || top >= FLOATING_PILL_NAV_HEADER_HEIGHT_PX)
  ) {
    return null;
  }

  const gap = input.isMobile ? 0 : FLOATING_PILL_NAV_TOP_GAP_PX;
  return `${Math.max(0, Math.ceil(bottom + gap))}px`;
}
