// Pure helpers for making signatures: finding the ink in a picture, taking the paper out of a photo or scan of one,
// and how big a signature goes on the page.

export type SignatureKind = "signature" | "initials";

/** A box in pixels. */
export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The smallest box round every pixel that shows (alpha above `threshold`) in RGBA `pixels`, `margin` pixels bigger on
 * each side but inside the picture; null when nothing shows.
 */
export function inkBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  { threshold = 8, margin = 0 }: { threshold?: number; margin?: number } = {},
): PixelBox | null {
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3]! <= threshold) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) return null;
  const x = Math.max(0, left - margin);
  const y = Math.max(0, top - margin);
  return { x, y, width: Math.min(width, right + 1 + margin) - x, height: Math.min(height, bottom + 1 + margin) - y };
}

/** Lighter than this (0–255) is paper, and goes; darker than INK stays as it is; in between fades. */
const PAPER = 215;
const INK = 140;

/**
 * Takes the paper out of a photo or scan of a signature, in place: light pixels become transparent, dark ones stay,
 * and those in between fade, so the edges of the strokes stay smooth.
 */
export function clearPaper(pixels: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    const light = 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!;
    if (light >= PAPER) pixels[i + 3] = 0;
    else if (light > INK) pixels[i + 3] = Math.round((pixels[i + 3]! * (PAPER - light)) / (PAPER - INK));
  }
}

/** How tall a signature and initials are put on the page, and the widest they start, in points. */
const PLACED: Record<SignatureKind, { height: number; maxWidth: number }> = {
  signature: { height: 36, maxWidth: 180 },
  initials: { height: 24, maxWidth: 72 },
};

/** The size, in points, a signature `width` × `height` pixels starts at on the page, keeping its shape. */
export function placedSize(width: number, height: number, kind: SignatureKind): { width: number; height: number } {
  const { height: tall, maxWidth } = PLACED[kind];
  const scale = Math.min(tall / height, maxWidth / width);
  return { width: width * scale, height: height * scale };
}

/** The size that fits `width` × `height` inside a box (a signature field), keeping its shape, with a little room. */
export function fittedSize(width: number, height: number, box: { width: number; height: number }) {
  const scale = Math.min(box.width / width, box.height / height) * 0.9;
  return { width: width * scale, height: height * scale };
}
