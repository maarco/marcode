import { describe, expect, it } from "vite-plus/test";

import {
  clampFloatingPillNavOffset,
  FLOATING_PILL_NAV_HEADER_HEIGHT_PX,
  FLOATING_PILL_NAV_TOP_GAP_PX,
  resolveFloatingPillNavTopInset,
} from "./floatingShellLayout";

describe("clampFloatingPillNavOffset", () => {
  it("keeps a wide horizontal pill inside the viewport margin", () => {
    expect(
      clampFloatingPillNavOffset({
        edge: "top",
        offset: 25,
        viewportWidth: 1000,
        viewportHeight: 800,
        visualExtent: 700,
      }),
    ).toBe(37);
  });

  it("bounds a vertical pill against the viewport height", () => {
    expect(
      clampFloatingPillNavOffset({
        edge: "left",
        offset: 90,
        viewportWidth: 1000,
        viewportHeight: 800,
        visualExtent: 300,
      }),
    ).toBe(78.75);
  });

  it("recentres a pill that is wider than the safe viewport", () => {
    expect(
      clampFloatingPillNavOffset({
        edge: "bottom",
        offset: 10,
        viewportWidth: 1000,
        viewportHeight: 800,
        visualExtent: 980,
      }),
    ).toBe(50);
  });
});

describe("resolveFloatingPillNavTopInset", () => {
  it("reserves the measured capsule plus the desktop breathing room", () => {
    expect(
      resolveFloatingPillNavTopInset({
        edge: "top",
        isMobile: false,
        isDragging: false,
        top: 0,
        bottom: 44.2,
      }),
    ).toBe(`${44 + FLOATING_PILL_NAV_TOP_GAP_PX + 1}px`);
  });

  it("reserves the full mobile rail without adding a desktop gap", () => {
    expect(
      resolveFloatingPillNavTopInset({
        edge: "top",
        isMobile: true,
        isDragging: false,
        top: 0,
        bottom: 58,
      }),
    ).toBe("58px");
  });

  it("only clears the inset when a desktop pill no longer overlaps the header", () => {
    expect(
      resolveFloatingPillNavTopInset({
        edge: "right",
        isMobile: false,
        isDragging: false,
        top: FLOATING_PILL_NAV_HEADER_HEIGHT_PX,
        bottom: 44,
      }),
    ).toBeNull();
    expect(
      resolveFloatingPillNavTopInset({
        edge: "top",
        isMobile: false,
        isDragging: true,
        top: 0,
        bottom: 44,
      }),
    ).toBe(`${44 + FLOATING_PILL_NAV_TOP_GAP_PX}px`);
  });
});
