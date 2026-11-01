// Page ranges as people type them: "1-3, 5, 8-". Pages are numbered from 1 here and in everything the user sees;
// callers turn them into 0-based indexes for the engine.

/** A run of pages, first to last inclusive, numbered from 1. */
export interface PageRange {
  first: number;
  last: number;
}

export type RangesResult = { ok: true; ranges: PageRange[] } | { ok: false; error: string };

/**
 * Reads ranges separated by commas, semicolons or spaces: "5" is one page, "1-3" a run, "8-" page 8 to the end and
 * "-3" the start to page 3. Dashes may be any kind (-, –, —) with spaces around them. Each range is kept as typed, in
 * order, so ranges can overlap. Errors are written to show the user.
 */
export function parseRanges(text: string, pageCount: number): RangesResult {
  const tokens = text
    .replace(/\s*[-‐-―−]\s*/g, "-")
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: "Type the pages, like 1-3, 5." };
  const ranges: PageRange[] = [];
  const pages = pageCount === 1 ? "1 page" : `${pageCount} pages`;
  for (const token of tokens) {
    const match = /^(\d*)-(\d*)$|^(\d+)$/.exec(token);
    if (!match || token === "-") return { ok: false, error: `“${token}” isn't a page or a range, like 1-3.` };
    const single = match[3];
    const first = single ? Number(single) : match[1] ? Number(match[1]) : 1;
    const last = single ? Number(single) : match[2] ? Number(match[2]) : pageCount;
    if (first < 1 || last < 1) return { ok: false, error: "Pages start at 1." };
    if (first > pageCount || last > pageCount) {
      return { ok: false, error: `This file has ${pages}, so there's no page ${Math.max(first, last)}.` };
    }
    if (first > last) return { ok: false, error: `“${token}” goes backwards. Try ${last}-${first}.` };
    ranges.push({ first, last });
  }
  return { ok: true, ranges };
}

/** Consecutive ranges of `size` pages each, the last one shorter if the pages don't divide evenly. */
export function everyN(size: number, pageCount: number): PageRange[] {
  const ranges: PageRange[] = [];
  for (let first = 1; first <= pageCount; first += size) {
    ranges.push({ first, last: Math.min(first + size - 1, pageCount) });
  }
  return ranges;
}

/** "page 5" or "pages 1–3", for labels. */
export function describeRange({ first, last }: PageRange): string {
  return first === last ? `page ${first}` : `pages ${first}–${last}`;
}

export const rangeLength = ({ first, last }: PageRange) => last - first + 1;

/** The pages the ranges cover, as 0-based indexes in page order, each once. */
export function pagesInRanges(ranges: readonly PageRange[]): number[] {
  const pages = new Set<number>();
  for (const { first, last } of ranges) for (let page = first; page <= last; page++) pages.add(page - 1);
  return [...pages].sort((a, b) => a - b);
}
