// A page's text as MuPDF reads it, for choosing text to mark up. Points are measured from the shown page's top-left,
// like everything the editor sends.
import * as mupdf from "mupdf";
import { checkPageIndex } from "./ops";
import type { Box, Quad, Rgb, StandardFont, TextLine, TextSelection } from "./types";

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

const STANDARD_NAMES = /^(Helvetica|Arial|Times|Courier|Nimbus(Sans|Roman|Mono))/i;

/** The standard font closest to a font, by its name first (a font's own flags are often missing), then its flags. */
export function closestFont(font: mupdf.Font): { font: StandardFont; bold: boolean; italic: boolean; exact: boolean } {
  const name = font.getName().replace(/^[A-Z]{6}\+/, "");
  const standard: StandardFont = /courier|mono|consol|menlo/i.test(name)
    ? "courier"
    : /sans|helvetica|arial|verdana|calibri|segoe|roboto|gothic/i.test(name)
      ? "helvetica"
      : /times|roman|serif|georgia|garamond|cambria|minion|book/i.test(name)
        ? "times"
        : font.isMono()
          ? "courier"
          : font.isSerif()
            ? "times"
            : "helvetica";
  return {
    font: standard,
    bold: font.isBold() || /bold|black|heavy|semibold|demi/i.test(name),
    italic: font.isItalic() || /italic|oblique/i.test(name),
    exact: STANDARD_NAMES.test(name),
  };
}

/** Each line of horizontal text on a page as it's shown, with how it looks (from its first character). */
export function textLines({ text, origin: [x0, y0] }: PageText): TextLine[] {
  const lines: TextLine[] = [];
  let current: { box: Box; chars: string; first: Omit<TextLine, "text" | "box"> | null } | null = null;
  text.walk({
    beginLine(bbox, wmode, direction) {
      // Only text running left to right as shown can be changed.
      const across = wmode === 0 && Math.abs(direction[0] - 1) < 0.01 && Math.abs(direction[1]) < 0.01;
      current = across
        ? { box: [bbox[0] - x0, bbox[1] - y0, bbox[2] - x0, bbox[3] - y0], chars: "", first: null }
        : null;
    },
    onChar(char, origin, font, size, _quad, color) {
      if (!current) return;
      current.chars += char;
      if (current.first) return;
      const rgb = (color.length === 3 ? color : color.length === 1 ? [color[0], color[0], color[0]] : [0, 0, 0]) as Rgb;
      current.first = {
        x: origin[0] - x0,
        y: origin[1] - y0,
        size: Math.round(size * 100) / 100,
        fontName: font.getName().replace(/^[A-Z]{6}\+/, ""),
        ...closestFont(font),
        color: rgb,
      };
    },
    endLine() {
      const line = current;
      current = null;
      if (!line?.first || !line.chars.trim()) return;
      lines.push({ text: line.chars.trimEnd(), box: line.box, ...line.first });
    },
  });
  return lines;
}
