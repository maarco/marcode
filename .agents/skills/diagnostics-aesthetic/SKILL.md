---
name: diagnostics-aesthetic
description: Recreate or extend Marcode's dark diagnostics visual system, including its typography, grain texture, panel geometry, telemetry tables, and responsive behavior.
---

# Diagnostics Aesthetic

Use this skill when a page, prototype, or standalone app should feel like the live Marcode diagnostics surface at `/settings/diagnostics`. The target is the visual system and interaction rhythm, not a copy of the telemetry backend.

## Source of truth

- Live reference: `http://localhost:5733/settings/diagnostics`.
- Standalone extraction: `/Users/malmazan/dev/diagnostics/src/main.ts` and `/Users/malmazan/dev/diagnostics/src/styles.css`.
- Marcode producers: `apps/web/src/components/settings/DiagnosticsSettings.tsx`, `apps/web/src/components/settings/ResourceTelemetryDiagnostics.tsx`, `apps/web/src/components/settings/settingsLayout.tsx`, `apps/web/src/index.css`, and `apps/web/src/appearanceFonts.ts`.
- Read [references/visual-spec.md](references/visual-spec.md) before making a substantial visual change. It records the measured live values and the stable design rules.

If the live route, computed styles, and old notes disagree, inspect the route and computed styles again. Do not treat a screenshot or a prose recap as authoritative by itself.

## Visual contract

- Keep the canvas near-black and quiet: `oklch(0.13 0 0)` background, `oklch(0.17 0 0)` card, `oklch(0.22 0 0)` muted surface, and an 8% white border.
- Use Inter Variable for interface copy and JetBrains Mono for values, PIDs, durations, rates, and other telemetry identifiers. Load the local font packages before writing fallback-only CSS.
- Use compact all-caps metadata at 10–11px with approximately `0.08em`–`0.14em` tracking. Headings are 18px/28px, semibold, with `-0.025em` tracking.
- Use 16px rounded cards for grouped surfaces, subtle 1px borders, and restrained shadows. A card may have a soft horizontal tint, but it should not become a glossy glass panel.
- Apply the small grayscale grain as a repeated surface background. Keep it baked into the surface instead of adding a fixed animated overlay.
- Keep controls micro-sized, rectangular, and low-contrast: 20px icon buttons, 4–6px radii, 150ms transitions, no perpetual motion. Status dots are static unless the actual product state requires motion.
- Preserve the information hierarchy: section heading → quiet header action → bordered card/table → monospace values. Do not make telemetry values decorative or overly colorful.

## Layout and responsive rules

- Center the content in a max-width of roughly 1152px. Desktop content uses about 32px horizontal padding and 48px between major sections.
- Section headers use a 12px inset; their title and action remain on one line while there is room.
- Use 2-column metric grids on narrow widths and 3–4 columns when the viewport supports them. Preserve divider lines rather than adding card-by-card shadows.
- Tables may keep a deliberate minimum width, but the overflow belongs in a local `.table-scroll` wrapper. Never let a wide telemetry table create page-level horizontal scrolling.
- Validate at 390px and 820px. On the standalone app the sidebar disappears below 900px, the mobile topbar appears, two-column cards stack, and section actions can wrap below their headings.

## Data and interaction boundary

The standalone project uses clearly labeled static fixtures. Keep the `Static visual extraction` / `no backend connection` wording unless real data wiring is added. When adapting the style to a live product, status labels, counts, timestamps, and health states must come from the real producer; do not preserve fixture values as if they were telemetry.

Keep the interaction surface small and honest: range controls can change the chart fixture, refresh can update the visible timestamp, and buttons that do not have a real action should not imply one. Any destructive process action needs the host product's existing confirmation and signal semantics.

## Verification

For the standalone project:

1. Run `cd /Users/malmazan/dev/diagnostics && pnpm build`.
2. Start it with `cd /Users/malmazan/dev/diagnostics && pnpm dev` and inspect `http://localhost:5735/` in a controlled browser.
3. Capture desktop, 820px, and 390px states. Check grain, type weight, panel contrast, table containment, and section-action wrapping.

For a change to Marcode's real settings route, use the repo's normal isolated app verification and compare the actual `/settings/diagnostics` route at the same widths. Do not claim visual parity from a successful build alone.
