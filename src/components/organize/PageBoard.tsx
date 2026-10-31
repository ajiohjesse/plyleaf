import { memo, useEffect, useRef, useState } from "react";
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

interface Props {
  board: Board;
  docId: DocId;
  /** Names the list for screen readers. */
  label: string;
  selected: ReadonlySet<string>;
  /** A page was clicked; `span` when shift was held, to select everything from the last page clicked. */
  onToggle: (key: string, span: boolean) => void;
  /** Per-page buttons under the thumbnail (rotate, remove…), for tools that have them. */
  controls?: (page: BoardPage, index: number) => React.ReactNode;
}

/**
 * The "board": every page of the document as a thumbnail that can be selected, in board order, with any added
 * rotation shown. Like ThumbnailGrid, every page is in the list but only those near the viewport render.
 */
export function PageBoard({ board, docId, label, selected, onToggle, controls }: Props) {
  const ref = useRef<HTMLOListElement>(null);
  const { columns, cellWidth } = useColumns(ref);
  const observeNear = useViewportObserver(NEAR);
  const observeOnScreen = useViewportObserver(ON_SCREEN);
  useEffect(() => () => thumbnails.forget(docId), [docId]);

  return (
    // The padding is on a wrapper so the list's own width is what the columns divide.
    <div className="rounded-card bg-surface-band p-3 sm:p-4">
      <ol
        ref={ref}
        aria-label={label}
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: GAP }}
      >
        {board.map((page, index) => (
          <BoardCard
            key={page.key}
            page={page}
            index={index}
            docId={docId}
            cellWidth={cellWidth}
            selected={selected.has(page.key)}
            onToggle={onToggle}
            controls={controls?.(page, index)}
            observeNear={observeNear}
            observeOnScreen={observeOnScreen}
          />
        ))}
      </ol>
    </div>
  );
}

interface CardProps {
  page: BoardPage;
  index: number;
  docId: DocId;
  cellWidth: number;
  selected: boolean;
  onToggle: (key: string, span: boolean) => void;
  controls: React.ReactNode;
  observeNear: Observe;
  observeOnScreen: Observe;
}

const BoardCard = memo(function BoardCard({
  page,
  index,
  docId,
  cellWidth,
  selected,
  onToggle,
  controls,
  observeNear,
  observeOnScreen,
}: CardProps) {
  const ref = useRef<HTMLLIElement>(null);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => observeNear(ref.current!, setNear), [observeNear]);
  useEffect(() => observeOnScreen(ref.current!, setOnScreen), [observeOnScreen]);
  // The box takes the page's shape as it will come out; the canvas inside is drawn upright and turned with CSS.
  const box = fit(shownSize(page), cellWidth - 8);
  const upright = page.rotate % 180 === 0 ? box : { width: box.height, height: box.width };
  const name = page.source === null ? `Page ${index + 1}, blank` : `Page ${index + 1}`;

  return (
    <li ref={ref} data-page={index} data-source={page.source ?? "blank"} className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={name}
        onClick={(event) => onToggle(page.key, event.shiftKey)}
        className={[
          "relative grid w-full place-items-center rounded-lg transition-colors",
          selected ? "bg-sticky-lavender/50" : "hover:bg-ink/5",
        ].join(" ")}
        style={{ height: Math.round(cellWidth * BOX_RATIO) }}
      >
        <span
          className={[
            "relative block rounded-sm bg-surface shadow-sticky",
            selected ? "ring-3 ring-primary" : "ring-1 ring-line",
          ].join(" ")}
          style={{ width: box.width, height: box.height }}
        >
          {page.source === null ? (
            <span className="absolute inset-0 grid place-items-center text-xs text-ink-muted">Blank</span>
          ) : (
            <span
              className="absolute top-1/2 left-1/2 block overflow-hidden transition-transform"
              style={{
                width: upright.width,
                height: upright.height,
                transform: `translate(-50%, -50%) rotate(${page.rotate}deg)`,
              }}
            >
              {near && <PageCanvas docId={docId} index={page.source} width={upright.width} onScreen={onScreen} />}
            </span>
          )}
          {selected && <Handles />}
        </span>
        {selected && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-primary text-on-primary"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </button>
      <span className="flex min-h-9 items-center gap-0.5">
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
