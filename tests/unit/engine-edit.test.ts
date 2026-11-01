import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { openPdf, transform } from "~/engine/ops";
import type { TextMark } from "~/engine/types";
import { makeJpeg, makePng } from "../helpers/images";
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

interface Line {
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  font: { name: string; size: number };
}

/** Each line of text on a page as MuPDF finds it, in the shown page's points from the top-left. */
function lines(doc: mupdf.PDFDocument, index: number): Line[] {
  const page = doc.loadPage(index);
  const json = JSON.parse(page.toStructuredText("").asJSON()) as { blocks: { lines?: Line[] }[] };
  page.destroy();
  return json.blocks.flatMap((block) => block.lines ?? []);
}

const text = (overrides: Partial<TextMark>): TextMark => ({
  type: "text",
  text: "Hello",
  x: 100,
  y: 200,
  font: "helvetica",
  size: 20,
  color: [1, 0, 0],
  ...overrides,
});

test("text lands where it's placed, in the font asked for, and stays text", async () => {
  const source = makePdf([A4, A4]);
  const output = transform(openPdf(source), {
    edits: {
      pages: [
        { page: 1, marks: [text({ text: "Héllo Жук\nSecond line", font: "times", bold: true })] },
        { page: 0, marks: [text({ text: "Courier", font: "courier", italic: true, x: 50, y: 60, size: 12 })] },
      ],
    },
  });
  const doc = open(output);
  const found = lines(doc, 1).filter((line) => !line.text.startsWith("Page"));
  expect(found.map((line) => line.text)).toEqual(["Héllo Жук", "Second line"]);
  const [first, second] = found as [Line, Line];
  expect(first.font.name).toMatch(/Bold/);
  expect(first.font.size).toBeCloseTo(20, 0);
  expect(first.bbox.x).toBeCloseTo(100, 0);
  // The baseline is at 200: the line's box runs from above it to a little below.
  expect(first.bbox.y).toBeLessThan(200);
  expect(first.bbox.y + first.bbox.h).toBeGreaterThan(200);
  expect(second.bbox.y - first.bbox.y).toBeCloseTo(24, 0);
  const courier = lines(doc, 0).find((line) => line.text === "Courier")!;
  expect(courier.font.name).toMatch(/Mono|Courier/);
  expect(courier.bbox.x).toBeCloseTo(50, 0);
  // The original text is still there, and the copy is valid.
  expect(lines(doc, 0).some((line) => line.text === "Page 1")).toBe(true);
  expect(await qpdfCheck(output)).toBe(0);
});

test("rotated and offset pages are measured as they're shown", () => {
  for (const rotate of [90, 180, 270] as const) {
    const output = transform(openPdf(makePdf([{ ...A4, rotate }])), {
      edits: { pages: [{ page: 0, marks: [text({ text: "Turned", x: 40, y: 80 })] }] },
    });
    const line = lines(open(output), 0).find((found) => found.text === "Turned")!;
    expect(line.bbox.x, `rotate ${rotate}`).toBeCloseTo(40, 0);
    expect(line.bbox.y + line.bbox.h, `rotate ${rotate}`).toBeGreaterThan(80);
    expect(line.bbox.y, `rotate ${rotate}`).toBeLessThan(80);
    // Upright as shown: wider than tall.
    expect(line.bbox.w).toBeGreaterThan(line.bbox.h);
  }

  // A crop box that doesn't start at the media box's corner.
  const cropped = new mupdf.PDFDocument(makePdf([A4]));
  cropped.findPage(0).put("CropBox", [100, 100, 400, 600]);
  const output = transform(openPdf(cropped.saveToBuffer("").asUint8Array()), {
    edits: { pages: [{ page: 0, marks: [text({ text: "Cropped", x: 20, y: 40 })] }] },
  });
  cropped.destroy();
  const line = lines(open(output), 0).find((found) => found.text === "Cropped")!;
  expect(line.bbox.x).toBeCloseTo(20, 0);
});

test("alignment, rotation and opacity", () => {
  const output = transform(openPdf(makePdf([A4])), {
    edits: {
      pages: [
        {
          page: 0,
          marks: [
            text({ text: "Middle", x: 300, y: 300, align: "center" }),
            text({ text: "End", x: 500, y: 400, align: "right" }),
            text({ text: "Upwards", x: 200, y: 600, rotate: 90, opacity: 0.5 }),
          ],
        },
      ],
    },
  });
  const doc = open(output);
  const found = lines(doc, 0);
  const middle = found.find((line) => line.text === "Middle")!;
  // MuPDF's line boxes are whole points, around the glyphs rather than their advances.
  expect(Math.abs(middle.bbox.x + middle.bbox.w / 2 - 300)).toBeLessThan(2);
  const end = found.find((line) => line.text === "End")!;
  expect(Math.abs(end.bbox.x + end.bbox.w - 500)).toBeLessThan(2);
  const up = found.find((line) => line.text === "Upwards")!;
  // Turned anticlockwise: "Upwards" runs up the page from (200, 600).
  expect(up.bbox.h).toBeGreaterThan(up.bbox.w);
  expect(Math.abs(up.bbox.y + up.bbox.h - 600)).toBeLessThan(2);
  const saved = new TextDecoder("latin1").decode(doc.saveToBuffer("decompress").asUint8Array());
  expect(saved).toMatch(/\/ca 0?\.5>/);
});

