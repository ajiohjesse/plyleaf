import { memo, useEffect, useRef, useState } from "react";
import type { Point } from "~/editor/shapes";
import type { PageInfo } from "~/engine/types";
import type { Asset, AssetId, Item, ItemId } from "~/editor/items";
import { PageCanvas } from "~/components/thumbnails/PageCanvas";
import type { Observe } from "~/components/thumbnails/ThumbnailGrid";
import type { ItemHandlers } from "./gestures";
import { ImageBox } from "./ImageBox";
import { InkBox } from "./InkBox";
import { MarkupBox } from "./MarkupBox";
import { NoteBox } from "./NoteBox";
import { ShapeBox } from "./ShapeBox";
import { StampBox } from "./StampBox";
import { WhiteoutBox } from "./WhiteoutBox";
import { TextBox } from "./TextBox";

/** Pages are rendered at most this many device pixels wide; zoomed further, the image is scaled up. */
const MAX_RENDER = 1600;

export type Tool = "select" | "text" | "markup" | "draw" | "note" | "stamp" | "shape" | "whiteout";

/** Tools that draw by dragging across the page (a click places something of a set size). */
const DRAWING: ReadonlySet<Tool> = new Set(["markup", "draw", "shape", "whiteout"]);

/** A press has to move this many CSS pixels to draw rather than click. */
const DRAW_THRESHOLD = 4;

export interface PageHandlers {
  /** The user pressed the page at (x, y) points with a tool that places something. */
  onPlace: (page: number, x: number, y: number) => void;
  /** The user is dragging across the page from `from` to `to` (points) with a drawing tool; `done` when released. */
  onDraw: (page: number, from: Point, to: Point, done: boolean, path: readonly Point[]) => void;
  /** The user pressed the page itself (not an item) with the select tool. */
  onBackground: () => void;
  handlersFor: (item: Item) => ItemHandlers & {
    onText: (text: string) => void;
    onEndEdit: () => void;
    onResize: (width: number, height: number) => void;
  };
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
  assets: ReadonlyMap<AssetId, Asset>;
  /** Says when the page comes on screen or goes off it. */
  onVisible: (visible: boolean) => void;
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
  const { onVisible } = props;
  useEffect(() => onVisible(onScreen), [onScreen, onVisible]);

  const width = Math.max(1, Math.round(page.width * scale));
  const height = Math.max(1, Math.round(page.height * scale));
  const placing = tool !== "select";
  const drawing = DRAWING.has(tool);
  const stroke = useRef<{ pointer: number; from: Point; screen: Point; moved: boolean; path: Point[] } | null>(null);

  const surfaceRef = useRef<HTMLButtonElement>(null);
  function point(event: { clientX: number; clientY: number }) {
    const box = (surfaceRef.current ?? ref.current!).getBoundingClientRect();
    return { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
  }

  /** Pointer handlers for drawing tools: a drag draws, a click places. */
  const draw = {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      // No focus on press: focusing the page-sized button could scroll the page in the middle of the drag.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const screen = { x: event.clientX, y: event.clientY };
      const from = point(event);
      stroke.current = { pointer: event.pointerId, from, screen, moved: false, path: [from] };
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const active = stroke.current;
      if (active?.pointer !== event.pointerId) return;
      const far = Math.hypot(event.clientX - active.screen.x, event.clientY - active.screen.y) >= DRAW_THRESHOLD;
      // Every point, coalesced ones included (a fast pen moves several between frames).
      const events = "getCoalescedEvents" in event.nativeEvent ? event.nativeEvent.getCoalescedEvents() : [];
      for (const each of events.length > 0 ? events : [event]) active.path.push(point(each));
      if (!active.moved && !far) return;
      active.moved = true;
      props.onDraw(index, active.from, point(event), false, active.path);
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const active = stroke.current;
      if (active?.pointer !== event.pointerId) return;
      stroke.current = null;
      if (active.moved) props.onDraw(index, active.from, point(event), true, [...active.path, point(event)]);
      else props.onPlace(index, active.from.x, active.from.y);
    },
    onPointerCancel() {
      stroke.current = null;
    },
  };

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
          ref={surfaceRef}
          type="button"
          aria-label={`Add to page ${index + 1}`}
          className="absolute inset-0 cursor-crosshair"
          style={drawing ? { touchAction: "none" } : undefined}
          {...(drawing ? draw : {})}
          onClick={(event) => {
            // From the keyboard (no pointer position), it goes in the middle of the page.
            if (event.detail === 0) return props.onPlace(index, page.width / 2, page.height / 2);
            if (drawing) return;
            const { x, y } = point(event);
            props.onPlace(index, x, y);
          }}
        />
      ) : (
        <div className="absolute inset-0" onPointerDown={() => props.onBackground()} />
      )}
      {items.map((item) => {
        const { onText, onEndEdit, onResize, ...handlers } = props.handlersFor(item);
        if (item.kind === "stamp") {
          return (
            <StampBox
              key={item.id}
              item={item}
              scale={scale}
              selected={item.id === selected}
              onResize={onResize}
              {...handlers}
            />
          );
        }
        if (item.kind === "note") {
          return (
            <NoteBox
              key={item.id}
              item={item}
              scale={scale}
              selected={item.id === selected}
              editing={item.id === editing}
              onText={onText}
              onEndEdit={onEndEdit}
              {...handlers}
            />
          );
        }
        if (item.kind === "ink") {
          return <InkBox key={item.id} item={item} scale={scale} selected={item.id === selected} {...handlers} />;
        }
        if (item.kind === "markup") {
          return <MarkupBox key={item.id} item={item} scale={scale} selected={item.id === selected} {...handlers} />;
        }
        if (item.kind === "whiteout") {
          return (
            <WhiteoutBox
              key={item.id}
              item={item}
              scale={scale}
              selected={item.id === selected}
              onResize={onResize}
              {...handlers}
            />
          );
        }
        if (item.kind === "shape") {
          return (
            <ShapeBox
              key={item.id}
              item={item}
              scale={scale}
              selected={item.id === selected}
              onResize={onResize}
              {...handlers}
            />
          );
        }
        return item.kind === "text" ? (
          <TextBox
            key={item.id}
            item={item}
            scale={scale}
            selected={item.id === selected}
            editing={item.id === editing}
            onText={onText}
            onEndEdit={onEndEdit}
            {...handlers}
          />
        ) : (
          <ImageBox
            key={item.id}
            item={item}
            asset={props.assets.get(item.asset)}
            scale={scale}
            selected={item.id === selected}
            onResize={onResize}
            {...handlers}
          />
        );
      })}
    </li>
  );
});
