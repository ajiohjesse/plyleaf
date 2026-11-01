// Geometry shared by the editor (which shows shapes) and the engine (which draws them), so both agree.

export interface Point {
  x: number;
  y: number;
}

/** Bézier control distance for a quarter of a circle of radius 1. */
export const KAPPA = 0.5523;

/** An arrowhead's length for a line this wide. */
export const arrowLength = (lineWidth: number) => Math.max(8, lineWidth * 4);

/**
 * A line from (x, y) by (width, height): where its stroke ends and, for an arrow, the arrowhead's three corners (the
 * tip first). The stroke stops inside the head so its round cap doesn't poke out past the point. Null for a line of no
 * length.
 */
export function lineGeometry(
  x: number,
  y: number,
  width: number,
  height: number,
  lineWidth: number,
  arrow: boolean,
): { end: Point; head: [Point, Point, Point] | null } | null {
  const length = Math.hypot(width, height);
  if (length === 0) return null;
  const tip = { x: x + width, y: y + height };
  const along = { x: width / length, y: height / length };
  const size = arrow ? Math.min(arrowLength(lineWidth), length) : 0;
  const end = { x: tip.x - along.x * size * 0.8, y: tip.y - along.y * size * 0.8 };
  if (!arrow) return { end: tip, head: null };
  const base = { x: tip.x - along.x * size, y: tip.y - along.y * size };
  const side = { x: -along.y * size * 0.5, y: along.x * size * 0.5 };
  return {
    end,
    head: [tip, { x: base.x + side.x, y: base.y + side.y }, { x: base.x - side.x, y: base.y - side.y }],
  };
}
