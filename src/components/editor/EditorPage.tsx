import { memo, useEffect, useRef, useState } from "react";
import type { PageInfo } from "~/engine/types";
import type { Item, ItemId } from "~/editor/items";
import { PageCanvas } from "~/components/thumbnails/PageCanvas";
import type { Observe } from "~/components/thumbnails/ThumbnailGrid";
import type { ItemHandlers } from "./gestures";
import { TextBox } from "./TextBox";

/** Pages are rendered at most this many device pixels wide; zoomed further, the image is scaled up. */
const MAX_RENDER = 1600;

export type Tool = "select" | "text";

export interface PageHandlers {
  /** The user pressed the page at (x, y) points with a tool that places something. */
  onPlace: (page: number, x: number, y: number) => void;
  /** The user pressed the page itself (not an item) with the select tool. */
  onBackground: () => void;
  handlersFor: (item: Item) => ItemHandlers & { onText: (text: string) => void; onEndEdit: () => void };
}

interface Props extends PageHandlers {
  docId: string;
  index: number;
  page: PageInfo;
  pageCount: number;
  /** CSS pixels per point. */
  scale: number;
  items: Item[];
  tool: Tool;
  selected: ItemId | null;
  editing: ItemId | null;
  observeNear: Observe;
  observeOnScreen: Observe;
}

/**
 * One page of the document with what's been added to it. The page's image is only rendered near the viewport. With a
 * placing tool, a press on the page (or Enter, from the keyboard) places something there.
 */
export const EditorPage = memo(function EditorPage(props: Props) {
  const { docId, index, page, pageCount, scale, items, tool, selected, editing } = props;
  const ref = useRef<HTMLLIElement>(null);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const { observeNear, observeOnScreen } = props;
  useEffect(() => observeNear(ref.current!, setNear), [observeNear]);
  useEffect(() => observeOnScreen(ref.current!, setOnScreen), [observeOnScreen]);

  const width = Math.max(1, Math.round(page.width * scale));
  const height = Math.max(1, Math.round(page.height * scale));
  const placing = tool !== "select";

  function point(event: React.MouseEvent) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
  }

  return (
    <li
      ref={ref}
      aria-label={`Page ${index + 1} of ${pageCount}`}
      data-page={index}
      className="relative shrink-0 bg-surface shadow-sticky ring-1 ring-line"
      style={{ width, height }}
    >
      {near && (
        <PageCanvas
          docId={docId}
          index={index}
          width={Math.min(width, MAX_RENDER / devicePixelRatio)}
          onScreen={onScreen}
        />
      )}
      {/* The page's surface: placing tools act on it; with the select tool, pressing it clears the selection. */}
      {placing ? (
        <button
          type="button"
          aria-label={`Add to page ${index + 1}`}
          className="absolute inset-0 cursor-crosshair"
          onClick={(event) => {
            // From the keyboard (no pointer position), it goes in the middle of the page.
            if (event.detail === 0) return props.onPlace(index, page.width / 2, page.height / 2);
            const { x, y } = point(event);
            props.onPlace(index, x, y);
          }}
        />
      ) : (
        <div className="absolute inset-0" onPointerDown={() => props.onBackground()} />
      )}
      {items.map((item) => (
        <TextBox
          key={item.id}
          item={item}
          scale={scale}
          selected={item.id === selected}
          editing={item.id === editing}
          {...props.handlersFor(item)}
        />
      ))}
    </li>
  );
});
