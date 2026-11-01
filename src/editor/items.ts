// What the user has added in the editor, and how it becomes the engine's edits. Items are measured like marks: PDF
// points from the top-left of the page as it's shown. The list is in drawing order, so later items are on top.
import type { Edits, Mark, Rgb, StandardFont } from "~/engine/types";

export type ItemId = string;

export interface TextItem {
  id: ItemId;
  kind: "text";
  page: number;
  /** Where the first line starts… */
  x: number;
  /** …and its baseline. */
  y: number;
  text: string;
  font: StandardFont;
  bold: boolean;
  italic: boolean;
  size: number;
  color: Rgb;
}

export type Item = TextItem;

/** How new text looks, and what the text options show. */
export type TextStyle = Pick<TextItem, "font" | "bold" | "italic" | "size" | "color">;

export const DEFAULT_TEXT: TextStyle = { font: "helvetica", bold: false, italic: false, size: 16, color: [0, 0, 0] };

export const MIN_TEXT_SIZE = 4;
export const MAX_TEXT_SIZE = 200;

let counter = 0;
/** A new id, unique on this page load. */
export const newId = (): ItemId => `i${++counter}`;

export function updateItem(items: readonly Item[], id: ItemId, patch: Partial<Omit<Item, "id" | "kind">>): Item[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export const removeItem = (items: readonly Item[], id: ItemId): Item[] => items.filter((item) => item.id !== id);

/** Moves an item by (dx, dy) points, keeping its anchor on the page. */
export function moveItem(item: Item, dx: number, dy: number, page: { width: number; height: number }): Partial<Item> {
  return { x: clamp(item.x + dx, 0, page.width), y: clamp(item.y + dy, 0, page.height) };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** An item has nothing to draw (text with no characters). */
export const isEmpty = (item: Item) => item.text.trim() === "";

function toMark(item: Item): Mark {
  const { x, y, text, font, bold, italic, size, color } = item;
  return { type: "text", x, y, text, font, bold, italic, size, color };
}

/** The items as the engine's edits, page by page in page order. Empty items are left out. */
export function toEdits(items: readonly Item[]): Edits {
  const byPage = new Map<number, Mark[]>();
  for (const item of items) {
    if (isEmpty(item)) continue;
    byPage.set(item.page, [...(byPage.get(item.page) ?? []), toMark(item)]);
  }
  return {
    pages: [...byPage.entries()].sort(([a], [b]) => a - b).map(([page, marks]) => ({ page, marks })),
  };
}

/** "#rrggbb" for a colour input. */
export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function fromHex(hex: string): Rgb {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}
