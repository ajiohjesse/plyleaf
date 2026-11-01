import { expect, test } from "vitest";
import { unsupportedCharacters } from "~/editor/fonts";
import { canRedo, canUndo, change, redo, settle, startHistory, undo, UNDO_LIMIT } from "~/editor/history";
import { fromHex, moveItem, removeItem, toEdits, toHex, updateItem, type TextItem } from "~/editor/items";

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
  expect(updateItem(items, "b", { text: "New" })[1]!.text).toBe("New");
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
