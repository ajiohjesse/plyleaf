import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { extractImages, findText, openPdf, textAmounts, transform } from "~/engine/ops";
import type { Box } from "~/engine/types";
import { queryExpression } from "~/redact/search";
import { A4, makePdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";
import { readWithPdfjs } from "../helpers/viewers";

const opened: { destroy: () => void }[] = [];
afterEach(() => {
  for (const thing of opened.splice(0)) thing.destroy();
});
const open = (bytes: Uint8Array) => {
  const pdf = openPdf(bytes);
  opened.push(pdf);
  return pdf;
};

const LINES = ["Name: Ada Lovelace", "Email: ada@example.com", "Account 1234 5678 9012", "This line is public"];

/**
 * An A4 page (optionally turned) with LINES in 12 pt Helvetica, baselines 100, 120… points from the top at x = 72; a
 * red picture behind the first two lines; a link over the email; a filled-in text field holding a secret, over the
 * account line; and a highlight with a comment over the name.
 */
function secretsPdf(rotate: 0 | 90 = 0): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 40, 10], false);
  pixmap.clear(255);
  const pixels = pixmap.getPixels();
  for (let i = 0; i < pixels.length; i += 3) [pixels[i + 1], pixels[i + 2]] = [0, 0];
  const image = doc.addImage(new mupdf.Image(pixmap));
  const text = LINES.map((line, i) => `BT /F1 12 Tf 72 ${A4.height - 100 - i * 20} Td (${line}) Tj ET`).join("\n");
  // The picture fills x 60–460, 85–130 points from the top.
  const contents = `q 400 0 0 45 60 ${A4.height - 130} cm /Im1 Do Q\n0 g\n${text}`;
  doc.insertPage(
    -1,
    doc.addPage([0, 0, A4.width, A4.height], rotate, { Font: { F1: font }, XObject: { Im1: image } }, contents),
  );
  const page = doc.loadPage(0);
  const [x0, y0] = page.getBounds();
  const shown = (box: Box): mupdf.Rect => [box[0] + x0, box[1] + y0, box[2] + x0, box[3] + y0];
  if (rotate === 0) {
    page.createLink(shown([100, 108, 220, 124]), "mailto:ada@example.com");
    const highlight = page.createAnnotation("Highlight");
    highlight.setQuadPoints([[110, 88, 190, 88, 110, 104, 190, 104]]);
    highlight.setContents("Ada note");
    highlight.update();
    const appearance = doc.addStream("BT /Helv 10 Tf 2 5 Td (secret value) Tj ET", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 150, 18],
    });
    const pageObject = doc.findPage(0);
    const widget = doc.addObject({
      Type: "Annot",
      Subtype: "Widget",
      FT: "Tx",
      T: "(account)",
      V: "(secret value)",
      Rect: [300, A4.height - 160, 450, A4.height - 142],
      F: 4,
      AP: { N: appearance },
      P: pageObject,
    });
    pageObject.put("Annots", doc.newArray());
    pageObject.get("Annots").push(widget);
    doc
      .getTrailer()
      .get("Root")
      .put("AcroForm", doc.addObject({ Fields: [widget] }));
  }
  page.destroy();
  const bytes = doc.saveToBuffer("compress").asUint8Array().slice();
  doc.destroy();
  return bytes;
}

/** Everything MuPDF reads as text, and the file's bytes with every stream decompressed (where text hides). */
function readBack(bytes: Uint8Array) {
  const doc = open(bytes);
  const text = Array.from({ length: doc.countPages() }, (_, i) =>
    doc.loadPage(i).toStructuredText("preserve-whitespace").asText(),
  ).join("\n");
  const raw = new TextDecoder("latin1").decode(doc.saveToBuffer("decompress").asUint8Array());
  return { text, raw };
}

const matchesOf = (pdf: mupdf.PDFDocument, query: Parameters<typeof queryExpression>[0]) => {
  const expression = queryExpression(query)!;
  return findText(pdf, expression.source, expression.flags);
};

