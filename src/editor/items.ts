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

export interface ImageItem {
  id: ItemId;
  kind: "image";
  page: number;
  /** The top-left corner… */
  x: number;
  y: number;
  /** …and size, in points. */
  width: number;
  height: number;
  /** The picture, from the editor's assets. */
  asset: AssetId;
}

export type Item = TextItem | ImageItem;

export type AssetId = string;

/** A picture added in the editor. Items point to it, so undo and redo never copy its bytes. */
export interface Asset {
  id: AssetId;
  name: string;
  /** JPEG or PNG. */
  bytes: Uint8Array;
  /** An object URL that shows it on the page. */
  url: string;
}

/** How new text looks, and what the text options show. */
export type TextStyle = Pick<TextItem, "font" | "bold" | "italic" | "size" | "color">;

export const DEFAULT_TEXT: TextStyle = { font: "helvetica", bold: false, italic: false, size: 16, color: [0, 0, 0] };

export const MIN_TEXT_SIZE = 4;
export const MAX_TEXT_SIZE = 200;
/** Images are never made smaller than this many points on a side. */
export const MIN_IMAGE_SIDE = 8;

let counter = 0;
/** A new id, unique on this page load. */
export const newId = (): ItemId => `i${++counter}`;

type Patch = Partial<Omit<TextItem, "id" | "kind">> | Partial<Omit<ImageItem, "id" | "kind">>;

export function updateItem(items: readonly Item[], id: ItemId, patch: Patch): Item[] {
  return items.map((item) => (item.id === id ? ({ ...item, ...patch } as Item) : item));
}

export const removeItem = (items: readonly Item[], id: ItemId): Item[] => items.filter((item) => item.id !== id);

/** Moves an item by (dx, dy) points, keeping its anchor on the page. */
export function moveItem(
  item: Item,
  dx: number,
  dy: number,
  page: { width: number; height: number },
): { x: number; y: number } {
  return { x: clamp(item.x + dx, 0, page.width), y: clamp(item.y + dy, 0, page.height) };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** An image resized to `width` points wide, keeping its shape, and never smaller than MIN_IMAGE_SIDE. */
export function resizeImage(item: ImageItem, width: number): { width: number; height: number } {
  const ratio = item.height / item.width;
  const next = Math.max(MIN_IMAGE_SIDE / Math.min(1, ratio), width);
  return { width: next, height: next * ratio };
}

/** An item has nothing to draw (text with no characters). */
export const isEmpty = (item: Item) => item.kind === "text" && item.text.trim() === "";

/**
 * The items as the engine's edits, page by page in page order. Empty items are left out; each picture used goes into
 * the edits' images once.
 */
export function toEdits(items: readonly Item[], assets: ReadonlyMap<AssetId, Asset> = new Map()): Edits {
  const byPage = new Map<number, Mark[]>();
  const images: Uint8Array[] = [];
  const imageIndex = new Map<AssetId, number>();

  function toMark(item: Item): Mark {
    if (item.kind === "text") {
      const { x, y, text, font, bold, italic, size, color } = item;
      return { type: "text", x, y, text, font, bold, italic, size, color };
    }
    let index = imageIndex.get(item.asset);
    if (index === undefined) {
      const asset = assets.get(item.asset);
      if (!asset) throw new Error(`There's no picture ${item.asset}`);
      index = images.push(asset.bytes) - 1;
      imageIndex.set(item.asset, index);
    }
    const { x, y, width, height } = item;
    return { type: "image", image: index, x, y, width, height };
  }

  for (const item of items) {
    if (isEmpty(item)) continue;
    byPage.set(item.page, [...(byPage.get(item.page) ?? []), toMark(item)]);
  }
  return {
    pages: [...byPage.entries()].sort(([a], [b]) => a - b).map(([page, marks]) => ({ page, marks })),
    ...(images.length > 0 && { images }),
  };
}

/** "#rrggbb" for a colour input. */
export function toHex([r, g, b]: Rgb): string {
  const hex = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function fromHex(hex: string): Rgb {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}
