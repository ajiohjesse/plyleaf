// Builds small PDFs for tests with MuPDF, so fixtures are licence-clean and visible in the code.
import * as mupdf from "mupdf";

export interface TestPage {
  width: number;
  height: number;
  /** /Rotate set on the page itself. */
  rotate?: 0 | 90 | 180 | 270;
}

/**
 * Each page is white with its top-left quadrant filled red and its number written in Helvetica, so a render shows
 * which way up the page is.
 */
export function makePdf(pages: TestPage[], options: { save?: string; inheritedRotate?: number } = {}): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  pages.forEach(({ width, height, rotate = 0 }, i) => {
    const contents = [
      `1 0 0 rg 0 ${height / 2} ${width / 2} ${height / 2} re f`,
      `0 g BT /F1 12 Tf ${width / 2 + 10} 20 Td (Page ${i + 1}) Tj ET`,
    ].join("\n");
    doc.insertPage(-1, doc.addPage([0, 0, width, height], rotate, { Font: { F1: font } }, contents));
  });
  if (options.inheritedRotate !== undefined) {
    doc.getTrailer().get("Root").get("Pages").put("Rotate", options.inheritedRotate);
    // addPage always writes the page's own /Rotate, which would override the inherited one.
    for (let i = 0; i < pages.length; i++) doc.findPage(i).delete("Rotate");
  }
  const buffer = doc.saveToBuffer(options.save ?? "compress");
  const bytes = buffer.asUint8Array().slice();
  buffer.destroy();
  doc.destroy();
  return bytes;
}

export const A4 = { width: 595, height: 842 };
export const LETTER = { width: 612, height: 792 };
