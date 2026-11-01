// Finds a sheet of paper in a photo: the paper is usually lighter than what it lies on. The photo (downscaled to a few
// hundred pixels) is blurred and split into light and dark at Otsu's threshold; the light region at the centre (or
// the largest one) is the page, and its corners are its extreme points along the diagonals. Good enough to start
// from: the user can always drag the corners. Pure, so it runs anywhere and is unit-tested.
import { area, isConvex, orderCorners, type Point, type Quad } from "./quad";

/** Greyscale (0–255), row by row. */
export interface Grey {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/** Luma from RGBA pixels, scaled down so the longer side is at most `maxSide` (by averaging blocks). */
export function greyFromRgba(
  { width, height, pixels }: { width: number; height: number; pixels: Uint8ClampedArray | Uint8Array },
  maxSide = 320,
): Grey {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / maxSide));
  const w = Math.max(1, Math.floor(width / step));
  const h = Math.max(1, Math.floor(height / step));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < step; dy++) {
        let i = ((y * step + dy) * width + x * step) * 4;
        for (let dx = 0; dx < step; dx++, i += 4) {
          sum += 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!;
        }
      }
      out[y * w + x] = Math.round(sum / (step * step));
    }
  }
  return { width: w, height: h, pixels: out };
}

/** A box blur of radius `r`, twice (close to a Gaussian), to smooth out text and noise. */
function blur({ width, height, pixels }: Grey, r: number): Uint8Array {
  let from = Float32Array.from(pixels);
  let to = new Float32Array(from.length);
  for (let pass = 0; pass < 4; pass++) {
    const horizontal = pass % 2 === 0;
    const [outer, inner] = horizontal ? [height, width] : [width, height];
    for (let o = 0; o < outer; o++) {
      const at = (i: number) => (horizontal ? o * width + i : i * width + o);
      let sum = 0;
      let count = 0;
      for (let i = 0; i <= Math.min(r, inner - 1); i++) {
        sum += from[at(i)]!;
        count++;
      }
      for (let i = 0; i < inner; i++) {
        to[at(i)] = sum / count;
        const leaving = i - r;
        const entering = i + r + 1;
        if (leaving >= 0) {
          sum -= from[at(leaving)]!;
          count--;
        }
        if (entering < inner) {
          sum += from[at(entering)]!;
          count++;
        }
      }
    }
    [from, to] = [to, from];
  }
  return Uint8Array.from(from, Math.round);
}

/** Otsu's threshold: the grey level that best splits the histogram into two classes. */
export function otsu(pixels: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  for (const p of pixels) histogram[p]!++;
  const total = pixels.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i]!;
  let sumBelow = 0;
  let below = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    below += histogram[t]!;
    if (below === 0) continue;
    const above = total - below;
    if (above === 0) break;
    sumBelow += t * histogram[t]!;
    const meanBelow = sumBelow / below;
    const meanAbove = (sumAll - sumBelow) / above;
    const between = below * above * (meanBelow - meanAbove) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Labels the 4-connected regions of `mask`; returns each pixel's region (0 = none) and each region's size. */
function regions(mask: Uint8Array, width: number) {
  const labels = new Int32Array(mask.length);
  const sizes = [0];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const label = sizes.length;
    let size = 0;
    labels[start] = label;
    stack.push(start);
    while (stack.length > 0) {
      const i = stack.pop()!;
      size++;
      const x = i % width;
      const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const n of neighbours) {
        if (n >= 0 && n < mask.length && mask[n] && !labels[n]) {
          labels[n] = label;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/**
 * The page's corners in a greyscale photo, as fractions of its size, or null when nothing page-like stands out (then
 * the whole photo is the page).
 */
export function detectDocument(grey: Grey): Quad | null {
  const { width, height } = grey;
  if (width < 16 || height < 16) return null;
  const smooth = blur(grey, Math.max(1, Math.round(Math.min(width, height) / 80)));
  const threshold = otsu(smooth);
  const mask = smooth.map((p) => (p > threshold ? 1 : 0));
  const { labels, sizes } = regions(mask, width);
  if (sizes.length < 2) return null;
  // The light region under the centre, if there is one; otherwise the largest.
  const centre = labels[Math.floor(height / 2) * width + Math.floor(width / 2)]!;
  const largest = sizes.reduce((best, size, label) => (size > sizes[best]! ? label : best), 1);
  const page = centre && sizes[centre]! >= sizes[largest]! / 4 ? centre : largest;

  const points: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // Only the region's edge pixels can be its corners.
      if (labels[i] !== page) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        labels[i - 1] !== page ||
        labels[i + 1] !== page ||
        labels[i - width] !== page ||
        labels[i + width] !== page;
      if (edge) points.push([(x + 0.5) / width, (y + 0.5) / height]);
    }
  }
  const quad = orderCorners(points);
  const size = area(quad);
  // Too small to be the page, or the whole frame (nothing to straighten).
  if (!isConvex(quad) || size < 0.1 || size > 0.97) return null;
  return quad;
}
