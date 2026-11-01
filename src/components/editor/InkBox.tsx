import { toHex, type InkItem } from "~/editor/items";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: InkItem;
  scale: number;
  selected: boolean;
}

/** A stroke as an SVG path in page points. */
export function inkPath(points: readonly { x: number; y: number }[]) {
  return points.map((point, i) => `${i === 0 ? "M" : "L"}${point.x},${point.y}`).join("");
}

/**
 * A freehand stroke. Only the stroke itself (and a finger's width round it) takes presses, so what's under its bounding
 * box can still be reached; selected, it's moved by dragging or the arrow keys.
 */
export function InkBox({ item, scale, selected, ...handlers }: Props) {
  const gestures = useItemGestures(item, scale, selected, handlers);
  const xs = item.points.map((p) => p.x);
  const ys = item.points.map((p) => p.y);
  const pad = item.width / 2 + 8 / scale;
  const box = {
    left: Math.min(...xs) - pad,
    top: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + pad * 2,
    height: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
  const d = inkPath(item.points);
  return (
    <button
      type="button"
      data-item={item.id}
      data-kind="ink"
      aria-label="Drawing"
      aria-pressed={selected}
      className="pointer-events-none absolute block border-0 bg-transparent p-0 select-none"
      style={{
        left: box.left * scale,
        top: box.top * scale,
        width: box.width * scale,
        height: box.height * scale,
        touchAction: "none",
      }}
      {...gestures}
    >
      <svg
        aria-hidden="true"
        className="block size-full overflow-visible"
        viewBox={`${box.left} ${box.top} ${box.width} ${box.height}`}
      >
        <path
          d={d}
          fill="none"
          stroke={toHex(item.color)}
          strokeOpacity={item.opacity}
          strokeWidth={item.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
        {/* What takes presses: the stroke, made wide enough to hit. */}
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={item.width + 16 / scale}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-auto cursor-move"
          style={{ pointerEvents: "stroke" }}
        />
      </svg>
      {selected && <SelectionFrame />}
    </button>
  );
}
