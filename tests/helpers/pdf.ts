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
export function makePdf(
  pages: TestPage[],
  options: { save?: string; inheritedRotate?: number } = {},
): Uint8Array<ArrayBuffer> {
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
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}

export const A4 = { width: 595, height: 842 };
export const LETTER = { width: 612, height: 792 };

/** A one-page A4 PDF showing a big photo-like image stored losslessly (noisy gradients compress badly with Flate). */
export function photoPdf(width = 1600, height = 2200): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument();
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
  const pixels = pixmap.getPixels();
  let seed = 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const i = y * pixmap.getStride() + x * 3;
      pixels[i] = (x * 255) / width;
      pixels[i + 1] = (y * 255) / height;
      pixels[i + 2] = 128 + (seed % 32);
    }
  }
  const image = doc.addImage(new mupdf.Image(pixmap));
  doc.insertPage(
    -1,
    doc.addPage([0, 0, A4.width, A4.height], 0, { XObject: { I: image } }, "q 595 0 0 842 0 0 cm /I Do Q"),
  );
  const buffer = doc.saveToBuffer("compress");
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}
