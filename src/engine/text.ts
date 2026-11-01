// A page's text as MuPDF reads it, for choosing text to mark up. Points are measured from the shown page's top-left,
// like everything the editor sends.
import * as mupdf from "mupdf";
import { checkPageIndex } from "./ops";
import type { Quad, TextSelection } from "./types";

/** A page's structured text and where its shown top-left corner is in MuPDF's page space. */
export interface PageText {
  text: mupdf.StructuredText;
  origin: [number, number];
}

export function pageText(pdf: mupdf.PDFDocument, index: number): PageText {
  checkPageIndex(pdf, index);
  const page = pdf.loadPage(index);
  try {
    const [x0, y0] = page.getBounds();
    return { text: page.toStructuredText("preserve-whitespace"), origin: [x0, y0] };
  } finally {
    page.destroy();
  }
}

/**
 * The text between two points in reading order, line by line, or (`words`, for a click) the word at `from`. Nothing
 * when there's no text there, as on a scanned page.
 */
export function selectText(
  { text, origin: [x0, y0] }: PageText,
  from: { x: number; y: number },
  to: { x: number; y: number },
  words: boolean,
): TextSelection {
  const a: mupdf.Point = [from.x + x0, from.y + y0];
  const b: mupdf.Point = [to.x + x0, to.y + y0];
  const shown = (quad: mupdf.Quad) => quad.map((n, i) => n - (i % 2 === 0 ? x0 : y0)) as Quad;
  if (words) {
    const quad = text.snap(a, a, "words");
    // MuPDF snaps to the nearest word, however far; only a click on (or right by) a word counts.
    const width = Math.hypot(quad[2] - quad[0], quad[3] - quad[1]);
    if (!(width > 0) || !overlaps(quad, [a[0], a[1], a[0], a[1]])) return { quads: [], text: "" };
    // The word's text: copy across its middle line.
    const middle = (i: number) => (quad[i]! + quad[i + 4]!) / 2;
    return { quads: [shown(quad)], text: text.copy([middle(0), middle(1)], [middle(2), middle(3)]).trim() };
  }
  const quads = text.highlight(a, b);
  // MuPDF snaps to the nearest characters, so a drag through empty space would still pick some up. The drag has to
  // cross some of the text.
  const dragged = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] as const;
  if (!quads.some((quad) => overlaps(quad, dragged))) return { quads: [], text: "" };
  return { quads: quads.map(shown), text: text.copy(a, b).trim() };
}

/** Whether a quad's bounding box and a box (x0, y0, x1, y1) overlap, within a couple of points. */
function overlaps(quad: mupdf.Quad, [x0, y0, x1, y1]: readonly [number, number, number, number], margin = 2) {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  return (
    Math.min(...xs) <= x1 + margin &&
    Math.max(...xs) >= x0 - margin &&
    Math.min(...ys) <= y1 + margin &&
    Math.max(...ys) >= y0 - margin
  );
}
