import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { openPdf, transform } from "~/engine/ops";
import type { ShapeMark } from "~/engine/types";
import { makePdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const opened: mupdf.PDFDocument[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});

/** Draws `marks` on a blank 400 × 400 page (white, apart from the test file's red top-left quarter). */
function drawn(marks: ShapeMark[], rotate: 0 | 90 = 0) {
  const output = transform(openPdf(makePdf([{ width: 400, height: 400, rotate }])), {
    edits: { pages: [{ page: 0, marks }] },
  });
  const doc = new mupdf.PDFDocument(output);
  opened.push(doc);
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const pixels = pixmap.getPixels().slice();
  const stride = pixmap.getStride();
  pixmap.destroy();
  return {
    output,
    at: (x: number, y: number) => Array.from(pixels.subarray(y * stride + x * 3, y * stride + x * 3 + 3)),
  };
}

const shape = (overrides: Partial<ShapeMark>): ShapeMark => ({
  type: "shape",
  shape: "rectangle",
  x: 250,
  y: 250,
  width: 100,
  height: 60,
  stroke: [0, 0, 1],
  fill: null,
  lineWidth: 4,
  ...overrides,
});

const BLUE = [0, 0, 255];
const YELLOW = [255, 255, 0];
const WHITE = [255, 255, 255];

test("rectangles and ellipses have an outline and an inside", async () => {
  const { output, at } = drawn([
    shape({ fill: [1, 1, 0] }),
    shape({ shape: "ellipse", x: 250, y: 50, width: 100, height: 100, stroke: null, fill: [0, 0, 1] }),
  ]);
  // The rectangle: outline on its edge, filled inside, nothing outside.
  expect(at(250, 280)).toEqual(BLUE);
  expect(at(300, 280)).toEqual(YELLOW);
  expect(at(300, 320)).toEqual(WHITE);
  // The ellipse: filled at its middle, not in the corners of its box.
  expect(at(300, 100)).toEqual(BLUE);
  expect(at(255, 55)).toEqual(WHITE);
  expect(await qpdfCheck(output)).toBe(0);
});

test("lines go from their start by their width and height, and arrows end in a point", () => {
  const { at } = drawn([
    shape({ shape: "line", x: 380, y: 220, width: -100, height: 0 }),
    shape({ shape: "arrow", x: 220, y: 300, width: 160, height: 0, lineWidth: 2 }),
  ]);
  expect(at(330, 220)).toEqual(BLUE);
  expect(at(330, 230)).toEqual(WHITE);
  // The arrowhead is wider than the line, near the tip.
  expect(at(372, 302)).toEqual(BLUE);
  expect(at(250, 303)).toEqual(WHITE);
  // Nothing past the tip.
  expect(at(384, 300)).toEqual(WHITE);
});

test("shapes are placed as the page is shown, rotated or not", () => {
  const { at } = drawn([shape({ x: 20, y: 300, width: 60, height: 60, stroke: null, fill: [0, 0, 1] })], 90);
  expect(at(50, 330)).toEqual(BLUE);
});
