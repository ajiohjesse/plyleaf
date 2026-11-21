// What holding Shift does while drawing or resizing (D-044's Shift rules), as plain geometry.

/** Lines and arrows snap to this many degrees with Shift. */
export const SNAP_DEGREES = 15;

/** The same length, turned to the nearest multiple of `degrees`. */
export function snapAngle(dx: number, dy: number, degrees = SNAP_DEGREES): { dx: number; dy: number } {
  const length = Math.hypot(dx, dy);
  if (length === 0) return { dx, dy };
  const step = (degrees * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { dx: tidy(Math.cos(angle) * length), dy: tidy(Math.sin(angle) * length) };
}

/** A drag from a corner made square: both sides as long as the longer one, in the directions dragged. */
export function square(dx: number, dy: number): { dx: number; dy: number } {
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { dx: (dx < 0 ? -1 : 1) * side, dy: (dy < 0 ? -1 : 1) * side };
}

/**
 * A size with the width-to-height `ratio`, from the size the pointer asks for: the side that changed more leads, so
 * the box follows the pointer whichever way it goes.
 */
export function keepRatio(width: number, height: number, ratio: number): { width: number; height: number } {
  const w = Math.max(width, Number.EPSILON);
  const h = Math.max(height, Number.EPSILON);
  return w / h > ratio ? { width: w, height: w / ratio } : { width: h * ratio, height: h };
}

/** Rounds away float dust (cos 90° isn't quite 0), so snapped lines are exactly level or upright. */
const tidy = (value: number) => Math.round(value * 1e6) / 1e6;
