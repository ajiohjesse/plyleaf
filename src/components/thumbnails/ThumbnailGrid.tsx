import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DocInfo, PageInfo } from "~/engine/types";
import { thumbnails } from "~/thumbnails/thumbnails";
import { PageCanvas } from "./PageCanvas";

/** Narrowest a column gets before the grid drops one. */
const MIN_CELL = 128;
const GAP = 16;
/** Each page is fitted into a box this many times taller than it is wide (A4 portrait fills it). */
const BOX_RATIO = Math.SQRT2;
/** Pages within this distance of the viewport get a canvas and a render; the rest are empty placeholders. */
const NEAR = "100% 0px";
/** Pages actually on screen, whose renders go first. */
const ON_SCREEN = "0px";

type Observe = (element: Element, onChange: (inside: boolean) => void) => () => void;

/** One IntersectionObserver for the whole grid, rather than one per page. */
function useViewportObserver(rootMargin: string): Observe {
  const [observe] = useState((): Observe => {
    const callbacks = new Map<Element, (inside: boolean) => void>();
    let observer: IntersectionObserver | null = null;
    return (element, onChange) => {
      observer ??= new IntersectionObserver(
        (entries) => {
          for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
        },
        { rootMargin },
      );
      callbacks.set(element, onChange);
      observer.observe(element);
      return () => {
        callbacks.delete(element);
        observer?.unobserve(element);
      };
    };
  });
  return observe;
}

/** Columns and the width of each, from the grid's own width. */
function useColumns(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current!;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  const columns = Math.max(2, Math.floor((width + GAP) / (MIN_CELL + GAP)));
  return { columns, cellWidth: width > 0 ? (width - GAP * (columns - 1)) / columns : MIN_CELL };
}

/** The page's size in CSS pixels when fitted into a cell's box. */
function fit(page: PageInfo, cellWidth: number) {
  const scale = Math.min(cellWidth / page.width, (cellWidth * BOX_RATIO) / page.height);
  return { width: Math.max(1, Math.round(page.width * scale)), height: Math.max(1, Math.round(page.height * scale)) };
}

interface Props {
  doc: DocInfo;
  /** Names the list for screen readers, e.g. the file name. */
  label: string;
}

/**
 * Every page of a document as a thumbnail. All pages are in the list (so keyboard, screen readers and find-in-page see
 * them), but only those near the viewport get a canvas and a render; the rest stay empty boxes of the right shape.
 */
export function ThumbnailGrid({ doc, label }: Props) {
  const ref = useRef<HTMLOListElement>(null);
  const { columns, cellWidth } = useColumns(ref);
  const observeNear = useViewportObserver(NEAR);
  const observeOnScreen = useViewportObserver(ON_SCREEN);

  // Its pages' images are no use once the document is closed (and its id may be reissued).
  useEffect(() => () => thumbnails.forget(doc.id), [doc.id]);

  return (
    <ol
      ref={ref}
      aria-label={label}
      className="grid"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: GAP }}
    >
      {doc.pages.map((page, index) => (
        <Thumbnail
          key={index}
          docId={doc.id}
          index={index}
          page={page}
          cellWidth={cellWidth}
          observeNear={observeNear}
          observeOnScreen={observeOnScreen}
        />
      ))}
    </ol>
  );
}

interface ThumbnailProps {
  docId: string;
  index: number;
  page: PageInfo;
  cellWidth: number;
  observeNear: Observe;
  observeOnScreen: Observe;
}

const Thumbnail = memo(function Thumbnail({
  docId,
  index,
  page,
  cellWidth,
  observeNear,
  observeOnScreen,
}: ThumbnailProps) {
  const ref = useRef<HTMLLIElement>(null);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => observeNear(ref.current!, setNear), [observeNear]);
  useEffect(() => observeOnScreen(ref.current!, setOnScreen), [observeOnScreen]);
  const size = fit(page, cellWidth);

  return (
    <li ref={ref} data-page={index} className="flex flex-col items-center gap-2">
      <div className="grid w-full place-items-center" style={{ height: Math.round(cellWidth * BOX_RATIO) }}>
        <div
          className="relative overflow-hidden rounded-sm bg-surface shadow-sticky ring-1 ring-line"
          style={{ width: size.width, height: size.height }}
        >
          {near && <PageCanvas docId={docId} index={index} width={size.width} onScreen={onScreen} />}
        </div>
      </div>
      <span className="text-sm font-medium text-ink-muted">
        <span className="sr-only">Page </span>
        {index + 1}
      </span>
    </li>
  );
});
