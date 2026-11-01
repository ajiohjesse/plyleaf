import { expect, test } from "vitest";
import { unsupportedCharacters } from "~/editor/fonts";
import { canRedo, canUndo, change, redo, settle, startHistory, undo, UNDO_LIMIT } from "~/editor/history";
import { jpegOrientation, startingSize, usableAsIs } from "~/editor/images";
import {
  fromHex,
  moveItem,
  removeItem,
  resizeImage,
  rewriteLine,
  unchanged,
  thinStroke,
  toEdits,
  toHex,
  updateItem,
  type ImageItem,
  type InkItem,
  type TextItem,
} from "~/editor/items";
import { makeJpeg, makePng } from "../helpers/images";

test("undo and redo step through changes, and a new change drops what was undone", () => {
  let history = startHistory(0);
  expect(canUndo(history)).toBe(false);
  history = change(history, 1);
  history = change(history, 2);
  history = undo(history);
  expect(history.present).toBe(1);
  expect(canRedo(history)).toBe(true);
  history = redo(history);
  expect(history.present).toBe(2);
  history = undo(undo(history));
  expect(history.present).toBe(0);
  expect(undo(history)).toBe(history);
  history = change(history, 5);
  expect(canRedo(history)).toBe(false);
  expect(history.past).toEqual([0]);
});

test("changes with the same merge key are one step until settled", () => {
  let history = startHistory("");
  for (const text of ["H", "He", "Hel"]) history = change(history, text, "typing");
  expect(history.past).toEqual([""]);
  history = change(history, "Hel!", "other");
  expect(history.past).toEqual(["", "Hel"]);
  history = settle(change(history, "Hel!?", "other"));
  history = change(history, "Hel!?.", "other");
  expect(history.past).toEqual(["", "Hel", "Hel!?"]);
  // An undo closes the step too.
  history = change(undo(history), "x", "other");
  expect(history.past).toEqual(["", "Hel", "Hel!?"]);
  // The same value is no change.
  expect(change(history, history.present)).toBe(history);
});

test("history keeps a limited number of steps", () => {
  let history = startHistory(0);
  for (let i = 1; i <= UNDO_LIMIT + 50; i++) history = change(history, i);
  expect(history.past).toHaveLength(UNDO_LIMIT);
  expect(history.past[0]).toBe(50);
});

const text = (overrides: Partial<TextItem>): TextItem => ({
  id: "a",
  kind: "text",
  page: 0,
  x: 10,
  y: 20,
  text: "Hi",
  font: "helvetica",
  bold: false,
  italic: false,
  size: 12,
  color: [0, 0, 0],
  ...overrides,
});

test("items become edits page by page, without empty text", () => {
  const items = [
    text({ id: "a", page: 2 }),
    text({ id: "b", page: 0, text: "  " }),
    text({ id: "c", page: 0, text: "First", bold: true }),
    text({ id: "d", page: 2, text: "Top" }),
  ];
  expect(toEdits(items)).toEqual({
    pages: [
      { page: 0, marks: [expect.objectContaining({ type: "text", text: "First", bold: true })] },
      {
        page: 2,
        marks: [expect.objectContaining({ text: "Hi" }), expect.objectContaining({ text: "Top" })],
      },
    ],
  });
  expect(toEdits([]).pages).toEqual([]);
});

test("items update, move within the page and go", () => {
  const items = [text({ id: "a" }), text({ id: "b" })];
  expect((updateItem(items, "b", { text: "New" })[1] as TextItem).text).toBe("New");
  expect(updateItem(items, "b", { text: "New" })[0]).toBe(items[0]);
  expect(removeItem(items, "a").map((item) => item.id)).toEqual(["b"]);
  expect(moveItem(items[0]!, -50, 5, { width: 100, height: 100 })).toEqual({ x: 0, y: 25 });
  expect(moveItem(items[0]!, 500, 500, { width: 100, height: 100 })).toEqual({ x: 100, y: 100 });
});

test("colours go to and from hex", () => {
  expect(toHex([1, 0, 0.5])).toBe("#ff0080");
  expect(fromHex("#ff0080").map((c) => Math.round(c * 255))).toEqual([255, 0, 128]);
  expect(fromHex("nope")).toEqual([0, 0, 0]);
});

test("characters the standard fonts can't show are found", () => {
  expect(unsupportedCharacters("Héllo Жук ΩΣ €–“”\n\t")).toEqual([]);
  expect(unsupportedCharacters("中文 and 中 😀")).toEqual(["中", "文", "😀"]);
});

