import { MAX_TICK_SIZE, MIN_TICK_SIZE, toHex, type TickItem } from "~/editor/items";
import { tickLines, tickWidth, type TickSymbol } from "~/editor/shapes";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { growKey } from "./ImageBox";
import { SelectionFrame } from "./SelectionFrame";

export const TICK_NAMES: Record<TickSymbol, string> = { check: "Check mark", cross: "Cross", dot: "Dot" };

interface Props extends ItemHandlers {
  item: TickItem;
  scale: number;
  selected: boolean;
  onResize: (width: number, height: number) => void;
}

/** A tick's look, drawn from the same lines the PDF gets. */
export function TickFace({ symbol, size, color }: Pick<TickItem, "symbol" | "size" | "color">) {
  const colour = toHex(color);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="block size-full overflow-visible">
      {symbol === "dot" ? (
        <circle cx={size / 2} cy={size / 2} r={size / 4} fill={colour} />
      ) : (
        tickLines(symbol, 0, 0, size).map(([from, to], i) => (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={colour}
            strokeWidth={tickWidth(size)}
            strokeLinecap="round"
          />
        ))
      )}
    </svg>
  );
}

/** A tick in a box of a flat form: moved by dragging or arrows, made bigger or smaller with + and −. */
export function TickBox({ item, scale, selected, onResize, ...handlers }: Props) {
  const gestures = useItemGestures(item, scale, selected, handlers);
  const side = item.size * scale;
  return (
    <button
      type="button"
      data-item={item.id}
      data-kind="tick"
      aria-label={TICK_NAMES[item.symbol]}
      aria-pressed={selected}
      className="absolute block cursor-move border-0 bg-transparent p-0 select-none"
      style={{ left: item.x * scale, top: item.y * scale, width: side, height: side, touchAction: "none" }}
      {...gestures}
      onKeyDown={(event) => {
        const grow = growKey(event.key);
        if (!grow) return gestures.onKeyDown(event);
        event.preventDefault();
        const size = Math.min(MAX_TICK_SIZE, Math.max(MIN_TICK_SIZE, item.size * grow));
        onResize(size, size);
        handlers.onMoveEnd();
      }}
    >
      <TickFace {...item} />
      {selected && <SelectionFrame />}
    </button>
  );
}
