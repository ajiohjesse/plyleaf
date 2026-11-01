import { useRef } from "react";
import { MIN_IMAGE_SIDE, resizeImage, type Asset, type ImageItem } from "~/editor/items";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: ImageItem;
  asset: Asset | undefined;
  scale: number;
  selected: boolean;
  /** Sets the image's size in points. Calls until onMoveEnd() are one change. */
  onResize: (width: number, height: number) => void;
}

/**
 * An image on the page. Selected, it's dragged to move and resized from its corner handle (keeping its shape), or with
 * + and − from the keyboard.
 */
export function ImageBox({ item, asset, scale, selected, onResize, ...handlers }: Props) {
  const gestures = useItemGestures(item, scale, selected, handlers);
  const resizing = useRef<{ pointer: number; x: number; width: number } | null>(null);

  function keyDown(event: React.KeyboardEvent<HTMLElement>) {
    const grow = event.key === "+" || event.key === "=" ? 1.1 : event.key === "-" ? 1 / 1.1 : 0;
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
      aria-label={`Image: ${asset?.name ?? "picture"}`}
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
          {/* The resize handle: bigger than it looks, for fingers. */}
          <span
            aria-hidden="true"
            data-resize
            className="absolute -right-4 -bottom-4 grid size-8 cursor-nwse-resize place-items-center"
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              resizing.current = { pointer: event.pointerId, x: event.clientX, width: item.width };
            }}
            onPointerMove={(event) => {
              const active = resizing.current;
              if (active?.pointer !== event.pointerId) return;
              const size = resizeImage(
                item,
                Math.max(MIN_IMAGE_SIDE, active.width + (event.clientX - active.x) / scale),
              );
              onResize(size.width, size.height);
            }}
            onPointerUp={() => {
              if (resizing.current) handlers.onMoveEnd();
              resizing.current = null;
            }}
            onPointerCancel={() => {
              if (resizing.current) handlers.onMoveEnd();
              resizing.current = null;
            }}
          >
            <span className="size-3.5 rounded-full border-2 border-primary bg-surface" />
          </span>
        </>
      )}
    </button>
  );
}
