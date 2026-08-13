import { describe, expect, it } from "vite-plus/test";

import { FLOATING_SURFACE_Z, portalOverlayStyle } from "./floating-surface-z";

// Upstream fixes this stacking order by bumping a `z-*` utility class on the
// tooltip positioner (they went z-70 -> z-[140] in pingdotgg/t3code#6241).
// Marcode drives portaled overlay stacking from this scale instead, as inline
// styles, so their class change has nothing to land on and gets dropped at every
// sync. These assertions are what makes that safe: if the tiers ever collapse or
// invert, this fails loudly rather than silently re-introducing the bug upstream
// already fixed on their side.
describe("portaled overlay stacking", () => {
  it("keeps tooltips above the other portaled overlays", () => {
    expect(FLOATING_SURFACE_Z.portalOverlayTooltip).toBeGreaterThan(
      FLOATING_SURFACE_Z.portalOverlay,
    );
  });

  it("keeps every portaled overlay below the always-on-top pill nav", () => {
    expect(FLOATING_SURFACE_Z.portalOverlayTooltip).toBeLessThan(FLOATING_SURFACE_Z.pillNav);
    expect(FLOATING_SURFACE_Z.portalOverlay).toBeLessThan(FLOATING_SURFACE_Z.pillNav);
  });

  it("keeps portaled overlays above the floating application panels", () => {
    expect(FLOATING_SURFACE_Z.portalOverlay).toBeGreaterThan(FLOATING_SURFACE_Z.terminalPanel);
    expect(FLOATING_SURFACE_Z.portalOverlay).toBeGreaterThan(FLOATING_SURFACE_Z.codePanel);
  });

  it("lets a caller override the default overlay tier through style", () => {
    expect(portalOverlayStyle({ zIndex: FLOATING_SURFACE_Z.portalOverlayTooltip })).toEqual({
      zIndex: FLOATING_SURFACE_Z.portalOverlayTooltip,
    });
  });

  it("applies the default overlay tier when no style is given", () => {
    expect(portalOverlayStyle()).toEqual({ zIndex: FLOATING_SURFACE_Z.portalOverlay });
  });
});
