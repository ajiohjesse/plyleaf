// The four corners of a scanned page in a photo, as fractions (0 to 1) of the photo as shown, from its top-left.
// Pure, so detection, the corner editor and the engine all agree on it.

export type Point = [x: number, y: number];
/** Top-left, top-right, bottom-right, bottom-left: the order MuPDF's warp takes. */
export type Quad = [Point, Point, Point, Point];

export const WHOLE: Quad = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export const CORNER_NAMES = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"] as const;

const distance = ([ax, ay]: Point, [bx, by]: Point) => Math.hypot(ax - bx, ay - by);

/** Puts four points in Quad order: the top-left is the one with the smallest x + y, and so on round. */
export function orderCorners(points: readonly Point[]): Quad {
  const by = (score: (p: Point) => number) => points.reduce((best, p) => (score(p) < score(best) ? p : best));
  return [by(([x, y]) => x + y), by(([x, y]) => y - x), by(([x, y]) => -x - y), by(([x, y]) => x - y)];
}

/** Whether the corners make a convex shape going round clockwise (on screen), so warping it makes sense. */
export function isConvex(quad: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = quad[i]!;
    const [bx, by] = quad[(i + 1) % 4]!;
    const [cx, cy] = quad[(i + 2) % 4]!;
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return sign > 0;
}

/** The page's area as a fraction of the photo (the shoelace formula). */
export function area(quad: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = quad[i]!;
    const [bx, by] = quad[(i + 1) % 4]!;
    sum += ax * by - bx * ay;
  }
  return Math.abs(sum) / 2;
}

/**
 * The size of the straightened page in pixels, for a photo `width` × `height`: as wide as its longer top or bottom
 * edge and as tall as its longer side, scaled down to fit `maxSide`.
 */
export function outputSize(quad: Quad, width: number, height: number, maxSide = 3000) {
  const px = quad.map(([x, y]) => [x * width, y * height] as Point) as Quad;
  const w = Math.max(distance(px[0], px[1]), distance(px[3], px[2]));
  const h = Math.max(distance(px[0], px[3]), distance(px[1], px[2]));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Moves one corner, kept inside the photo. */
export function moveCorner(quad: Quad, index: number, [x, y]: Point): Quad {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return quad.map((p, i) => (i === index ? [clamp(x), clamp(y)] : p)) as Quad;
}
