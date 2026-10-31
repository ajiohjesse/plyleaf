import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DocId } from "~/engine/types";
import { shownSize, type Board, type BoardPage } from "~/organize/board";
import { thumbnails } from "~/thumbnails/thumbnails";
import { PageCanvas } from "~/components/thumbnails/PageCanvas";
import {
  BOX_RATIO,
  fit,
  GAP,
  NEAR,
  ON_SCREEN,
  useColumns,
  useViewportObserver,
  type Observe,
} from "~/components/thumbnails/ThumbnailGrid";
import { GripIcon } from "~/components/workspace/parts";

interface Props {
  board: Board;
  docId: DocId;
  /** Names the list for screen readers. */
  label: string;
  selected: ReadonlySet<string>;
  /** "keep": selected pages are framed and ticked. "remove": they're faded and crossed out, for deleting. */
  tone?: "keep" | "remove";
  /** A page was clicked; `span` when shift was held, to select everything from the last page clicked. */
  onToggle: (key: string, span: boolean) => void;
  /** Per-page buttons under the thumbnail (rotate, remove…), for tools that have them. */
  controls?: (page: BoardPage, index: number) => React.ReactNode;
  /** Pages can be dragged into a new order by a handle under each (pointer, touch or keyboard). */
  onMove?: (key: string, index: number) => void;
}

/** How a page is named to screen readers: by position, and where it came from once it has moved. */
export function pageName(page: BoardPage, index: number) {
  if (page.source === null) return `Page ${index + 1}, blank`;
  return page.source === index ? `Page ${index + 1}` : `Page ${index + 1}, page ${page.source + 1} of the original`;
}

/**
 * The "board": every page of the document as a thumbnail that can be selected, in board order, with any added
 * rotation shown. Like ThumbnailGrid, every page is in the list but only those near the viewport render.
 */
export function PageBoard({ board, docId, label, selected, tone = "keep", onToggle, controls, onMove }: Props) {
  const ref = useRef<HTMLOListElement>(null);
  const { columns, cellWidth } = useColumns(ref);
  const observeNear = useViewportObserver(NEAR);
  const observeOnScreen = useViewportObserver(ON_SCREEN);
  useEffect(() => () => thumbnails.forget(docId), [docId]);

  const list = (
    // The padding is on a wrapper so the list's own width is what the columns divide.
    <div className="rounded-card bg-surface-band p-3 sm:p-4">
      <ol
        ref={ref}
        aria-label={label}
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: GAP }}
      >
        {board.map((page, index) => {
          const props: CardProps = {
            page,
            index,
            docId,
            cellWidth,
            selected: selected.has(page.key),
            tone,
            onToggle,
            controls: controls?.(page, index),
            observeNear,
            observeOnScreen,
          };
          return onMove ? <SortableCard key={page.key} {...props} /> : <BoardCard key={page.key} {...props} />;
        })}
      </ol>
    </div>
  );
  return onMove ? (
    <Sortable board={board} onMove={onMove}>
      {list}
    </Sortable>
  ) : (
    list
  );
}

