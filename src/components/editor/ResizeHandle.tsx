import { useRef } from "react";

interface Props {
  /** Where the handle sits, in CSS pixels from the item's top-left. */
  left: number;
  top: number;
  /** How far the pointer has moved since the press, in CSS pixels. */
  onDrag: (dx: number, dy: number) => void;
  onEnd: () => void;
}

/** The round handle that resizes a selected item. Bigger than it looks, for fingers. Pointer only: keys do it too. */
export function ResizeHandle({ left, top, onDrag, onEnd }: Props) {
  const start = useRef<{ pointer: number; x: number; y: number } | null>(null);
  function finish() {
    if (start.current) onEnd();
    start.current = null;
  }
  return (
    <span
      aria-hidden="true"
      data-resize
      className="absolute grid size-8 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize place-items-center"
      style={{ left, top, touchAction: "none" }}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        const active = start.current;
        if (active?.pointer === event.pointerId) onDrag(event.clientX - active.x, event.clientY - active.y);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      // A click on the handle isn't a click on the item or the page.
      onClick={(event) => event.stopPropagation()}
    >
      <span className="size-3.5 rounded-full border-2 border-primary bg-surface" />
    </span>
  );
}
