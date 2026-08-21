import { describe, expect, it } from "vite-plus/test";

import {
  clearFloatingShellGeometry,
  getFloatingShellGeometry,
  publishFloatingShellGeometry,
  subscribeFloatingShellGeometry,
} from "./floatingShellGeometry";

const rect = { top: 0, left: 100, right: 300, bottom: 60, width: 200, height: 60 };

describe("floating shell geometry", () => {
  it("publishes only settled changes and notifies subscribers", () => {
    clearFloatingShellGeometry();
    let notifications = 0;
    const unsubscribe = subscribeFloatingShellGeometry(() => {
      notifications += 1;
    });

    const first = publishFloatingShellGeometry({
      rect,
      edge: "top",
      scale: 1,
      isMobile: false,
    });
    const same = publishFloatingShellGeometry({
      rect: { ...rect },
      edge: "top",
      scale: 1,
      isMobile: false,
    });
    const second = publishFloatingShellGeometry({
      rect: { ...rect, bottom: 68, height: 68 },
      edge: "top",
      scale: 1,
      isMobile: false,
    });

    expect(same).toBe(first);
    expect(second.version).toBe(first.version + 1);
    expect(notifications).toBe(2);
    expect(getFloatingShellGeometry()).toBe(second);

    unsubscribe();
    clearFloatingShellGeometry();
    expect(getFloatingShellGeometry()).toBeNull();
  });
});
