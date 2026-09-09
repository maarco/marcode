export type FloatingShellEdge = "top" | "bottom" | "left" | "right";

export const FLOATING_PILL_NAV_TOP_INSET_ATTRIBUTE = "data-floating-pill-nav-top";
export const FLOATING_PILL_NAV_TOP_INSET_VARIABLE = "--marcode-floating-pill-nav-top-inset";
export const FLOATING_PILL_NAV_TOP_GAP_PX = 8;

/**
 * Return the space shared workspace headers must leave below a top-docked pill.
 * A dragged pill is transient, so it should not move the layout while the user
 * is positioning it. Mobile uses a full-width rail and needs no extra gap;
 * desktop keeps the capsule's visual breathing room below its rounded edge.
 */
export function resolveFloatingPillNavTopInset(input: {
  readonly edge: FloatingShellEdge;
  readonly isMobile: boolean;
  readonly isDragging: boolean;
  readonly bottom: number;
}): string | null {
  if (input.isDragging || (!input.isMobile && input.edge !== "top")) {
    return null;
  }

  const bottom = Number.isFinite(input.bottom) ? input.bottom : 0;
  const gap = input.isMobile ? 0 : FLOATING_PILL_NAV_TOP_GAP_PX;
  return `${Math.max(0, Math.ceil(bottom + gap))}px`;
}
