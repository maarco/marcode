import type { FloatingShellGeometry, FloatingShellRect } from "../floatingShellGeometry";
import { describe, expect, it } from "vite-plus/test";

import { resolveSurfaceShelfLayout } from "./surfaceShelfLayout";

const panelRect: FloatingShellRect = {
  top: 0,
  left: 800,
  right: 1400,
  bottom: 900,
  width: 600,
  height: 900,
};
const shelfRect: FloatingShellRect = {
  top: 0,
  left: 800,
  right: 1400,
  bottom: 52,
  width: 600,
  height: 52,
};

function geometry(
  rect: FloatingShellRect,
  edge: FloatingShellGeometry["edge"],
): FloatingShellGeometry {
  return { rect, edge, scale: 1, isMobile: false, version: 1 };
}

describe("resolveSurfaceShelfLayout", () => {
  it("pushes a top-docked pill below the shelf with a real flow offset", () => {
    const result = resolveSurfaceShelfLayout({
      panelRect,
      shelfRect,
      floatingShell: geometry(
        { top: 0, left: 570, right: 930, bottom: 60, width: 360, height: 60 },
        "top",
      ),
    });

    expect(result).toEqual({
      topOffset: 68,
      inlineStartInset: 0,
      inlineEndInset: 0,
      compact: false,
      collides: true,
    });
  });

  it("reserves the side occupied by a vertical pill", () => {
    const result = resolveSurfaceShelfLayout({
      panelRect: { ...panelRect, left: 0, right: 620 },
      shelfRect: { ...shelfRect, left: 0, right: 620, width: 620 },
      floatingShell: geometry(
        { top: 10, left: 0, right: 54, bottom: 420, width: 54, height: 410 },
        "left",
      ),
    });

    expect(result.inlineStartInset).toBe(62);
    expect(result.topOffset).toBe(0);
    expect(result.collides).toBe(true);
  });

  it("uses the opposite inset for a right-docked pill", () => {
    const result = resolveSurfaceShelfLayout({
      panelRect,
      shelfRect,
      floatingShell: geometry(
        { top: 8, left: 1360, right: 1400, bottom: 400, width: 40, height: 392 },
        "right",
      ),
    });

    expect(result.inlineEndInset).toBe(48);
    expect(result.topOffset).toBe(0);
  });

  it("falls back to compact mode when collision leaves no usable tab row", () => {
    const result = resolveSurfaceShelfLayout({
      panelRect: { ...panelRect, width: 220, right: 1020 },
      shelfRect: { ...shelfRect, width: 220, right: 1020 },
      floatingShell: geometry(
        { top: 0, left: 790, right: 900, bottom: 60, width: 110, height: 60 },
        "left",
      ),
    });

    expect(result.compact).toBe(true);
    expect(result.collides).toBe(true);
  });

  it("does not reserve space when the pill is away from the shelf", () => {
    expect(
      resolveSurfaceShelfLayout({
        panelRect,
        shelfRect,
        floatingShell: geometry(
          { top: 760, left: 570, right: 930, bottom: 820, width: 360, height: 60 },
          "bottom",
        ),
      }),
    ).toEqual({
      topOffset: 0,
      inlineStartInset: 0,
      inlineEndInset: 0,
      compact: false,
      collides: false,
    });
  });
});
