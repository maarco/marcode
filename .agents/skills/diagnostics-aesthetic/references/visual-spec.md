# diagnostics aesthetic visual spec

This reference describes the stable visual language measured from the live Marcode route at `http://localhost:5733/settings/diagnostics` on 2026-08-21. It is a reconstruction guide, not a telemetry contract.

## typography

```css
--font-sans:
  "Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
--font-mono:
  "JetBrains Mono", "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
```

Use `@fontsource-variable/inter/index.css` and the 400/500 JetBrains Mono faces in a standalone Vite project. The live page resolves interface text to `Inter Variable`; an empty `document.fonts` collection is not proof that the fallback stack is correct, so inspect the loaded CSS and computed `font-family` together.

| role             |    size |  weight | line height |                 tracking |
| ---------------- | ------: | ------: | ----------: | -----------------------: |
| body             |    16px |     400 |        24px |                   normal |
| section heading  |    18px |     600 |        28px |                 -0.025em |
| compact metadata | 10–11px |     600 |     15–16px |              0.08–0.14em |
| table body       |    12px |     400 |        16px |                   normal |
| telemetry value  |    18px | 500–600 |        23px | slight negative tracking |

## dark palette

These are the live computed values for the Marcode dark palette:

```css
--background: oklch(0.13 0 0);
--foreground: oklch(0.97 0 0);
--card: oklch(0.17 0 0);
--muted: oklch(0.22 0 0);
--accent: oklch(0.25 0 0);
--muted-foreground: oklch(0.65 0 0);
--border: oklch(1 0 0 / 8%);
--primary: oklch(0.65 0.18 250);
--success: oklch(69.6% 0.17 162.48);
--warning: oklch(76.9% 0.188 70.08);
--danger: oklch(70.4% 0.191 22.216);
--radius: 0.375rem;
```

The page is intentionally almost monochrome. Blue, green, amber, and red are reserved for links, healthy state, thresholds, and failures. Avoid using accent colors as large backgrounds.

## texture and surfaces

The live route uses a 128px grayscale procedural grain tile at approximately 2.745% opacity:

```css
--surface-grain: url("data:image/svg+xml,%3Csvg viewBox='0 0 128 128'
  xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E
  %3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'
  stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25'
  filter='url(%23n)' opacity='0.02745'/%3E%3C/svg%3E");
background-image: var(--surface-grain);
background-repeat: repeat;
background-size: 128px 128px;
```

The most common grouped surface is:

```css
border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
border-radius: 16px;
background: var(--card);
box-shadow:
  0 1px 1px rgb(0 0 0 / 3%),
  0 8px 30px rgb(0 0 0 / 3.5%);
```

Use a bottom border between card header and metrics. Metric tiles use divider lines, not individual backgrounds. Tables use 1px row separators, 10px uppercase headers, and monospace values for stable columns.

## page geometry

- The live content column measured about 1151px wide inside a 2000px browser viewport.
- The standalone extraction uses a 1152px content cap, 32px desktop side padding, 16px mobile side padding, and 48px major-section gaps.
- Section headers have 12px horizontal inset. Header actions are quiet and right aligned.
- Cards use 16px radius even though the base control radius is 6px. Buttons and icon controls stay at 4–6px radius.
- The first telemetry card has an intro strip, a metric grid, and a three-column aggregate footer. Host state and collection health use a two-column card that stacks on mobile.

## interaction and motion

- Hover changes are tonal: `var(--accent)` background or slightly brighter text.
- Refresh controls can receive a short pressed state; no continuously repainting animation is part of the aesthetic.
- Loading and unavailable states are quiet text or dashed inset boxes, not oversized skeletons.
- Process kill controls are visually subordinate and must remain wired to the host product's confirmation path when the visual system is applied to live code.

## sibling checks

When applying this system to another diagnostics-like surface, check all of these together:

- page shell and breadcrumb
- section heading/action alignment
- stat grid divider geometry
- telemetry card header and aggregate footer
- host/collection split card
- chart controls and local horizontal table scrolling
- process table signal controls
- failure/trace tables
- 390px and 820px wrapping behavior
