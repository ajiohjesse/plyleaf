import { useRef } from "react";
import { resizeImage, type Asset, type ImageItem } from "~/editor/items";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { ResizeHandle } from "./ResizeHandle";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: ImageItem;
  asset: Asset | undefined;
  scale: number;
  selected: boolean;
  /** Sets the image's size in points. Calls until onMoveEnd() are one change. */
  onResize: (width: number, height: number) => void;
}

/** + and = grow a selected item by a tenth, − shrinks it. */
export function growKey(key: string): number {
  return key === "+" || key === "=" ? 1.1 : key === "-" ? 1 / 1.1 : 0;
}

/**
 * An image on the page (a signature too). Selected, it's dragged to move and resized from its corner handle, keeping its
 * shape unless Shift is held, or with + and − from the keyboard.
 */
export function ImageBox({ item, asset, scale, selected, onResize, ...handlers }: Props) {
  const gestures = useItemGestures(item, scale, selected, handlers);
  // The size when a resize began.
  const from = useRef<{ width: number; height: number } | null>(null);

  function keyDown(event: React.KeyboardEvent<HTMLElement>) {
    const grow = growKey(event.key);
    if (!grow) return gestures.onKeyDown(event);
    event.preventDefault();
    const size = resizeImage(item, item.width * grow);
    onResize(size.width, size.height);
    handlers.onMoveEnd();
  }

  return (
    <button
      type="button"
      data-item={item.id}
      data-kind="image"
      aria-label={
        item.role === "signature"
          ? "Signature"
          : item.role === "initials"
            ? "Initials"
            : `Image: ${asset?.name ?? "picture"}`
      }
      aria-pressed={selected}
      className="absolute block cursor-move border-0 bg-transparent p-0 select-none"
      style={{
        left: item.x * scale,
        top: item.y * scale,
        width: item.width * scale,
        height: item.height * scale,
        touchAction: "none",
      }}
      {...gestures}
      onKeyDown={keyDown}
    >
      {asset && <img src={asset.url} alt="" draggable={false} className="pointer-events-none block size-full" />}
      {selected && (
        <>
          <SelectionFrame />
          <ResizeHandle
            left={item.width * scale}
            top={item.height * scale}
            onDrag={(dx, dy, shift) => {
              from.current ??= { width: item.width, height: item.height };
              const start = from.current;
              const size = resizeImage(start, start.width + dx / scale, start.height + dy / scale, shift);
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