test("finds words and patterns with a box over each match", () => {
  const pdf = open(secretsPdf());
  const [found] = matchesOf(pdf, { kind: "words", text: "ada  LOVELACE" });
  expect(found!.page).toBe(0);
  expect(found!.matches).toHaveLength(1);
  expect(found!.matches[0]!.text).toBe("Ada Lovelace");
  const [left, top, right, bottom] = found!.matches[0]!.boxes[0]!;
  // "Name: " is about 36 points of 12 pt Helvetica; the baseline is 100 points down.
  expect(left).toBeGreaterThan(100);
  expect(left).toBeLessThan(115);
  expect(right).toBeGreaterThan(170);
  expect(top).toBeLessThan(92);
  expect(bottom).toBeGreaterThan(100);
  expect(matchesOf(pdf, { kind: "words", text: "ADA", matchCase: true })).toEqual([]);
  expect(matchesOf(pdf, { kind: "words", text: "ada" })[0]!.matches.map((m) => m.text)).toEqual(["Ada", "ada"]);
  expect(matchesOf(pdf, { kind: "words", text: "Love" })[0]!.matches).toHaveLength(1);
  expect(matchesOf(pdf, { kind: "words", text: "Love", wholeWords: true })).toEqual([]);
  expect(matchesOf(pdf, { kind: "pattern", pattern: "email" })[0]!.matches.map((m) => m.text)).toEqual([
    "ada@example.com",
  ]);
  expect(matchesOf(pdf, { kind: "pattern", pattern: "number" })[0]!.matches.map((m) => m.text)).toEqual([
    "1234 5678 9012",
  ]);
  expect(textAmounts(pdf)).toEqual([LINES.join("").replace(/\s/g, "").length]);
  expect(textAmounts(open(makePdf([{ width: 100, height: 100 }])))).toEqual(["Page1".length]);
});

test("redacted text, pixels, links, comments and fields are gone from the file; the rest stays", async () => {
  const pdf = open(secretsPdf());
  const boxes = [
    ...matchesOf(pdf, { kind: "words", text: "Ada Lovelace" }),
    ...matchesOf(pdf, { kind: "pattern", pattern: "email" }),
    ...matchesOf(pdf, { kind: "pattern", pattern: "number" }),
  ].flatMap(({ matches }) => matches.flatMap((match) => match.boxes));
  // And the field's box.
  boxes.push([300, 142, 450, 160]);
  const output = transform(pdf, { edits: { pages: [{ page: 0, marks: [], redact: boxes }] } });
  expect(await qpdfCheck(output)).toBe(0);

  const { text, raw } = readBack(output);
  for (const secret of ["Lovelace", "ada@example.com", "5678", "secret value", "Ada note", "mailto"]) {
    expect(text).not.toContain(secret);
    expect(raw).not.toContain(secret);
  }
  expect(text).toContain("Name:");
  expect(text).toContain("Email:");
  expect(text).toContain("This line is public");

  const [read] = await readWithPdfjs(output);
  expect(read!.text).not.toMatch(/Lovelace|example|5678/);
  expect(read!.text).toContain("This line is public");
  expect(read!.annotations).toEqual([]);

  const result = open(output);
  const page = result.loadPage(0);
  expect(page.getLinks()).toHaveLength(0);
  expect(page.getWidgets()).toHaveLength(0);
  // Black where the name was; the picture's red still beside it.
  const pixmap = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true);
  const at = (x: number, y: number) =>
    Array.from(pixmap.getPixels().subarray(y * pixmap.getStride() + x * 3, y * pixmap.getStride() + x * 3 + 3));
  expect(at(140, 96)).toEqual([0, 0, 0]);
  expect(at(400, 96)).toEqual([255, 0, 0]);
  pixmap.destroy();
  page.destroy();

  // The picture's pixels under the name are blanked in the image itself, not just covered.
  const [image] = extractImages(result, 0);
  const decoded = new mupdf.Image(image!.bytes).toPixmap();
  const px = (x: number, y: number) => {
    const i = y * decoded.getStride() + x * decoded.getNumberOfComponents();
    return Array.from(decoded.getPixels().subarray(i, i + 3));
  };
  // Image pixel (8, 2) shows at page point (140, 94); (34, 2) at (400, 94).
  const scale = decoded.getWidth() / 40;
  expect(px(Math.round(8 * scale), Math.round(2 * scale))).not.toEqual([255, 0, 0]);
  expect(px(Math.round(34 * scale), Math.round(2 * scale))).toEqual([255, 0, 0]);
  decoded.destroy();
});

test("redacts on a turned page where the page shows the text", () => {
  const pdf = open(secretsPdf(90));
  const [found] = matchesOf(pdf, { kind: "words", text: "Ada Lovelace" });
  const box = found!.matches[0]!.boxes[0]!;
  // Turned a quarter, the line runs down the page.
  expect(box[3] - box[1]).toBeGreaterThan(box[2] - box[0]);
  const output = transform(pdf, { edits: { pages: [{ page: 0, marks: [], redact: [box] }] } });
  const { text, raw } = readBack(output);
  expect(text).not.toContain("Lovelace");
  expect(raw).not.toContain("Lovelace");
  expect(text).toContain("ada@example.com");
});

test("what was added in the same save is redacted too", () => {
  const pdf = open(secretsPdf());
  const output = transform(pdf, {
    edits: {
      pages: [
        {
          page: 0,
          marks: [{ type: "text", text: "Added secret", x: 72, y: 300, font: "helvetica", size: 12, color: [0, 0, 0] }],
          redact: [[60, 280, 300, 310]],
        },
      ],
    },
    metadata: "remove",
  });
  const { text, raw } = readBack(output);
  expect(text).not.toContain("Added secret");
  expect(raw).not.toContain("Added secret");
});
