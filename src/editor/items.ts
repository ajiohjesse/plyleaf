// What the user has added in the editor, and how it becomes the engine's edits. Items are measured like marks: PDF
// points from the top-left of the page as it's shown. The list is in drawing order, so later items are on top.
import type { Annotation, Box, Edits, Mark, Quad, Rgb, ShapeKind, StandardFont, TextLine } from "~/engine/types";

export { NOTE_SIZE, STAMP_RATIO } from "~/engine/types";

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
  /** Moved since it was placed (a rewritten line that's moved counts as changed even with the same words). */
  moved?: boolean;
  /** A line of the page's own text this rewrites: it's taken out of the page, and this text written in its place. */
  replaces?: { box: Box; text: string; fontName: string; exact: boolean };
}

/** A text item rewriting a line of the page, starting as the line is: same words, place and look. */
export function rewriteLine(line: TextLine, page: number): TextItem {
  const { text, box, x, y, size, font, bold, italic, color, fontName, exact } = line;
  return {
    id: newId(),
    kind: "text",
    page,
    x,
    y,
    text,
    font,
    bold,
    italic,
    size,
    color,
    replaces: { box, text, fontName, exact },
  };
}

/** A rewritten line that still says what it said, and so changes nothing (but the font, for a non-standard one). */
export const unchanged = (item: Item) => item.kind === "text" && item.replaces?.text === item.text && !item.moved;

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

export interface ShapeItem {
  id: ItemId;
  kind: "shape";
  page: number;
  shape: ShapeKind;
  /** A rectangle's or ellipse's top-left corner, or where a line starts… */
  x: number;
  y: number;
  /** …and its size, or how far the line's end is from its start (either sign). */
  width: number;
  height: number;
  stroke: Rgb | null;
  fill: Rgb | null;
  lineWidth: number;
}

/**
 * A box in one colour (white unless the page is another colour) that covers what's under it. It hides, it doesn't
 * remove: the text underneath is still in the file.
 */
export interface WhiteoutItem {
  id: ItemId;
  kind: "whiteout";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: Rgb;
}

export type MarkupStyle = "highlight" | "underline" | "strikeout";

/**
 * Text on the page marked up: saved as a PDF annotation (a highlight, underline or strike-out), which readers list as
 * a comment. It's where the text is, so it doesn't move; x and y are its top-left, for the selection frame.
 */
export interface MarkupItem {
  id: ItemId;
  kind: "markup";
  page: number;
  style: MarkupStyle;
  quads: Quad[];
  /** The text it marks, for its label. */
  text: string;
  color: Rgb;
  x: number;
  y: number;
}

/** A freehand stroke, saved as an ink annotation. x and y are the top-left of what it covers. */
export interface InkItem {
  id: ItemId;
  kind: "ink";
  page: number;
  points: { x: number; y: number }[];
  color: Rgb;
  width: number;
  /** 1, or less to see through it like a highlighter pen. */
  opacity: number;
  x: number;
  y: number;
}

/** A comment, saved as a note annotation: its icon's top-left is at (x, y). */
export interface NoteItem {
  id: ItemId;
  kind: "note";
  page: number;
  x: number;
  y: number;
  text: string;
  color: Rgb;
}

export const NOTE_COLOUR: Rgb = [1, 0.83, 0.23];

/** A rubber stamp, saved as a stamp annotation: a standard stamp name, or words of the user's own. */
export interface StampItem {
  id: ItemId;
  kind: "stamp";
  page: number;
  x: number;
  y: number;
  /** Its height is always STAMP_RATIO of this. */
  width: number;
  name: string;
  color: Rgb;
}

/** The standard stamps offered, by their PDF names, and how they read. */
export const STAMPS: readonly { name: string; label: string; color: Rgb }[] = [
  { name: "Approved", label: "APPROVED", color: [0.09, 0.55, 0.27] },
  { name: "NotApproved", label: "NOT APPROVED", color: [0.85, 0.11, 0.18] },
  { name: "Draft", label: "DRAFT", color: [0.15, 0.39, 0.92] },
  { name: "Final", label: "FINAL", color: [0.09, 0.55, 0.27] },
  { name: "Confidential", label: "CONFIDENTIAL", color: [0.85, 0.11, 0.18] },
  { name: "ForComment", label: "FOR COMMENT", color: [0.15, 0.39, 0.92] },
  { name: "Expired", label: "EXPIRED", color: [0.85, 0.11, 0.18] },
];

