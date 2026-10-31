// The page board behind the page-level Organize tools (extract, delete, rotate, reorder, insert blank, duplicate): the
// pages of one document as a list the user rearranges, then turns into engine.assemble specs. Pure and immutable, so
// every change is a new board and React can compare them.
import type { DocId, DocInfo, PageSpec, Rotation } from "~/engine/types";
import type { PageRange } from "./ranges";

export interface BoardPage {
  /** Stable for the life of the board, so React keys and selections follow a page as it moves. */
  key: string;
  /** Index of the source page, or null for a blank page. */
  source: number | null;
  /** As shown before `rotate`, in PDF points (the source page's own rotation is already in these). */
  width: number;
  height: number;
  /** Turned clockwise on top of the page's own rotation. */
  rotate: Rotation;
}

export type Board = readonly BoardPage[];

let nextKey = 1;
const newKey = () => `p${nextKey++}`;

export function boardFrom(info: DocInfo): Board {
  return info.pages.map((page, index) => ({
    key: newKey(),
    source: index,
    width: page.width,
    height: page.height,
    rotate: 0,
  }));
}

/** The page's size as it will come out, after `rotate`. */
export function shownSize(page: BoardPage) {
  return page.rotate % 180 === 0
    ? { width: page.width, height: page.height }
    : { width: page.height, height: page.width };
}

/** What engine.assemble needs to build the board (or only its `keep` pages), in board order. */
export function toSpecs(board: Board, doc: DocId, keep?: ReadonlySet<string>): PageSpec[] {
  return board
    .filter((page) => !keep || keep.has(page.key))
    .map((page) =>
      page.source === null
        ? { blank: shownSize(page) }
        : { doc, page: page.source, ...(page.rotate !== 0 && { rotate: page.rotate }) },
    );
}

/** The keys of the pages at these 1-based positions. */
export function keysInRanges(board: Board, ranges: readonly PageRange[]): Set<string> {
  const keys = new Set<string>();
  for (const { first, last } of ranges) {
    for (let position = first; position <= last && position <= board.length; position++) {
      keys.add(board[position - 1]!.key);
    }
  }
  return keys;
}

/** Keys from one position to another, either way round: what shift-click selects. */
export function keysBetween(board: Board, fromKey: string, toKey: string): string[] {
  const from = board.findIndex((page) => page.key === fromKey);
  const to = board.findIndex((page) => page.key === toKey);
  if (from < 0 || to < 0) return [toKey];
  return board.slice(Math.min(from, to), Math.max(from, to) + 1).map((page) => page.key);
}

export function removePages(board: Board, keys: ReadonlySet<string>): Board {
  return board.filter((page) => !keys.has(page.key));
}

export function rotatePages(board: Board, keys: ReadonlySet<string>, by: -90 | 90 | 180): Board {
  return board.map((page) =>
    keys.has(page.key) ? { ...page, rotate: ((((page.rotate + by) % 360) + 360) % 360) as Rotation } : page,
  );
}

/** Moves a page to `index` (clamped to the board). */
export function movePage(board: Board, key: string, index: number): Board {
  const from = board.findIndex((page) => page.key === key);
  if (from < 0) return board;
  const next = board.slice();
  const [page] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, page!);
  return next;
}

/** Moves the pages in `keys` to the start or end of the board, keeping their order among themselves. */
export function moveToEdge(board: Board, keys: ReadonlySet<string>, edge: "start" | "end"): Board {
  const moving = board.filter((page) => keys.has(page.key));
  const staying = board.filter((page) => !keys.has(page.key));
  return edge === "start" ? [...moving, ...staying] : [...staying, ...moving];
}

/** Puts the document's pages back in their original order (blank pages keep their place after the page before). */
export function originalOrder(board: Board): Board {
  return board.slice().sort((a, b) => (a.source ?? Infinity) - (b.source ?? Infinity));
}

/** The pages aren't in the document's order. */
export const isReordered = (board: Board) => board.some((page, index) => page.source !== index);

export function reversePages(board: Board): Board {
  return board.slice().reverse();
}

/** Puts a copy of each page in `keys` straight after it. Returns the board and the copies' keys. */
export function duplicatePages(board: Board, keys: ReadonlySet<string>): { board: Board; added: string[] } {
  const added: string[] = [];
  const next = board.flatMap((page) => {
    if (!keys.has(page.key)) return [page];
    const copy = { ...page, key: newKey() };
    added.push(copy.key);
    return [page, copy];
  });
  return { board: next, added };
}

/**
 * Puts a blank page after (or before) each page in `keys`, the same size and way round as that page shows. Returns
 * the board and the blank pages' keys.
 */
export function insertBlanks(
  board: Board,
  keys: ReadonlySet<string>,
  where: "before" | "after" = "after",
): { board: Board; added: string[] } {
  const added: string[] = [];
  const next = board.flatMap((page) => {
    if (!keys.has(page.key)) return [page];
    const blank: BoardPage = { key: newKey(), source: null, ...shownSize(page), rotate: 0 };
    added.push(blank.key);
    return where === "after" ? [page, blank] : [blank, page];
  });
  return { board: next, added };
}

/** The board differs from the document as it was opened. */
export function isChanged(board: Board, info: DocInfo): boolean {
  return board.length !== info.pageCount || board.some((page, index) => page.source !== index || page.rotate !== 0);
}
