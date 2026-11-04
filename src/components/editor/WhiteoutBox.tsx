import { useRef } from "react";
import { resizeShape, toHex, type RedactItem, type WhiteoutItem } from "~/editor/items";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { growKey } from "./ImageBox";
import { ResizeHandle } from "./ResizeHandle";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: WhiteoutItem | RedactItem;
  scale: number;
  selected: boolean;
  onResize: (width: number, height: number) => void;
}

/**
 * A whiteout box: a plain rectangle in the cover colour. A dashed edge (only here, not in the PDF) shows where it is
 * on a page of the same colour. Or an area to redact: hatched see-through dark with a red edge, so what it covers can
 * still be checked; it's black in the PDF.
 */
export function WhiteoutBox({ item, scale, selected, onResize, ...handlers }: Props) {
  const gestures = useItemGestures(item, scale, selected, handlers);
  const from = useRef<{ width: number; height: number } | null>(null);

  function keyDown(event: React.KeyboardEvent<HTMLElement>) {
    const grow = growKey(event.key);
    if (!grow) return gestures.onKeyDown(event);
    event.preventDefault();
    const size = resizeShape({ shape: "rectangle" }, item.width * grow, item.height * grow);
    onResize(size.width, size.height);
    handlers.onMoveEnd();
  }

  return (
    <button
      type="button"
      data-item={item.id}
      data-kind={item.kind}
      aria-label={item.kind === "redact" ? (item.text ? `Redaction: ${item.text}` : "Redaction") : "Whiteout"}
      aria-pressed={selected}
      className={
        item.kind === "redact"
          ? "absolute block cursor-move border-0 p-0 outline-2 outline-danger outline-solid select-none"
          : "absolute block cursor-move border-0 p-0 outline-1 outline-ink-muted/60 outline-dashed select-none"
      }
      style={{
        left: item.x * scale,
        top: item.y * scale,
        width: item.width * scale,
        height: item.height * scale,
        ...(item.kind === "redact"
          ? {
              backgroundColor: "rgb(15 13 46 / 0.45)",
              backgroundImage: "repeating-linear-gradient(135deg, rgb(15 13 46 / 0.35) 0 3px, transparent 3px 7px)",
            }
          : { backgroundColor: toHex(item.color) }),
        touchAction: "none",
      }}
      {...gestures}
      onKeyDown={keyDown}
    >
      {selected && (
        <>
          <SelectionFrame />
          <ResizeHandle
            left={item.width * scale}
            top={item.height * scale}
            onDrag={(dx, dy) => {
              from.current ??= { width: item.width, height: item.height };
              const size = resizeShape(
                { shape: "rectangle" },
                from.current.width + dx / scale,
                from.current.height + dy / scale,
              );
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
