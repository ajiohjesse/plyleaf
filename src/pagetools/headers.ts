// Header and footer: up to three lines of text at the top of each page and three at the bottom (left, centre,
// right), which can say the page number, the number of pages, the date and the file's name.
import type { Edits, PageInfo } from "~/engine/types";
import { fillTokens, marksOnPages, placedText, type Horizontal, type PageChoice, type TextStyle } from "./stamping";

export type Slot = `${"top" | "bottom"}-${Horizontal}`;

export const SLOTS: readonly { slot: Slot; label: string }[] = [
  { slot: "top-left", label: "Header left" },
  { slot: "top-center", label: "Header centre" },
  { slot: "top-right", label: "Header right" },
  { slot: "bottom-left", label: "Footer left" },
  { slot: "bottom-center", label: "Footer centre" },
  { slot: "bottom-right", label: "Footer right" },
];

export interface HeaderFooterOptions extends PageChoice {
  /** What each place says, with {page}, {pages}, {date} and {file}. Empty places are left out. */
  text: Record<Slot, string>;
  style: TextStyle;
  margin: number;
  /** What {file} and {date} say. */
  file: string;
  date: string;
}

export const EMPTY_SLOTS: Record<Slot, string> = {
  "top-left": "",
  "top-center": "",
  "top-right": "",
  "bottom-left": "",
  "bottom-center": "",
  "bottom-right": "",
};

export function headerFooterEdits(
  pages: readonly Pick<PageInfo, "width" | "height">[],
  options: HeaderFooterOptions,
): Edits {
  const filled = SLOTS.filter(({ slot }) => options.text[slot].trim() !== "");
  return marksOnPages(pages, options, (page, count, last) =>
    filled.map(({ slot }) => {
      const [vertical, horizontal] = slot.split("-") as ["top" | "bottom", Horizontal];
      const text = fillTokens(options.text[slot], { page: count, pages: last, date: options.date, file: options.file });
      return placedText(page, { vertical, horizontal }, options.margin, options.style, text);
    }),
  );
}
