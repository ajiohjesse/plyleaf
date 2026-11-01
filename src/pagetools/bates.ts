// Bates numbering: a unique identifier on every page of a legal document set, like "ACME000123": a prefix, a number
// counted up page by page and padded to a fixed number of digits, and a suffix.
import type { Edits, PageInfo } from "~/engine/types";
import { marksOnPages, placedText, type PageChoice, type Position, type TextStyle } from "./stamping";

export interface BatesOptions extends PageChoice {
  prefix: string;
  suffix: string;
  /** The number is padded with zeros to at least this many digits. */
  digits: number;
  position: Position;
  margin: number;
  style: TextStyle;
}

export const DEFAULT_BATES: Omit<BatesOptions, "style"> = {
  prefix: "",
  suffix: "",
  digits: 6,
  position: { vertical: "bottom", horizontal: "right" },
  margin: 24,
  from: 1,
  startAt: 1,
};

export function batesLabel(options: Pick<BatesOptions, "prefix" | "suffix" | "digits">, number: number): string {
  return `${options.prefix}${String(number).padStart(options.digits, "0")}${options.suffix}`;
}

export function batesEdits(pages: readonly Pick<PageInfo, "width" | "height">[], options: BatesOptions): Edits {
  return marksOnPages(pages, options, (page, number) => [
    placedText(page, options.position, options.margin, options.style, batesLabel(options, number)),
  ]);
}