test("characters the standard fonts lack are left out, and a font is embedded once for many pages", () => {
  const pages = Array.from({ length: 20 }, () => A4);
  const output = transform(openPdf(makePdf(pages)), {
    edits: { pages: pages.map((_, page) => ({ page, marks: [text({ text: `中 ${page + 1}` })] })) },
  });
  const doc = open(output);
  expect(lines(doc, 4).some((line) => line.text.trim() === "5")).toBe(true);
  const fontFiles = (
    doc
      .saveToBuffer("decompress")
      .asString()
      .match(/\/FontFile[23]?\b/g) ?? []
  ).length;
  // The test file's own Helvetica isn't embedded; ours is, once.
  expect(fontFiles).toBe(1);
  expect(output.length).toBeLessThan(40_000);
});

test("refuses a page that isn't there", () => {
  expect(() => transform(openPdf(makePdf([A4])), { edits: { pages: [{ page: 3, marks: [text({})] }] } })).toThrow(
    /no page 3/,
  );
});

/** The colour at (x, y) points on a rendered page. */
function colourAt(doc: mupdf.PDFDocument, index: number, x: number, y: number) {
  const pixmap = doc.loadPage(index).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const i = Math.round(y) * pixmap.getStride() + Math.round(x) * 3;
  const rgb = Array.from(pixmap.getPixels().subarray(i, i + 3));
  pixmap.destroy();
  return rgb;
}

const isRed = ([r, g, b]: number[]) => r! > 200 && g! < 60 && b! < 60;
const isWhite = (rgb: number[]) => rgb.every((c) => c > 230);

test("images fill their box the right way up, once in the file however often they're used", async () => {
  const jpeg = makeJpeg(200, 100);
  const blank = { width: 400, height: 400 };
  const output = transform(openPdf(makePdf([blank, { ...blank, rotate: 90 }])), {
    edits: {
      images: [jpeg],
      pages: [0, 1].map((page) => ({
        page,
        marks: [{ type: "image", image: 0, x: 150, y: 50, width: 200, height: 100 }],
      })),
    },
  });
  const doc = open(output);
  for (const page of [0, 1]) {
    // The picture's red quarter is its top-left.
    expect(isRed(colourAt(doc, page, 200, 75)), `page ${page}`).toBe(true);
    expect(isWhite(colourAt(doc, page, 300, 125)), `page ${page}`).toBe(true);
  }
  const saved = new TextDecoder("latin1").decode(doc.saveToBuffer("").asUint8Array());
  expect(saved.match(/\/Subtype\s*\/Image/g)).toHaveLength(1);
  expect(saved).toMatch(/DCTDecode/);
  expect(await qpdfCheck(output)).toBe(0);
});

test("images turn about their centre and can be see-through", () => {
  const output = transform(openPdf(makePdf([{ width: 400, height: 400 }])), {
    edits: {
      images: [makePng(100, 100)],
      // Turned 180°: the red quarter ends up bottom-right.
      pages: [{ page: 0, marks: [{ type: "image", image: 0, x: 250, y: 250, width: 100, height: 100, rotate: 180 }] }],
    },
  });
  const doc = open(output);
  expect(isRed(colourAt(doc, 0, 325, 325))).toBe(true);
  expect(isWhite(colourAt(doc, 0, 275, 275))).toBe(true);

  const faint = transform(openPdf(makePdf([{ width: 400, height: 400 }])), {
    edits: {
      images: [makePng(100, 100)],
      pages: [{ page: 0, marks: [{ type: "image", image: 0, x: 250, y: 250, width: 100, height: 100, opacity: 0.5 }] }],
    },
  });
  const [r, g] = colourAt(open(faint), 0, 275, 275);
  expect(r).toBeGreaterThan(240);
  expect(g).toBeGreaterThan(100);
  expect(g).toBeLessThan(160);
});

test("refuses an image index that isn't there, or bytes that aren't an image", () => {
  const mark = { type: "image", image: 0, x: 0, y: 0, width: 10, height: 10 } as const;
  expect(() => transform(openPdf(makePdf([A4])), { edits: { pages: [{ page: 0, marks: [mark] }] } })).toThrow(
    /no image 0/,
  );
  expect(() =>
    transform(openPdf(makePdf([A4])), {
      edits: { images: [new Uint8Array([1, 2, 3])], pages: [{ page: 0, marks: [mark] }] },
    }),
  ).toThrow(/JPEG or PNG/);
});
