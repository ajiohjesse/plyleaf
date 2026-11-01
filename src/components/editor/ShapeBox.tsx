import { useRef } from "react";
import { resizeShape, toHex, type ShapeItem } from "~/editor/items";
import { KAPPA, lineGeometry } from "~/editor/shapes";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { growKey } from "./ImageBox";
import { ResizeHandle } from "./ResizeHandle";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: ShapeItem;
  scale: number;
  selected: boolean;
  onResize: (width: number, height: number) => void;
}

export const SHAPE_NAMES: Record<ShapeItem["shape"], string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  arrow: "Arrow",
};

/** A shape as an SVG drawing in page points, the same geometry the engine draws. */
export function ShapeDrawing({
  item,
}: {
  item: Pick<ShapeItem, "shape" | "x" | "y" | "width" | "height" | "stroke" | "fill" | "lineWidth">;
}) {
  const { shape, x, y, width, height, lineWidth } = item;
  const stroke = item.stroke ? toHex(item.stroke) : "none";
  if (shape === "line" || shape === "arrow") {
    const geometry = lineGeometry(x, y, width, height, lineWidth, shape === "arrow");
    if (!geometry || !item.stroke) return null;
    return (
      <>
        <line
          x1={x}
          y1={y}
          x2={geometry.end.x}
          y2={geometry.end.y}
          stroke={stroke}
          strokeWidth={lineWidth}
          strokeLinecap="round"
        />
        {geometry.head && (
          <polygon points={geometry.head.map((p) => `${p.x},${p.y}`).join(" ")} fill={stroke} stroke="none" />
        )}
      </>
    );
  }
  const fill = item.fill ? toHex(item.fill) : "none";
  if (shape === "rectangle") {
    return <rect x={x} y={y} width={width} height={height} fill={fill} stroke={stroke} strokeWidth={lineWidth} />;
  }
  // Drawn with the engine's four Bézier curves rather than an SVG ellipse, so the two match exactly.
  const [rx, ry, cx, cy] = [width / 2, height / 2, x + width / 2, y + height / 2];
  const d = [
    `M${cx + rx},${cy}`,
    `C${cx + rx},${cy + ry * KAPPA} ${cx + rx * KAPPA},${cy + ry} ${cx},${cy + ry}`,
    `C${cx - rx * KAPPA},${cy + ry} ${cx - rx},${cy + ry * KAPPA} ${cx - rx},${cy}`,
    `C${cx - rx},${cy - ry * KAPPA} ${cx - rx * KAPPA},${cy - ry} ${cx},${cy - ry}`,
    `C${cx + rx * KAPPA},${cy - ry} ${cx + rx},${cy - ry * KAPPA} ${cx + rx},${cy}Z`,
  ].join(" ");
  return <path d={d} fill={fill} stroke={stroke} strokeWidth={lineWidth} />;
}

/** The area a shape covers in points, with room round it for its outline and for a finger. */
export function shapeBounds(item: Pick<ShapeItem, "x" | "y" | "width" | "height" | "lineWidth">, scale: number) {
  const pad = item.lineWidth / 2 + 8 / scale;
  const left = Math.min(item.x, item.x + item.width) - pad;
  const top = Math.min(item.y, item.y + item.height) - pad;
  return { left, top, width: Math.abs(item.width) + pad * 2, height: Math.abs(item.height) + pad * 2 };
}

/**
 * A shape on the page. Selected, it's dragged to move and resized from the handle on its far corner (a line's end),
 * or with + and − from the keyboard.
 */
export function ShapeBox({ item, scale, selected, onResize, ...handlers }: Props) {
  const gestures = useItemGestures(item, scale, selected, handlers);
  const from = useRef<{ width: number; height: number } | null>(null);
  const bounds = shapeBounds(item, scale);

  function keyDown(event: React.KeyboardEvent<HTMLElement>) {
    const grow = growKey(event.key);
    if (!grow) return gestures.onKeyDown(event);
    event.preventDefault();
    const size = resizeShape(item, item.width * grow, item.height * grow);
    onResize(size.width, size.height);
    handlers.onMoveEnd();
  }

  return (
    <button
      type="button"
      data-item={item.id}
      data-kind="shape"
      aria-label={SHAPE_NAMES[item.shape]}
      aria-pressed={selected}
      className="absolute block cursor-move border-0 bg-transparent p-0 select-none"
      style={{
        left: bounds.left * scale,
        top: bounds.top * scale,
        width: bounds.width * scale,
        height: bounds.height * scale,
        touchAction: "none",
      }}
      {...gestures}
      onKeyDown={keyDown}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none block size-full overflow-visible"
        viewBox={`${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`}
      >
        <ShapeDrawing item={item} />
      </svg>
      {selected && (
        <>
          <SelectionFrame />
          <ResizeHandle
            left={(item.x + item.width - bounds.left) * scale}
            top={(item.y + item.height - bounds.top) * scale}
            onDrag={(dx, dy) => {
              from.current ??= { width: item.width, height: item.height };
              const size = resizeShape(item, from.current.width + dx / scale, from.current.height + dy / scale);
              onResize(size.width, size.height);
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
