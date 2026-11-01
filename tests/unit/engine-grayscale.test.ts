import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { openPdf, pageImages, transform } from "~/engine/ops";
import { imagesPdf } from "../helpers/images";
import { A4, makePdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const opened: mupdf.PDFDocument[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});
const open = (bytes: Uint8Array) => {
  const doc = new mupdf.PDFDocument(bytes);
  opened.push(doc);
  return doc;
};

/** The largest difference between a pixel's red, green and blue on page `index` (0 means grey everywhere). */
function maxColourfulness(doc: mupdf.PDFDocument, index: number) {
  const pixmap = doc.loadPage(index).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const pixels = pixmap.getPixels();
  let most = 0;
  for (let y = 0; y < pixmap.getHeight(); y++) {
    for (let x = 0; x < pixmap.getWidth(); x++) {
      const i = y * pixmap.getStride() + x * 3;
      most = Math.max(
        most,
        Math.max(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) - Math.min(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!),
      );
    }
  }
  pixmap.destroy();
  return most;
}

test("vectors and text go grey by their luminosity, and stay text", async () => {
  const source = makePdf([A4, A4]);
  expect(maxColourfulness(open(source), 0)).toBeGreaterThan(200);
  const output = transform(openPdf(source), { grayscale: true });
  const doc = open(output);
  for (const page of [0, 1]) expect(maxColourfulness(doc, page)).toBeLessThanOrEqual(2);
  // Red (255, 0, 0) has a luminosity of about 30%.
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const grey = pixmap.getPixels()[100 * pixmap.getStride() + 100 * 3]!;
  pixmap.destroy();
  expect(grey).toBeGreaterThan(60);
  expect(grey).toBeLessThan(95);
  expect(doc.loadPage(1).toStructuredText("").asText()).toContain("Page 2");
  expect(await qpdfCheck(output)).toBe(0);
});

test("images become grey for real", async () => {
  const output = transform(openPdf(imagesPdf().bytes), { grayscale: true });
  const doc = open(output);
  for (const page of [0, 1]) {
    for (const { ref } of pageImages(doc, page)) {
      const image = doc.loadImage(ref);
      expect(image.getColorSpace()?.getType()).toBe("Gray");
      image.destroy();
    }
    expect(maxColourfulness(doc, page)).toBeLessThanOrEqual(2);
  }
  expect(await qpdfCheck(output)).toBe(0);
});

test("pages sharing one resources dictionary share one blend mode", async () => {
  const doc = new mupdf.PDFDocument();
  const resources = doc.addObject({ ExtGState: {} });
  for (let i = 0; i < 3; i++)
    doc.insertPage(-1, doc.addPage([0, 0, 200, 200], 0, resources, "0 0 1 rg 0 0 100 100 re f"));
  const buffer = doc.saveToBuffer("compress");
  const output = transform(openPdf(buffer.asUint8Array()), { grayscale: true });
  buffer.destroy();
  doc.destroy();
  const result = open(output);
  const states: string[] = [];
  result
    .findPage(0)
    .get("Resources")
    .get("ExtGState")
    .forEach((_, key) => states.push(String(key)));
  expect(states).toEqual(["PlyleafGrey"]);
  for (const page of [0, 1, 2]) expect(maxColourfulness(result, page)).toBeLessThanOrEqual(2);
  expect(await qpdfCheck(output)).toBe(0);
});
