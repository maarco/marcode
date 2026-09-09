import { describe, expect, it } from "vite-plus/test";

import {
  FLOATING_PILL_NAV_TOP_GAP_PX,
  resolveFloatingPillNavTopInset,
} from "./floatingShellLayout";

describe("resolveFloatingPillNavTopInset", () => {
  it("reserves the measured capsule plus the desktop breathing room", () => {
    expect(
      resolveFloatingPillNavTopInset({
        edge: "top",
        isMobile: false,
        isDragging: false,
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
        bottom: 58,
      }),
    ).toBe("58px");
  });

  it("does not move headers for a side-docked or actively dragged pill", () => {
    expect(
      resolveFloatingPillNavTopInset({
        edge: "right",
        isMobile: false,
        isDragging: false,
        bottom: 44,
      }),
    ).toBeNull();
    expect(
      resolveFloatingPillNavTopInset({
        edge: "top",
        isMobile: false,
        isDragging: true,
        bottom: 44,
      }),
    ).toBeNull();
  });
});
