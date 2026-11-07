// PDF to text: putting the pages' text together as one plain-text file.

/** A line that marks where a page starts, like "--- Page 2 ---". */
export const pageMark = (page: number) => `--- Page ${page} ---`;

/**
 * The pages' text as one file: pages a blank line apart, or each under a line saying which page it is. Lines end in
 * "\n"; a page with no text is left empty.
 */
export function joinPages(pages: readonly string[], markPages: boolean): string {
  const parts = markPages
    ? pages.map((text, index) => `${pageMark(index + 1)}\n\n${text}`.trimEnd())
    : pages.filter(Boolean);
  const joined = parts.join("\n\n");
  return joined === "" ? "" : `${joined}\n`;
}

/** Which pages (1-based) have no text: pages that are pictures, like scans. */
export const pagesWithoutText = (pages: readonly string[]) =>
  pages.flatMap((text, index) => (text.trim() === "" ? [index + 1] : []));
