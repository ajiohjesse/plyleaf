// Redact PDF: what's in the marked areas is taken out of the file for good (text, the covered pixels of images,
// drawings inside them, annotations, links and form fields over them) and a black box drawn in its place. And finding
// text to redact, by words or a pattern.
import * as mupdf from "mupdf";
import { findMatches, overlap, type PageChar, type TextMatch } from "~/redact/search";
import { checkPageIndex } from "./ops";
import { EngineError } from "./errors";
import type { Box } from "./types";

/**
 * Redacts the areas `boxes` (points from the shown page's top-left) of page `index`. Text whose characters touch an
 * area is removed, images lose the covered pixels, drawings wholly inside an area go, and so do annotations, links and
 * form field widgets that overlap one. Each area is then painted black.
 */
export function redactPage(pdf: mupdf.PDFDocument, index: number, boxes: readonly Box[]) {
  checkPageIndex(pdf, index);
  const areas = boxes.filter(([x0, y0, x1, y1]) => x1 > x0 && y1 > y0);
  if (areas.length === 0) return;
  const page = pdf.loadPage(index);
  try {
    const [x0, y0] = page.getBounds();
    const placed = areas.map(([left, top, right, bottom]): Box => [left + x0, top + y0, right + x0, bottom + y0]);
    const covered = (rect: readonly number[]) => placed.some((area) => overlap(area, rect as unknown as Box));
    for (const link of page.getLinks()) if (covered(link.getBounds())) page.deleteLink(link);
    for (const widget of page.getWidgets()) if (covered(widget.getBounds())) removeWidget(pdf, page, widget);
    for (const annot of page.getAnnotations()) {
      if (annot.getType() !== "Redact" && covered(annot.getBounds())) page.deleteAnnotation(annot);
    }
    for (const area of placed) page.createAnnotation("Redact").setRect(area);
    page.applyRedactions(
      true,
      mupdf.PDFPage.REDACT_IMAGE_PIXELS,
      mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
      mupdf.PDFPage.REDACT_TEXT_REMOVE,
    );
  } finally {
    page.destroy();
  }
}

/**
 * Takes a form field's widget off its page and out of the form. Its drawn appearance goes with it, and the field's
 * value too unless another widget (on another page, say) still shows it.
 */
function removeWidget(pdf: mupdf.PDFDocument, page: mupdf.PDFPage, widget: mupdf.PDFWidget) {
  const object = widget.getObject();
  // The field the value belongs to: the widget itself, or the parent it's a kid of.
  const field = object.get("T").isNull() && object.get("Parent").isDictionary() ? object.get("Parent") : object;
  const parent = object.get("Parent");
  const siblings = parent.isDictionary()
    ? parent.get("Kids")
    : pdf.getTrailer().get("Root").get("AcroForm").get("Fields");
  if (siblings.isArray()) {
    for (let i = siblings.length - 1; i >= 0; i--) {
      if (siblings.get(i).asIndirect() === object.asIndirect()) siblings.delete(i);
    }
  }
  const othersShowIt = field !== object && field.get("Kids").isArray() && field.get("Kids").length > 0;
  if (!othersShowIt) {
    field.delete("V");
    field.delete("DV");
  }
  object.delete("AP");
  object.delete("V");
  page.deleteAnnotation(widget);
}

/** A page's characters, line by line, with their boxes from the shown page's top-left. */
export function pageChars(pdf: mupdf.PDFDocument, index: number): PageChar[][] {
  checkPageIndex(pdf, index);
  const page = pdf.loadPage(index);
  try {
    const [x0, y0] = page.getBounds();
    const text = page.toStructuredText("preserve-whitespace");
    const lines: PageChar[][] = [];
    let line: PageChar[] = [];
    try {
      text.walk({
        beginLine() {
          line = [];
        },
        onChar(char, _origin, _font, _size, quad) {
          const xs = [quad[0], quad[2], quad[4], quad[6]];
          const ys = [quad[1], quad[3], quad[5], quad[7]];
          line.push({
            char,
            box: [Math.min(...xs) - x0, Math.min(...ys) - y0, Math.max(...xs) - x0, Math.max(...ys) - y0],
          });
        },
        endLine() {
          if (line.length > 0) lines.push(line);
        },
      });
    } finally {
      text.destroy();
    }
    return lines;
  } finally {
    page.destroy();
  }
}

/** Every match of a regular expression (given as source and flags) on each page, in page order. */
export function findText(
  pdf: mupdf.PDFDocument,
  source: string,
  flags: string,
): { page: number; matches: TextMatch[] }[] {
  let expression: RegExp;
  try {
    expression = new RegExp(source, flags.includes("g") ? flags : `${flags}g`);
  } catch {
    throw new EngineError("invalid-argument", `Not a search the engine can run: ${source}`);
  }
  const found: { page: number; matches: TextMatch[] }[] = [];
  for (let page = 0; page < pdf.countPages(); page++) {
    const matches = findMatches(pageChars(pdf, page), expression);
    if (matches.length > 0) found.push({ page, matches });
  }
  return found;
}

/** How many characters (not counting spaces) each page's text has: 0 for a page that's only a picture, like a scan. */
export function textAmounts(pdf: mupdf.PDFDocument): number[] {
  const amounts: number[] = [];
  for (let page = 0; page < pdf.countPages(); page++) {
    amounts.push(
      pageChars(pdf, page)
        .flat()
        .filter(({ char }) => char.trim() !== "").length,
    );
  }
  return amounts;
}
