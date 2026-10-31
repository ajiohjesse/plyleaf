// Crop PDF: the crop frame as fractions of the page (Crop, from the engine's types), moved and resized by dragging or
// set by typing margins. Pure, so the frame's rules are unit-tested without a browser.
import type { Crop } from "~/engine/types";

export const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };
/** The smallest the frame gets on either side, as a fraction of the page. */
export const MIN_SIDE = 0.05;

/** What dragging grabbed: the frame itself, or one of its edges or corners. */
export type Grip = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The frame after dragging `grip` by (dx, dy), as fractions of the page. It stays on the page and at least MIN_SIDE. */
export function dragCrop(start: Crop, grip: Grip, dx: number, dy: number): Crop {
  if (grip === "move") {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.width),
      y: clamp(start.y + dy, 0, 1 - start.height),
    };
  }
  let { x, y, width, height } = start;
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  if (grip.includes("w")) {
    x = clamp(start.x + dx, 0, right - MIN_SIDE);
    width = right - x;
  }
  if (grip.includes("e")) width = clamp(start.width + dx, MIN_SIDE, 1 - start.x);
  if (grip.includes("n")) {
    y = clamp(start.y + dy, 0, bottom - MIN_SIDE);
    height = bottom - y;
  }
  if (grip.includes("s")) height = clamp(start.height + dy, MIN_SIDE, 1 - start.y);
  return { x, y, width, height };
}

/** Margins cut from each side, as fractions of the page. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function marginsOf(crop: Crop): Margins {
  return {
    top: crop.y,
    right: 1 - crop.x - crop.width,
    bottom: 1 - crop.y - crop.height,
    left: crop.x,
  };
}

/** The frame for these margins, or null if they don't leave at least MIN_SIDE of the page each way. */
export function cropFromMargins({ top, right, bottom, left }: Margins): Crop | null {
  if (![top, right, bottom, left].every((m) => Number.isFinite(m) && m >= 0)) return null;
  const width = 1 - left - right;
  const height = 1 - top - bottom;
  if (width < MIN_SIDE - 1e-9 || height < MIN_SIDE - 1e-9) return null;
  return { x: left, y: top, width, height };
}

/** The frame leaves the whole page, so cropping would change nothing. */
export const isFull = (crop: Crop) => crop.width >= 1 - 1e-6 && crop.height >= 1 - 1e-6;
