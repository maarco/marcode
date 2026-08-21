import type { FloatingShellGeometry, FloatingShellRect } from "../floatingShellGeometry";

export interface SurfaceShelfLayout {
  topOffset: number;
  inlineStartInset: number;
  inlineEndInset: number;
  compact: boolean;
  collides: boolean;
}

export interface SurfaceShelfLayoutInput {
  panelRect: FloatingShellRect;
  shelfRect: FloatingShellRect;
  floatingShell: FloatingShellGeometry | null;
  gap?: number;
  minInlineSize?: number;
}

const DEFAULT_SHELF_HEIGHT = 52;
const DEFAULT_GAP = 8;
const DEFAULT_MIN_INLINE_SIZE = 240;

function overlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

function inflate(rect: FloatingShellRect, amount: number): FloatingShellRect {
  return {
    top: rect.top - amount,
    left: rect.left - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

const NO_COLLISION: SurfaceShelfLayout = {
  topOffset: 0,
  inlineStartInset: 0,
  inlineEndInset: 0,
  compact: false,
  collides: false,
};

/**
 * Resolve the shelf against the pill's last settled rectangle. The panel
 * stays the positioning context; the result is a real spacer/inset, so the
 * tabs remain in normal flow and the content below them keeps its height.
 */
export function resolveSurfaceShelfLayout(input: SurfaceShelfLayoutInput): SurfaceShelfLayout {
  const { panelRect, floatingShell } = input;
  if (!floatingShell) return NO_COLLISION;

  const gap = Math.max(0, input.gap ?? DEFAULT_GAP);
  const minInlineSize = Math.max(0, input.minInlineSize ?? DEFAULT_MIN_INLINE_SIZE);
  const navRect = inflate(floatingShell.rect, gap);
  const panelWidth = Math.max(0, panelRect.width || panelRect.right - panelRect.left);
  const panelHeight = Math.max(0, panelRect.height || panelRect.bottom - panelRect.top);
  const shelfHeight = Math.max(
    1,
    input.shelfRect.height || input.shelfRect.bottom - input.shelfRect.top || DEFAULT_SHELF_HEIGHT,
  );
  const shelfTop = panelRect.top;
  const shelfBottom = shelfTop + shelfHeight;
  const horizontalCollision = overlap(panelRect.left, panelRect.right, navRect.left, navRect.right);
  const verticalCollision = overlap(shelfTop, shelfBottom, navRect.top, navRect.bottom);

  if (!horizontalCollision || !verticalCollision) return NO_COLLISION;

  let topOffset = 0;
  let inlineStartInset = 0;
  let inlineEndInset = 0;

  if (floatingShell.edge === "left") {
    inlineStartInset = Math.max(0, Math.min(panelWidth, navRect.right - panelRect.left));
  } else if (floatingShell.edge === "right") {
    inlineEndInset = Math.max(0, Math.min(panelWidth, panelRect.right - navRect.left));
  } else {
    topOffset = Math.max(0, navRect.bottom - panelRect.top);
  }

  const availableInlineSize = Math.max(0, panelWidth - inlineStartInset - inlineEndInset);
  const usablePanelHeight = Math.max(0, panelHeight - shelfHeight);
  const compact =
    availableInlineSize < minInlineSize ||
    (topOffset > 0 && topOffset > Math.max(0, usablePanelHeight - gap));

  return {
    topOffset,
    inlineStartInset,
    inlineEndInset,
    compact,
    collides: true,
  };
}
