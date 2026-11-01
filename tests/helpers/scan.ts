// A made-up photo of a sheet of paper for scan tests: a dark, slightly noisy desk with a white page lying at an angle,
// a red block in the page's top-left quarter and a few lines of dark "text". Pure, so Vitest and Playwright share it.
import * as mupdf from "mupdf";
import type { Bitmap } from "~/engine/types";
import type { Quad } from "~/scan/quad";

/** Where the page lies in the default photo, as fractions: tilted, and narrower at the top (seen from an angle). */
export const PAGE: Quad = [
  [0.22, 0.12],
  [0.74, 0.16],
  [0.8, 0.9],
  [0.16, 0.86],
];

export function scanPhoto(width = 480, height = 360, quad: Quad = PAGE): Bitmap {
  const pixels = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 21) - 10;
  for (let i = 0; i < width * height; i++) pixels.set([70 + noise(), 62 + noise(), 58 + noise(), 255], i * 4);
  // A point of the page (u across, v down) in the photo, by interpolating its corners.
  const at = (u: number, v: number) => {
    const [[ax, ay], [bx, by], [cx, cy], [dx, dy]] = quad;
    const top = [ax + (bx - ax) * u, ay + (by - ay) * u];
    const bottom = [dx + (cx - dx) * u, dy + (cy - dy) * u];
    return [(top[0]! + (bottom[0]! - top[0]!) * v) * width, (top[1]! + (bottom[1]! - top[1]!) * v) * height];
  };
  const steps = 3 * Math.max(width, height);
  for (let j = 0; j <= steps; j++) {
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const v = j / steps;
      const [x, y] = at(u, v);
      const i = (Math.min(height - 1, Math.floor(y!)) * width + Math.min(width - 1, Math.floor(x!))) * 4;
      const red = u > 0.1 && u < 0.4 && v > 0.08 && v < 0.3;
      const text = u > 0.1 && u < 0.9 && v > 0.5 && v < 0.8 && Math.floor(v * 40) % 3 === 0;
      pixels.set(red ? [220, 30, 30, 255] : text ? [40, 40, 40, 255] : [245, 243, 238, 255], i);
    }
  }
  return { width, height, pixels };
}

/** The photo as a PNG file's bytes, for E2E. */
export function scanPhotoPng(width?: number, height?: number, quad?: Quad): Uint8Array<ArrayBuffer> {
  const { width: w, height: h, pixels } = scanPhoto(width, height, quad);
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
  const target = pixmap.getPixels();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = (y * w + x) * 4;
      target.set(pixels.subarray(from, from + 3), y * pixmap.getStride() + x * 3);
    }
  }
  const png = new Uint8Array(pixmap.asPNG());
  pixmap.destroy();
  return png;
}
