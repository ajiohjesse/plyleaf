import { useRef } from "react";

/** What an item on the page does when it's pressed, dragged or used from the keyboard. */
export interface ItemHandlers {
  onSelect: () => void;
  onDeselect: () => void;
  /** Puts the item's anchor at (x, y) points. Calls until onMoveEnd() are one change. */
  onMoveTo: (x: number, y: number) => void;
  onMoveEnd: () => void;
  /** Enter, or a tap on an item that's already selected: edit its text, say. */
  onActivate: () => void;
  onRemove: () => void;
}

/** A pointer moves this many CSS pixels before a press becomes a drag. */
const DRAG_THRESHOLD = 3;
/** Arrow keys move an item a point, or this many with Shift. */
const BIG_STEP = 10;

/**
 * Pointer and keyboard handlers for an item: press to select, drag to move (on touch too: items take the gesture
 * rather than scrolling the page, so give the element touch-action: none), press again to activate, arrows to nudge, Delete to remove.
 */
export function useItemGestures(
  item: { x: number; y: number },
  scale: number,
  selected: boolean,
  handlers: ItemHandlers,
) {
  const drag = useRef<{ pointer: number; x: number; y: number; from: { x: number; y: number } } | null>(null);
  const moved = useRef(false);
  const wasSelected = useRef(false);

  return {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.stopPropagation();
      wasSelected.current = selected;
      moved.current = false;
      handlers.onSelect();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, from: { x: item.x, y: item.y } };
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const active = drag.current;
      if (!active || active.pointer !== event.pointerId) return;
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      if (!moved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved.current = true;
      handlers.onMoveTo(active.from.x + dx / scale, active.from.y + dy / scale);
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      if (drag.current?.pointer !== event.pointerId) return;
      drag.current = null;
      if (moved.current) handlers.onMoveEnd();
      else if (wasSelected.current) handlers.onActivate();
    },
    onPointerCancel() {
      if (drag.current && moved.current) handlers.onMoveEnd();
      drag.current = null;
    },
    // A click shouldn't reach the page underneath (which would place something new or clear the selection).
    onClick(event: React.MouseEvent) {
      event.stopPropagation();
    },
    onFocus() {
      if (!selected) handlers.onSelect();
    },
    onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
      const step = event.shiftKey ? BIG_STEP : 1;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const arrow = arrows[event.key];
      if (arrow) {
        event.preventDefault();
        handlers.onMoveTo(item.x + arrow[0], item.y + arrow[1]);
        handlers.onMoveEnd();
      } else if (event.key === "Enter") {
        event.preventDefault();
        handlers.onActivate();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handlers.onRemove();
      } else if (event.key === "Escape") {
        handlers.onDeselect();
        event.currentTarget.blur();
      }
    },
  };
}
