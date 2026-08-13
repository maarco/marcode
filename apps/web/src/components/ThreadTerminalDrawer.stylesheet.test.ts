/**
 * Pins xterm.js's own stylesheet import in `ThreadTerminalDrawer.tsx`.
 *
 * Marcode went a long time without importing `@xterm/xterm/css/xterm.css` at
 * all. Nothing crashed and nothing type-errored: xterm.js draws terminal
 * text on canvas, so the missing stylesheet never touched rendered output.
 * What it *does* style is xterm's own internal scaffolding — a char-width
 * measurement scratchpad, the offscreen IME helper textarea, the
 * composition-view popup — normally hidden via `visibility: hidden` /
 * `position: absolute`. Without the stylesheet those elements render inline
 * with default browser styles instead: the char-measure scratchpad renders
 * 32 repeats of a probe character per font weight/style variant, in plain
 * view, above the first prompt. That is the "333...MMM garbage at terminal
 * startup" bug — not a data/PTY bug, a missing stylesheet.
 *
 * Losing this import again reproduces that bug silently: no crash, no type
 * error, just garbage text the next time a terminal measures a new glyph.
 * These assertions keep that failure loud and cheap to diagnose.
 */
import { describe, expect, it } from "vite-plus/test";

import threadTerminalDrawerSource from "./ThreadTerminalDrawer.tsx?raw";

describe("ThreadTerminalDrawer xterm stylesheet import", () => {
  it("imports xterm's own stylesheet", () => {
    expect(threadTerminalDrawerSource).toContain('import "@xterm/xterm/css/xterm.css"');
  });
});

// Asserting on the stylesheet's *contents* was tried and removed: under the
// test transform Vite routes `.css` through its CSS pipeline, so both `?raw`
// and `?inline` hand the test an empty string and the assertion passes or
// fails for reasons unrelated to xterm. The import above is the real guard —
// losing it is the regression; upstream deleting their own hiding rule is not
// a failure mode worth a test that cannot actually read the file.
