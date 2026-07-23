import { describe, expect, it } from "vite-plus/test";

import { clampGeometry } from "./FloatingTerminalShell";

const MIN_W = 400;
const MIN_H = 280;
const EDGE = 8;

describe("clampGeometry", () => {
  it("pulls a panel that still fits fully back on screen", () => {
    // The right panel edge carries the action cluster and the find bar. Off the
    // viewport there is no scrollbar to reach them, so they just vanish.
    const clamped = clampGeometry({ x: 420, y: 120, w: 539, h: 520 }, { width: 911, height: 941 });
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(911 - EDGE);
    expect(clamped.x).toBeGreaterThanOrEqual(EDGE);
    expect(clamped.y + clamped.h).toBeLessThanOrEqual(941 - EDGE);
  });

  it("leaves a panel that already fits exactly where it is", () => {
    const geo = { x: 100, y: 100, w: 600, h: 400 };
    expect(clampGeometry(geo, { width: 1400, height: 900 })).toEqual(geo);
  });

  it("still guarantees a grab strip when the panel cannot fit", () => {
    // Viewport narrower than MIN_W: the panel cannot shrink further, so the
    // old grab-strip rule has to stay in force rather than pinning it flush.
    const clamped = clampGeometry({ x: 900, y: 40, w: 900, h: 600 }, { width: 360, height: 700 });
    expect(clamped.w).toBe(MIN_W);
    expect(clamped.x).toBeLessThanOrEqual(360 - 80);
    expect(clamped.x + clamped.w).toBeGreaterThan(80);
  });

  it("never returns a panel smaller than the minimum", () => {
    const clamped = clampGeometry({ x: 0, y: 0, w: 10, h: 10 }, { width: 1200, height: 800 });
    expect(clamped.w).toBe(MIN_W);
    expect(clamped.h).toBe(MIN_H);
  });

  // Reported live: viewport 1666x489, stored {420,120,900,520}, panel rendered
  // at x=1486 w=646 — 466px past the right edge, unreachable and unrecoverable
  // except by clearing localStorage.
  it("keeps the panel inside the viewport after the window shrinks", () => {
    const viewport = { width: 1666, height: 489 };
    const clamped = clampGeometry({ x: 420, y: 120, w: 900, h: 520 }, viewport);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(viewport.width);
    expect(clamped.y + clamped.h).toBeLessThanOrEqual(viewport.height);
  });

  it("clamps an x far past the right edge back to a visible position", () => {
    const viewport = { width: 1666, height: 489 };
    const clamped = clampGeometry({ x: 1486, y: 8, w: 646, h: 468 }, viewport);
    expect(clamped.x).toBeLessThanOrEqual(viewport.width - clamped.w);
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(viewport.width);
  });

  it("is idempotent — re-clamping a clamped rect changes nothing", () => {
    const viewport = { width: 1666, height: 489 };
    const once = clampGeometry({ x: 1486, y: 900, w: 900, h: 520 }, viewport);
    expect(clampGeometry(once, viewport)).toEqual(once);
  });

  it("never puts the titlebar above the top edge on a short viewport", () => {
    // The old defaultGeometry returned y = innerHeight - h - 24, which is
    // negative whenever the viewport is shorter than the default panel.
    for (const height of [300, 420, 489, 560]) {
      const clamped = clampGeometry(
        { x: 40, y: height - 560 - 24, w: 900, h: 560 },
        {
          width: 1400,
          height,
        },
      );
      expect(clamped.y).toBeGreaterThanOrEqual(0);
      expect(clamped.y).toBeLessThan(height);
    }
  });
});
