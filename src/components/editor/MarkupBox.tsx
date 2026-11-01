import type { Quad } from "~/engine/types";
import { quadBounds, toHex, type MarkupItem } from "~/editor/items";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: MarkupItem;
  scale: number;
  selected: boolean;
}

export const MARKUP_NAMES: Record<MarkupItem["style"], string> = {
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "Strike out",
};

/** One line of marked-up text, as the reader will show it: a highlight, or a line under or through it. */
function Line({ quad, item, origin, scale }: { quad: Quad; item: MarkupItem; origin: Quad; scale: number }) {
  const [x0, y0, x1, y1] = quadBounds([quad]);
  const box = { left: (x0 - origin[0]) * scale, top: (y0 - origin[1]) * scale, width: (x1 - x0) * scale };
  const height = (y1 - y0) * scale;
  const colour = toHex(item.color);
  const thickness = Math.max(1, height * 0.07);
  if (item.style === "highlight") {
    return (
      <span
        className="pointer-events-auto absolute mix-blend-multiply"
        style={{ ...box, height, backgroundColor: colour, opacity: 0.6 }}
      />
    );
  }
  // A line under the text, or through its middle; the span covers the whole line so it's easy to press.
  return (
    <span className="pointer-events-auto absolute" style={{ ...box, height }}>
      <span
        className="absolute inset-x-0"
        style={{
          top: item.style === "underline" ? height * 0.92 - thickness : height * 0.55 - thickness / 2,
          height: thickness,
          backgroundColor: colour,
        }}
      />
    </span>
  );
}

/**
 * Marked-up text: a highlight, underline or strike-out over one or more lines. It stays where the text is, so it can
 * be selected, restyled or deleted but not moved.
 */
export function MarkupBox({ item, scale, selected, ...handlers }: Props) {
  const gestures = useItemGestures(item, scale, selected, handlers);
  const [x0, y0, x1, y1] = quadBounds(item.quads);
  const origin: Quad = [x0, y0, 0, 0, 0, 0, 0, 0];
  return (
    <button
      type="button"
      data-item={item.id}
      data-kind="markup"
      aria-label={`${MARKUP_NAMES[item.style]}: ${item.text}`}
      aria-pressed={selected}
      // Only the lines take presses, so text between them can still be selected.
      className="pointer-events-none absolute block border-0 bg-transparent p-0 select-none"
      style={{ left: x0 * scale, top: y0 * scale, width: (x1 - x0) * scale, height: (y1 - y0) * scale }}
      {...gestures}
    >
      {item.quads.map((quad, i) => (
        <Line key={i} quad={quad} item={item} origin={origin} scale={scale} />
      ))}
      {selected && <SelectionFrame />}
    </button>
  );
}
