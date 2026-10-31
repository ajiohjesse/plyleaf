import { expect, test } from "vitest";
import type { DocInfo } from "~/engine/types";
import {
  boardFrom,
  duplicatePages,
  insertBlanks,
  isChanged,
  keysBetween,
  keysInRanges,
  movePage,
  removePages,
  reversePages,
  rotatePages,
  shownSize,
  toSpecs,
  type Board,
} from "~/organize/board";

const info = (sizes: [number, number][]): DocInfo => ({
  id: "d1",
  pageCount: sizes.length,
  pages: sizes.map(([width, height]) => ({ width, height, rotation: 0 })),
  repaired: false,
});
const FOUR = info([
  [100, 200],
  [110, 200],
  [120, 200],
  [130, 200],
]);
const sources = (board: Board) => board.map((page) => page.source);
const keys = (board: Board, ...positions: number[]) => new Set(positions.map((p) => board[p - 1]!.key));

test("starts as the document's pages, each with its own key, and builds back to them", () => {
  const board = boardFrom(FOUR);
  expect(sources(board)).toEqual([0, 1, 2, 3]);
  expect(new Set(board.map((page) => page.key)).size).toBe(4);
  // A second board of the same file gets new keys.
  expect(boardFrom(FOUR)[0]!.key).not.toBe(board[0]!.key);
  expect(toSpecs(board, "d1")).toEqual([0, 1, 2, 3].map((page) => ({ doc: "d1", page })));
  expect(isChanged(board, FOUR)).toBe(false);
});

test("builds only the pages kept, in board order", () => {
  const board = movePage(boardFrom(FOUR), boardFrom(FOUR)[0]!.key, 0);
  const moved = movePage(board, board[3]!.key, 0);
  expect(toSpecs(moved, "d1", keys(moved, 1, 3))).toEqual([
    { doc: "d1", page: 3 },
    { doc: "d1", page: 1 },
  ]);
});

test("selects by typed positions and by shift-click spans", () => {
  const board = boardFrom(FOUR);
  expect(
    keysInRanges(board, [
      { first: 2, last: 3 },
      { first: 3, last: 4 },
    ]),
  ).toEqual(keys(board, 2, 3, 4));
  expect(keysBetween(board, board[3]!.key, board[1]!.key)).toEqual([...keys(board, 2, 3, 4)]);
  expect(keysBetween(board, "gone", board[1]!.key)).toEqual([board[1]!.key]);
});

test("removes pages", () => {
  const board = boardFrom(FOUR);
  const left = removePages(board, keys(board, 1, 3));
  expect(sources(left)).toEqual([1, 3]);
  expect(isChanged(left, FOUR)).toBe(true);
});

test("rotates pages both ways, wrapping round, and swaps their shown size", () => {
  const board = boardFrom(FOUR);
  let turned = rotatePages(board, keys(board, 1, 2), 90);
  turned = rotatePages(turned, keys(turned, 2, 3), -90);
  expect(turned.map((page) => page.rotate)).toEqual([90, 0, 270, 0]);
  expect(rotatePages(turned, keys(turned, 1), 180)[0]!.rotate).toBe(270);
  expect(shownSize(turned[0]!)).toEqual({ width: 200, height: 100 });
  expect(shownSize(turned[1]!)).toEqual({ width: 110, height: 200 });
  expect(toSpecs(turned, "d1")).toEqual([
    { doc: "d1", page: 0, rotate: 90 },
    { doc: "d1", page: 1 },
    { doc: "d1", page: 2, rotate: 270 },
    { doc: "d1", page: 3 },
  ]);
  expect(isChanged(turned, FOUR)).toBe(true);
});

test("moves and reverses pages", () => {
  const board = boardFrom(FOUR);
  expect(sources(movePage(board, board[0]!.key, 2))).toEqual([1, 2, 0, 3]);
  expect(sources(movePage(board, board[3]!.key, -5))).toEqual([3, 0, 1, 2]);
  expect(sources(movePage(board, board[0]!.key, 99))).toEqual([1, 2, 3, 0]);
  expect(movePage(board, "gone", 0)).toBe(board);
  expect(sources(reversePages(board))).toEqual([3, 2, 1, 0]);
});

test("duplicates pages next to themselves, keeping their rotation", () => {
  const board = rotatePages(boardFrom(FOUR), keys(boardFrom(FOUR), 1), 90);
  const turned = rotatePages(board, new Set([board[1]!.key]), 90);
  const { board: doubled, added } = duplicatePages(turned, keys(turned, 2, 4));
  expect(sources(doubled)).toEqual([0, 1, 1, 2, 3, 3]);
  expect(added).toEqual([doubled[2]!.key, doubled[5]!.key]);
  expect(doubled[2]!.rotate).toBe(90);
  expect(new Set(doubled.map((page) => page.key)).size).toBe(6);
});

test("inserts blank pages the size and way round of their neighbour", () => {
  const board = boardFrom(FOUR);
  const turned = rotatePages(board, keys(board, 2), 90);
  const { board: after, added } = insertBlanks(turned, keys(turned, 2, 4));
  expect(sources(after)).toEqual([0, 1, null, 2, 3, null]);
  expect(added).toEqual([after[2]!.key, after[5]!.key]);
  expect(toSpecs(after, "d1")[2]).toEqual({ blank: { width: 200, height: 110 } });
  expect(toSpecs(after, "d1")[5]).toEqual({ blank: { width: 130, height: 200 } });
  const { board: before } = insertBlanks(board, keys(board, 1));
  expect(sources(before)).toEqual([0, null, 1, 2, 3]);
  expect(sources(insertBlanks(board, keys(board, 1), "before").board)).toEqual([null, 0, 1, 2, 3]);
});
