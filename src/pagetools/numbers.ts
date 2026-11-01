// Page numbers: a number on each page, in one of the usual styles or words of the user's own.
import type { Edits, PageInfo } from "~/engine/types";
import { fillTokens, marksOnPages, placedText, type PageChoice, type Position, type TextStyle } from "./stamping";

export const NUMBER_FORMATS = [
  { id: "plain", label: "1", template: "{page}" },
  { id: "page", label: "Page 1", template: "Page {page}" },
  { id: "page-of", label: "Page 1 of 9", template: "Page {page} of {pages}" },
  { id: "slash", label: "1 / 9", template: "{page} / {pages}" },
  { id: "dashes", label: "- 1 -", template: "- {page} -" },
] as const;

export interface NumberOptions extends PageChoice {
  position: Position;
  /** Points from the page's edges. */
  margin: number;
  style: TextStyle;
  /** With {page} for the number and {pages} for the last one. */
  template: string;
}

export const DEFAULT_NUMBERS: Omit<NumberOptions, "style"> = {
  position: { vertical: "bottom", horizontal: "center" },
  margin: 28,
  template: NUMBER_FORMATS[0].template,
  from: 1,
  startAt: 1,
};

export function numberText(template: string, page: number, pages: number): string {
  return fillTokens(template, { page, pages, date: "", file: "" });
}

/** The page numbers as the engine's edits. */
export function pageNumberEdits(pages: readonly Pick<PageInfo, "width" | "height">[], options: NumberOptions): Edits {
  return marksOnPages(pages, options, (page, count, last) => [
    placedText(page, options.position, options.margin, options.style, numberText(options.template, count, last)),
  ]);
}
