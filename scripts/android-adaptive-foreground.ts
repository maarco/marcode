#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Host-side asset generation reads and writes files directly.

import * as NodeFS from "node:fs";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";

import { PNG } from "pngjs";

// ── Marcode fork seam ──
// Upstream draws the Android adaptive foreground as its own wordmark SVG and rasterises it with
// rsvg-convert. Marcode has no second drawing of its mark: the foreground is derived from the same
// silhouette Android already uses for the monochrome themed icon, scaled into the adaptive safe
// zone. Keeping one geometry source means the launcher icon cannot drift from the themed icon.

/** Android renders adaptive icons on a 432×432 canvas. */
export const ADAPTIVE_CANVAS_SIZE = 432;
/** Only the centred 264px-diameter circle is guaranteed visible under every launcher mask. */
export const ADAPTIVE_SAFE_ZONE_DIAMETER = 264;

const SOURCE_PATH = "apps/mobile/assets/android-icon-mark.png";
const TARGET_PATH = "apps/mobile/assets/android-icon-foreground.png";

interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Tightest box around every pixel the mark actually paints. */
export function opaqueBounds(png: PNG): Bounds {
  let left = png.width;
  let top = png.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3]! <= 8) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) throw new Error(`${SOURCE_PATH} paints no opaque pixels.`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Largest box with the mark's aspect ratio that still fits inside the safe-zone circle, so the
 * glyph survives circular, squircle, and rounded-square launcher masks alike.
 */
export function safeZoneFit(bounds: Bounds): { readonly width: number; readonly height: number } {
  const diagonal = Math.hypot(bounds.width, bounds.height);
  const scale = ADAPTIVE_SAFE_ZONE_DIAMETER / diagonal;
  return { width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale) };
}

/** Box-filter downscale of the source alpha, painted white onto a transparent canvas. */
export function renderAdaptiveForeground(source: PNG): PNG {
  const bounds = opaqueBounds(source);
  const { width, height } = safeZoneFit(bounds);
  const originX = Math.round((ADAPTIVE_CANVAS_SIZE - width) / 2);
  const originY = Math.round((ADAPTIVE_CANVAS_SIZE - height) / 2);
  const target = new PNG({ width: ADAPTIVE_CANVAS_SIZE, height: ADAPTIVE_CANVAS_SIZE });
  target.data.fill(0);

  for (let y = 0; y < height; y += 1) {
    const sourceTop = bounds.top + (y * bounds.height) / height;
    const sourceBottom = bounds.top + ((y + 1) * bounds.height) / height;
    for (let x = 0; x < width; x += 1) {
      const sourceLeft = bounds.left + (x * bounds.width) / width;
      const sourceRight = bounds.left + ((x + 1) * bounds.width) / width;
      let weighted = 0;
      let area = 0;
      for (
        let sy = Math.floor(sourceTop);
        sy < Math.min(Math.ceil(sourceBottom), source.height);
        sy += 1
      ) {
        const coverY = Math.min(sy + 1, sourceBottom) - Math.max(sy, sourceTop);
        if (coverY <= 0) continue;
        for (
          let sx = Math.floor(sourceLeft);
          sx < Math.min(Math.ceil(sourceRight), source.width);
          sx += 1
        ) {
          const coverX = Math.min(sx + 1, sourceRight) - Math.max(sx, sourceLeft);
          if (coverX <= 0) continue;
          const coverage = coverX * coverY;
          weighted += source.data[(sy * source.width + sx) * 4 + 3]! * coverage;
          area += coverage;
        }
      }
      const offset = ((originY + y) * ADAPTIVE_CANVAS_SIZE + originX + x) * 4;
      target.data[offset] = 255;
      target.data[offset + 1] = 255;
      target.data[offset + 2] = 255;
      target.data[offset + 3] = area > 0 ? Math.round(weighted / area) : 0;
    }
  }
  return target;
}

if (NodeProcess.argv[1] === NodeURL.fileURLToPath(import.meta.url)) {
  const source = PNG.sync.read(NodeFS.readFileSync(SOURCE_PATH));
  NodeFS.writeFileSync(TARGET_PATH, PNG.sync.write(renderAdaptiveForeground(source)));
  NodeProcess.stdout.write(`Wrote ${TARGET_PATH}\n`);
}
