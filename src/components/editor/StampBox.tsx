import { useRef } from "react";
import { MIN_STAMP_WIDTH, STAMP_RATIO, STAMPS, stampLabel, toHex, type StampItem } from "~/editor/items";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { growKey } from "./ImageBox";
import { ResizeHandle } from "./ResizeHandle";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: StampItem;
  scale: number;
  selected: boolean;
  onResize: (width: number, height: number) => void;
}

/** Its words in a box, as MuPDF draws a stamp: a serif bold face, scaled to fit, inside a border. */
function StampFace({ item, width }: { item: StampItem; width: number }) {
  const height = width * STAMP_RATIO;
  const label = stampLabel(item.name);
  const colour = toHex(item.color);
  const border = height * 0.03;
  // Bold Times is about 0.62 em a character. MuPDF sets a standard stamp's words larger than words of your own; both
  // shrink to fit the width.
  const standard = STAMPS.some((stamp) => stamp.name === item.name);
  const size = Math.min(height * (standard ? 0.6 : 0.42), (width * 0.88) / Math.max(1, label.length * 0.62));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block size-full">
      <rect
        x={border / 2}
        y={border / 2}
        width={width - border}
        height={height - border}
        rx={border}
        fill="none"
        stroke={colour}
        strokeWidth={border}
      />
      <text
        x={width / 2}
        y={height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={colour}
        fontFamily="'Times New Roman', Times, 'Liberation Serif', serif"
        fontWeight={700}
        fontSize={size}
      >
        {label}
      </text>
    </svg>
  );
}

/** A rubber stamp on the page: moved by dragging or arrows, resized (keeping its shape) by its handle or + and −. */
export function StampBox({ item, scale, selected, onResize, ...handlers }: Props) {
  const gestures = useItemGestures(item, scale, selected, handlers);
  const from = useRef<number | null>(null);
  const width = item.width * scale;
  const height = width * STAMP_RATIO;

  function resize(next: number) {
    const clamped = Math.max(MIN_STAMP_WIDTH, next);
    onResize(clamped, clamped * STAMP_RATIO);
  }

  return (
    <button
      type="button"
      data-item={item.id}
      data-kind="stamp"
      aria-label={`Stamp: ${stampLabel(item.name)}`}
      aria-pressed={selected}
      className="absolute block cursor-move border-0 bg-transparent p-0 select-none"
      style={{ left: item.x * scale, top: item.y * scale, width, height, touchAction: "none" }}
      {...gestures}
      onKeyDown={(event) => {
        const grow = growKey(event.key);
        if (!grow) return gestures.onKeyDown(event);
        event.preventDefault();
        resize(item.width * grow);
        handlers.onMoveEnd();
      }}
    >
      <StampFace item={item} width={item.width} />
      {selected && (
        <>
          <SelectionFrame />
          <ResizeHandle
            left={width}
            top={height}
            onDrag={(dx) => {
              from.current ??= item.width;
              resize(from.current + dx / scale);
            }}
            onEnd={() => {
              from.current = null;
              handlers.onMoveEnd();
            }}
          />
        </>
      )}
    </button>
  );
}
