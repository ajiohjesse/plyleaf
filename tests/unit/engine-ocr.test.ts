import * as mupdf from "mupdf";
import { createWorker, OEM } from "tesseract.js";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { findText, openPdf, pageImage, textAmounts, transform } from "~/engine/ops";
import { ocrResolution } from "~/ocr/resolution";
import { queryExpression } from "~/redact/search";
import { scannedPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";
import { readWithPdfjs } from "../helpers/viewers";

// Tesseract in Node, reading the same data files the site serves.
let worker: Awaited<ReturnType<typeof createWorker>>;
beforeAll(async () => {
  worker = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath: "node_modules/@tesseract.js-data/eng/4.0.0_best_int",
    cacheMethod: "none",
  });
}, 60_000);
afterAll(() => worker?.terminate());

const opened: { destroy: () => void }[] = [];
afterEach(() => {
  for (const thing of opened.splice(0)) thing.destroy();
});
const open = (bytes: Uint8Array) => {
  const pdf = openPdf(bytes);
  opened.push(pdf);
  return pdf;
};

/** What OCR PDF does for one page: render it, read it, and keep Tesseract's text-only page. */
async function read(pdf: mupdf.PDFDocument, page: number) {
  const bounds = pdf.loadPage(page).getBounds();
  const dpi = ocrResolution({ width: bounds[2] - bounds[0], height: bounds[3] - bounds[1] });
  await worker.setParameters({ user_defined_dpi: String(dpi) });
  const { data } = await worker.recognize(
    Buffer.from(pageImage(pdf, page, { dpi, format: "png" })),
    { pdfTextOnly: true },
    { pdf: true, text: true },
  );
  return { text: data.text, layer: new Uint8Array(data.pdf!) };
}

const LINES = ["Invoice number 4821", "Payment is due within thirty days"];

for (const turned of [false, true]) {
  test(`a scanned page${turned ? " stored sideways" : ""} gets searchable text where its words are`, async () => {
    const pdf = open(scannedPdf(LINES, { turned }));
    expect(textAmounts(pdf)).toEqual([0]);
    const { text, layer } = await read(pdf, 0);
    expect(text).toContain("Invoice number 4821");
    const output = transform(pdf, { textLayers: [{ page: 0, pdf: layer }] });
    expect(await qpdfCheck(output)).toBe(0);

    const result = open(output);
    expect(result.loadPage(0).toStructuredText("preserve-whitespace").asText()).toContain(
      "Payment is due within thirty days",
    );
    // The words sit over the picture of them: "Invoice" starts 72 pt in, its baseline 100 pt down.
    const [found] = findText(
      result,
      ...(Object.values(queryExpression({ kind: "words", text: "Invoice" })!) as [string, string]),
    );
    const [left, top, right, bottom] = found!.matches[0]!.boxes[0]!;
    expect(left).toBeGreaterThan(68);
    expect(left).toBeLessThan(76);
    expect(right).toBeGreaterThan(100);
    expect(top).toBeGreaterThan(84);
    expect(bottom).toBeLessThan(108);
    // Invisible: the page looks as it did.
    const before = open(scannedPdf(LINES, { turned }))
      .loadPage(0)
      .toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, false, true);
    const after = result.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, false, true);
    expect(after.getPixels()).toEqual(before.getPixels());
    before.destroy();
    after.destroy();

    const [page] = await readWithPdfjs(output);
    expect(page!.text).toContain("Invoice");
  }, 60_000);
}

test("a text layer that isn't a one-page PDF is refused", () => {
  const pdf = open(scannedPdf(LINES));
  expect(() => transform(pdf, { textLayers: [{ page: 0, pdf: new Uint8Array([1, 2, 3]) }] })).toThrow(/isn't a PDF/);
  expect(() => transform(pdf, { textLayers: [{ page: 3, pdf: new Uint8Array([1, 2, 3]) }] })).toThrow(/Page 4/);
});