/** dnd-kit around the board: sensors, the page order, and what screen readers hear while a page is dragged. */
function Sortable({
  board,
  onMove,
  children,
}: {
  board: Board;
  onMove: (key: string, index: number) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const count = board.length;
  const position = (id: UniqueIdentifier) => board.findIndex((page) => page.key === id) + 1;
  const name = (id: UniqueIdentifier) => {
    const index = position(id) - 1;
    return index >= 0 ? pageName(board[index]!, index) : "The page";
  };
  // dnd-kit reports the picked-up page as over its own place straight after "picked up"; saying that too would
  // replace the more useful message.
  const justPickedUp = useRef(false);
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      justPickedUp.current = true;
      return `Picked up ${name(active.id)}.`;
    },
    onDragOver: ({ active, over }) => {
      const first = justPickedUp.current;
      justPickedUp.current = false;
      if (first && over?.id === active.id) return undefined;
      return over ? `Over position ${position(over.id)} of ${count}.` : "Outside the pages.";
    },
    onDragEnd: ({ over }) => (over ? `Dropped at position ${position(over.id)} of ${count}.` : "Put back."),
    onDragCancel: ({ active }) => `Moving was cancelled. The page stays at position ${position(active.id)}.`,
  };

  function dropped({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) onMove(String(active.id), position(over.id) - 1);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={dropped}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a page, press space or enter to pick it up, use the arrow keys to move it, then press space or enter to drop it. Press escape to cancel.",
        },
      }}
    >
      <SortableContext items={board.map((page) => page.key)} strategy={rectSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

function SortableCard(props: CardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.page.key,
  });
  return (
    <BoardCard
      {...props}
      drag={{
        setNodeRef,
        style: { transform: CSS.Translate.toString(transform), transition },
        dragging: isDragging,
        handle: (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag ${pageName(props.page, props.index)}`}
            className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-full text-ink-muted hover:bg-ink/10 hover:text-ink active:cursor-grabbing"
          >
            <GripIcon />
          </button>
        ),
      }}
    />
  );
}

interface CardProps {
  page: BoardPage;
  index: number;
  docId: DocId;
  cellWidth: number;
  selected: boolean;
  tone: "keep" | "remove";
  onToggle: (key: string, span: boolean) => void;
  controls: React.ReactNode;
  observeNear: Observe;
  observeOnScreen: Observe;
  /** Set when the board is sortable. */
  drag?: {
    setNodeRef: (element: HTMLElement | null) => void;
    style: React.CSSProperties;
    dragging: boolean;
    handle: React.ReactNode;
  };
}

const BoardCard = memo(function BoardCard({
  page,
  index,
  docId,
  cellWidth,
  selected,
  tone,
  onToggle,
  controls,
  observeNear,
  observeOnScreen,
  drag,
}: CardProps) {
  const ref = useRef<HTMLLIElement | null>(null);
  const setNodeRef = drag?.setNodeRef;
  const setRef = useCallback(
    (element: HTMLLIElement | null) => {
      ref.current = element;
      setNodeRef?.(element);
    },
    [setNodeRef],
  );
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => observeNear(ref.current!, setNear), [observeNear]);
  useEffect(() => observeOnScreen(ref.current!, setOnScreen), [observeOnScreen]);
  // The box takes the page's shape as it will come out; the canvas inside is drawn upright and turned with CSS.
  const box = fit(shownSize(page), cellWidth - 8);
  const upright = page.rotate % 180 === 0 ? box : { width: box.height, height: box.width };
  const removing = selected && tone === "remove";
  const name = pageName(page, index);

  return (
    <li
      ref={setRef}
      data-page={index}
      data-source={page.source ?? "blank"}
      style={drag?.style}
      className={["flex flex-col items-center gap-1", drag?.dragging ? "relative z-20" : ""].join(" ")}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={name}
        onClick={(event) => onToggle(page.key, event.shiftKey)}
        className={[
          "relative grid w-full place-items-center rounded-lg transition-colors",
          selected ? (removing ? "bg-sticky-pink/40" : "bg-sticky-lavender/50") : "hover:bg-ink/5",
        ].join(" ")}
        style={{ height: Math.round(cellWidth * BOX_RATIO) }}
      >
        <span
          className={[
            "relative block rounded-sm bg-surface",
            drag?.dragging ? "shadow-lg" : "shadow-sticky",
            selected ? (removing ? "ring-3 ring-sticky-coral" : "ring-3 ring-primary") : "ring-1 ring-line",
          ].join(" ")}
          style={{ width: box.width, height: box.height }}
        >
          {page.source === null ? (
            <span className="absolute inset-0 grid place-items-center text-xs text-ink-muted">Blank</span>
          ) : (
            <span
              className="absolute top-1/2 left-1/2 block overflow-hidden"
              style={{
                width: upright.width,
                height: upright.height,
                transform: `translate(-50%, -50%) rotate(${page.rotate}deg)`,
              }}
            >
              {near && <PageCanvas docId={docId} index={page.source} width={upright.width} onScreen={onScreen} />}
            </span>
          )}
          {selected && !removing && <Handles />}
          {/* Faded, so pages that will go read as going. */}
          {removing && <span aria-hidden="true" className="absolute inset-0 bg-surface/60" />}
        </span>
        {selected && (
          <span
            aria-hidden="true"
            className={[
              "absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full",
              removing ? "bg-sticky-coral text-ink" : "bg-primary text-on-primary",
            ].join(" ")}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3}>
              <path
                d={removing ? "M7 7l10 10M17 7 7 17" : "M5 12.5l4.5 4.5L19 7.5"}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </button>
      <span className="flex min-h-9 flex-wrap items-center justify-center gap-0.5">
        {drag?.handle}
        <span aria-hidden="true" className="px-1 text-sm font-medium text-ink-muted">
          {index + 1}
        </span>
        {controls}
      </span>
    </li>
  );
});

/** The selection frame's corner handles (DESIGN: selection handles in --primary). */
function Handles() {
  const corner = "absolute size-2 border-2 border-primary bg-surface";
  return (
    <span aria-hidden="true">
      <span className={`${corner} -top-1.5 -left-1.5`} />
      <span className={`${corner} -top-1.5 -right-1.5`} />
      <span className={`${corner} -bottom-1.5 -left-1.5`} />
      <span className={`${corner} -right-1.5 -bottom-1.5`} />
    </span>
  );
}