/** What a stamp says: a standard stamp's words in capitals, or the user's own as typed. */
export const stampLabel = (name: string) => STAMPS.find((stamp) => stamp.name === name)?.label ?? name;

/** A stamp placed with a click is this wide. */
export const STAMP_WIDTH = 160;
export const MIN_STAMP_WIDTH = 40;

export type Item = TextItem | ImageItem | ShapeItem | WhiteoutItem | MarkupItem | InkItem | NoteItem | StampItem;

/** How new strokes look. */
export type InkStyle = Pick<InkItem, "color" | "width" | "opacity">;

export const DEFAULT_INK: InkStyle = { color: [0.15, 0.39, 0.92], width: 3, opacity: 1 };
export const MIN_INK_WIDTH = 0.5;
export const MAX_INK_WIDTH = 30;

/**
 * A stroke from the points a pointer went through: points closer than `step` to the last one kept are dropped (they
 * add nothing a reader can see), the last point always stays.
 */
export function thinStroke(points: readonly { x: number; y: number }[], step = 1): { x: number; y: number }[] {
  const kept: { x: number; y: number }[] = [];
  points.forEach((point, i) => {
    const last = kept.at(-1);
    if (!last || i === points.length - 1 || Math.hypot(point.x - last.x, point.y - last.y) >= step) kept.push(point);
  });
  return kept;
}

/** An ink item's top-left, from its points. */
export function inkOrigin(points: readonly { x: number; y: number }[]) {
  return { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)) };
}

/** The usual colour for each kind of markup. */
export const MARKUP_COLOURS: Record<MarkupStyle, Rgb> = {
  highlight: [1, 0.89, 0.2],
  underline: [0.15, 0.39, 0.92],
  strikeout: [0.85, 0.11, 0.18],
};

