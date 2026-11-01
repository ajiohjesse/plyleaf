import { useRef } from "react";
import { resizeShape, toHex, type WhiteoutItem } from "~/editor/items";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { growKey } from "./ImageBox";
import { ResizeHandle } from "./ResizeHandle";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: WhiteoutItem;
  scale: number;
  selected: boolean;
  onResize: (width: number, height: number) => void;
}

/**
 * A whiteout box: a plain rectangle in the cover colour. A dashed edge (only here, not in the PDF) shows where it is
 * on a page of the same colour.
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
      data-kind="whiteout"
      aria-label="Whiteout"
      aria-pressed={selected}
      className="absolute block cursor-move border-0 p-0 outline-1 outline-ink-muted/60 outline-dashed select-none"
      style={{
        left: item.x * scale,
        top: item.y * scale,
        width: item.width * scale,
        height: item.height * scale,
        backgroundColor: toHex(item.color),
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