test("JPEG orientation is read from EXIF, and only upright JPEGs and PNGs go in as they are", () => {
  expect(jpegOrientation(makeJpeg(4, 4))).toBe(1);
  expect(jpegOrientation(makeJpeg(4, 4, { orientation: 6 }))).toBe(6);
  expect(usableAsIs(makeJpeg(4, 4))).toBe("jpeg");
  expect(usableAsIs(makeJpeg(4, 4, { orientation: 6 }))).toBeNull();
  expect(usableAsIs(makePng(4, 4))).toBe("png");
  expect(usableAsIs(new TextEncoder().encode("RIFF....WEBP"))).toBeNull();
});

test("images start at 96 dpi, no bigger than half the page, and resize keeping their shape", () => {
  expect(startingSize({ width: 200, height: 100 }, { width: 600, height: 800 })).toEqual({ width: 150, height: 75 });
  expect(startingSize({ width: 4000, height: 2000 }, { width: 600, height: 800 })).toEqual({ width: 300, height: 150 });
  const image: ImageItem = { id: "p", kind: "image", page: 0, x: 0, y: 0, width: 200, height: 100, asset: "a" };
  expect(resizeImage(image, 100)).toEqual({ width: 100, height: 50 });
  expect(resizeImage(image, 1)).toEqual({ width: 16, height: 8 });
});

test("each picture goes into the edits once, however many items use it", () => {
  const asset = { id: "a", name: "a.png", bytes: new Uint8Array([1]), url: "" };
  const image = (id: string, page: number): ImageItem => ({
    id,
    kind: "image",
    page,
    x: 1,
    y: 2,
    width: 3,
    height: 4,
    asset: "a",
  });
  const edits = toEdits([image("x", 0), image("y", 1)], new Map([["a", asset]]));
  expect(edits.images).toEqual([asset.bytes]);
  expect(edits.pages.map((page) => page.marks)).toEqual([
    [{ type: "image", image: 0, x: 1, y: 2, width: 3, height: 4 }],
    [{ type: "image", image: 0, x: 1, y: 2, width: 3, height: 4 }],
  ]);
  expect(() => toEdits([image("x", 0)])).toThrow(/no picture/);
});

test("strokes drop points too close to keep, and move with their item", () => {
  const points = [0, 0.2, 0.5, 1.5, 1.6, 3].map((x) => ({ x, y: 0 }));
  expect(thinStroke(points).map((p) => p.x)).toEqual([0, 1.5, 3]);
  const ink: InkItem = {
    id: "s",
    kind: "ink",
    page: 0,
    points: [
      { x: 10, y: 10 },
      { x: 20, y: 30 },
    ],
    color: [0, 0, 0],
    width: 2,
    opacity: 1,
    x: 10,
    y: 10,
  };
  expect(moveItem(ink, 5, -5, { width: 100, height: 100 })).toEqual({
    x: 15,
    y: 5,
    points: [
      { x: 15, y: 5 },
      { x: 25, y: 25 },
    ],
  });
  expect(toEdits([ink]).pages[0]!.annotations).toEqual([
    { type: "ink", strokes: [ink.points], color: [0, 0, 0], width: 2 },
  ]);
});

test("a rewritten line takes the old one out, and changes nothing until its words or place do", () => {
  const line = {
    text: "Old words",
    box: [72, 100, 150, 116] as [number, number, number, number],
    x: 72,
    y: 112,
    size: 12,
    fontName: "Helvetica",
    font: "helvetica" as const,
    bold: false,
    italic: false,
    exact: true,
    color: [0, 0, 0] as const,
  };
  const item = rewriteLine(line, 2);
  expect(unchanged(item)).toBe(true);
  expect(unchanged({ ...item, text: "New words" })).toBe(false);
  expect(unchanged({ ...item, moved: true })).toBe(false);
  expect(toEdits([{ ...item, text: "New words" }]).pages).toEqual([
    {
      page: 2,
      removeText: [line.box],
      marks: [expect.objectContaining({ type: "text", text: "New words", x: 72, y: 112, size: 12 })],
    },
  ]);
  // Emptied, the line still comes out.
  expect(toEdits([{ ...item, text: "" }]).pages).toEqual([{ page: 2, marks: [], removeText: [line.box] }]);
});