/** The box (x0, y0, x1, y1) round some quads. */
export function quadBounds(quads: readonly Quad[]): [number, number, number, number] {
  const xs = quads.flatMap((quad) => [quad[0], quad[2], quad[4], quad[6]]);
  const ys = quads.flatMap((quad) => [quad[1], quad[3], quad[5], quad[7]]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export const WHITE: Rgb = [1, 1, 1];

/** How new shapes look, and what the shape options show. */
export type ShapeStyle = Pick<ShapeItem, "shape" | "stroke" | "fill" | "lineWidth">;

export const DEFAULT_SHAPE: ShapeStyle = { shape: "rectangle", stroke: [0.85, 0.11, 0.18], fill: null, lineWidth: 2 };
export const MIN_LINE_WIDTH = 0.5;
export const MAX_LINE_WIDTH = 24;
/** A shape placed with a click rather than drawn is this big. */
export const CLICKED_SHAPE = { width: 120, height: 80 };
/** Rectangles and ellipses are never smaller than this many points on a side. */
export const MIN_SHAPE_SIDE = 4;

/** A shape drawn from one point to another: a box with its corners there, or a line between them. */
export function drawnShape(style: ShapeStyle, from: { x: number; y: number }, to: { x: number; y: number }) {
  if (style.shape === "line" || style.shape === "arrow") {
    return { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y };
  }
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.max(MIN_SHAPE_SIDE, Math.abs(to.x - from.x)),
    height: Math.max(MIN_SHAPE_SIDE, Math.abs(to.y - from.y)),
  };
}

/** A shape placed with a click at (x, y): a box centred there, or a line starting there. */
export function clickedShape(style: ShapeStyle, x: number, y: number) {
  const { width, height } = CLICKED_SHAPE;
  if (style.shape === "line" || style.shape === "arrow") return { x, y, width, height: 0 };
  return { x: x - width / 2, y: y - height / 2, width, height };
}

/** A shape's new size: boxes keep a minimum, lines can point anywhere. */
export function resizeShape(
  item: Pick<ShapeItem, "shape">,
  width: number,
  height: number,
): { width: number; height: number } {
  if (item.shape === "line" || item.shape === "arrow") return { width, height };
  return { width: Math.max(MIN_SHAPE_SIDE, width), height: Math.max(MIN_SHAPE_SIDE, height) };
}

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

export type Patch =
  | Partial<Omit<TextItem, "id" | "kind">>
  | Partial<Omit<ImageItem, "id" | "kind">>
  | Partial<Omit<ShapeItem, "id" | "kind">>
  | Partial<Omit<WhiteoutItem, "id" | "kind">>
  | Partial<Omit<MarkupItem, "id" | "kind">>
  | Partial<Omit<InkItem, "id" | "kind">>
  | Partial<Omit<NoteItem, "id" | "kind">>
  | Partial<Omit<StampItem, "id" | "kind">>;

export function updateItem(items: readonly Item[], id: ItemId, patch: Patch): Item[] {
  return items.map((item) => (item.id === id ? ({ ...item, ...patch } as Item) : item));
}

export const removeItem = (items: readonly Item[], id: ItemId): Item[] => items.filter((item) => item.id !== id);

/** Moves an item by (dx, dy) points, keeping its anchor on the page. A stroke's points move with it. */
export function moveItem(item: Item, dx: number, dy: number, page: { width: number; height: number }): Patch {
  const x = clamp(item.x + dx, 0, page.width);
  const y = clamp(item.y + dy, 0, page.height);
  if (item.kind !== "ink") return { x, y };
  const [mx, my] = [x - item.x, y - item.y];
  return { x, y, points: item.points.map((point) => ({ x: point.x + mx, y: point.y + my })) };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** An image resized to `width` points wide, keeping its shape, and never smaller than MIN_IMAGE_SIDE. */
export function resizeImage(item: ImageItem, width: number): { width: number; height: number } {
  const ratio = item.height / item.width;
  const next = Math.max(MIN_IMAGE_SIDE / Math.min(1, ratio), width);
  return { width: next, height: next * ratio };
}

/** An item has nothing to draw (text with no characters). */
export const isEmpty = (item: Item) =>
  (item.kind === "note" && item.text.trim() === "") ||
  // Rewritten text left empty still takes the old line out.
  (item.kind === "text" && item.text.trim() === "" && !item.replaces) ||
  (item.kind === "stamp" && item.name.trim() === "");

/**
 * The items as the engine's edits, page by page in page order. Empty items are left out; each picture used goes into
 * the edits' images once.
 */
export function toEdits(items: readonly Item[], assets: ReadonlyMap<AssetId, Asset> = new Map()): Edits {
  const byPage = new Map<number, Mark[]>();
  const annotations = new Map<number, Annotation[]>();
  const removals = new Map<number, Box[]>();
  const images: Uint8Array[] = [];
  const imageIndex = new Map<AssetId, number>();

  function toMark(item: Exclude<Item, MarkupItem | InkItem | NoteItem | StampItem>): Mark {
    if (item.kind === "text") {
      const { x, y, text, font, bold, italic, size, color } = item;
      return { type: "text", x, y, text, font, bold, italic, size, color };
    }
    if (item.kind === "whiteout") {
      const { x, y, width, height, color } = item;
      return { type: "shape", shape: "rectangle", x, y, width, height, stroke: null, fill: color, lineWidth: 0 };
    }
    if (item.kind === "shape") {
      const { shape, x, y, width, height, stroke, fill, lineWidth } = item;
      return { type: "shape", shape, x, y, width, height, stroke, fill, lineWidth };
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
    if (item.kind === "text" && item.replaces) {
      removals.set(item.page, [...(removals.get(item.page) ?? []), item.replaces.box]);
      if (!item.text.trim()) continue;
    }
    if (item.kind === "markup" || item.kind === "ink" || item.kind === "note" || item.kind === "stamp") {
      const annotation: Annotation =
        item.kind === "stamp"
          ? { type: "stamp", x: item.x, y: item.y, width: item.width, name: item.name.trim(), color: item.color }
          : item.kind === "note"
            ? { type: "note", x: item.x, y: item.y, text: item.text, color: item.color }
            : item.kind === "markup"
              ? { type: item.style, quads: item.quads, color: item.color }
              : {
                  type: "ink",
                  strokes: [item.points],
                  color: item.color,
                  width: item.width,
                  ...(item.opacity < 1 && { opacity: item.opacity }),
                };
      annotations.set(item.page, [...(annotations.get(item.page) ?? []), annotation]);
    } else {
      byPage.set(item.page, [...(byPage.get(item.page) ?? []), toMark(item)]);
    }
  }
  const pages = [...new Set([...byPage.keys(), ...annotations.keys(), ...removals.keys()])].sort((a, b) => a - b);
  return {
    pages: pages.map((page) => ({
      page,
      marks: byPage.get(page) ?? [],
      ...(annotations.has(page) && { annotations: annotations.get(page)! }),
      ...(removals.has(page) && { removeText: removals.get(page)! }),
    })),
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
