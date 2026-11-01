// The page tools (page numbers, watermark, header and footer, Bates numbering) put the same kind of thing on many
// pages: a line of text at a position. This works out where, page by page, as text marks for the engine.
import type { Edits, Mark, PageInfo, Rgb, StandardFont, TextMark } from "~/engine/types";

export type Vertical = "top" | "middle" | "bottom";
export type Horizontal = "left" | "center" | "right";

export interface Position {
  vertical: Vertical;
  horizontal: Horizontal;
}

export interface TextStyle {
  font: StandardFont;
  bold: boolean;
  /** In points. */
  size: number;
  color: Rgb;
}

export const DEFAULT_STYLE: TextStyle = { font: "helvetica", bold: false, size: 11, color: [0, 0, 0] };

/** How far above the baseline a standard font's capitals reach, and how far below it its descenders go, per point. */
const CAP_HEIGHT = 0.72;
const DESCENT = 0.22;

/**
 * A line of text at a position on a page, `margin` points in from the page's edges: at the top its capitals start
 * at the margin, at the bottom its descenders end there; in the middle it's centred.
 */
export function placedText(
  page: Pick<PageInfo, "width" | "height">,
  position: Position,
  margin: number,
  style: TextStyle,
  text: string,
): TextMark {
  const x =
    position.horizontal === "left" ? margin : position.horizontal === "right" ? page.width - margin : page.width / 2;
  const y =
    position.vertical === "top"
      ? margin + style.size * CAP_HEIGHT
      : position.vertical === "bottom"
        ? page.height - margin - style.size * DESCENT
        : page.height / 2 + (style.size * CAP_HEIGHT) / 2;
  return { type: "text", text, x, y, align: position.horizontal, ...style };
}

/** What a page's text can say about it. */
export interface TokenValues {
  /** The page's number, as it's counted. */
  page: number;
  /** The last number counted. */
  pages: number;
  date: string;
  file: string;
}

/** Fills {page}, {pages}, {date} and {file} in a line of text. Anything else in braces stays as typed. */
export function fillTokens(template: string, values: TokenValues): string {
  return template.replace(/\{(page|pages|date|file)\}/g, (_, token: keyof TokenValues) => String(values[token]));
}

/** Which pages get the text: every one, or only from a page on (to leave out a cover, say). Numbered from 1. */
export interface PageChoice {
  from: number;
  /** The number the first page that gets one shows. */
  startAt: number;
}

/**
 * Marks for each chosen page, made by `markFor` from the page and its count (`startAt` on the first chosen page, then
 * one more on each).
 */
export function marksOnPages(
  pages: readonly Pick<PageInfo, "width" | "height">[],
  choice: PageChoice,
  markFor: (page: Pick<PageInfo, "width" | "height">, count: number, last: number) => Mark[],
): Edits {
  const first = Math.max(1, Math.min(choice.from, pages.length)) - 1;
  const last = choice.startAt + (pages.length - first) - 1;
  return {
    pages: pages.slice(first).map((page, i) => ({ page: first + i, marks: markFor(page, choice.startAt + i, last) })),
  };
}

/** Today's date as the user's locale writes it, for {date}. */
export const today = () => new Date().toLocaleDateString();
