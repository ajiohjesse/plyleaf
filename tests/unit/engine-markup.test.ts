import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { openPdf, pageText, selectText, transform } from "~/engine/ops";
import { makePdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const opened: { destroy: () => void }[] = [];
afterEach(() => {
  for (const thing of opened.splice(0)) thing.destroy();
});
const keep = <T extends { destroy: () => void }>(thing: T) => (opened.push(thing), thing);

// makePdf writes "Page N" with its baseline 20 points above the bottom, from just right of the middle.
const PAGE = { width: 400, height: 400 };

test("finds text between two points, or the word clicked, on plain and turned pages", () => {
  const plain = keep(openPdf(makePdf([PAGE])));
  const text = pageText(plain, 0);
  keep(text.text);
  const dragged = selectText(text, { x: 200, y: 370 }, { x: 260, y: 385 }, false);
  expect(dragged.text).toBe("Page 1");
  expect(dragged.quads).toHaveLength(1);
  const [ulx, uly, , , , lly] = dragged.quads[0]!;
  expect(ulx).toBeCloseTo(210, 0);
  expect(uly).toBeLessThan(380);
  expect(lly).toBeGreaterThan(380);
  expect(selectText(text, { x: 215, y: 378 }, { x: 215, y: 378 }, true).text).toBe("Page");
  // Nowhere near any text.
  expect(selectText(text, { x: 50, y: 300 }, { x: 60, y: 310 }, false)).toEqual({ quads: [], text: "" });
  expect(selectText(text, { x: 50, y: 300 }, { x: 50, y: 300 }, true)).toEqual({ quads: [], text: "" });

  // Turned a quarter: the text runs up the left side of the shown page.
  const turned = keep(openPdf(makePdf([{ ...PAGE, rotate: 90 }])));
  const sideways = pageText(turned, 0);
  keep(sideways.text);
  expect(selectText(sideways, { x: 25, y: 215 }, { x: 25, y: 215 }, true).text).toBe("Page");
});

test("markup becomes highlight, underline and strike-out annotations over the text", async () => {
  const source = openPdf(makePdf([PAGE, { ...PAGE, rotate: 90 }]));
  keep(source);
  const first = pageText(source, 0);
  keep(first.text);
  const turned = pageText(source, 1);
  keep(turned.text);
  const words = selectText(first, { x: 200, y: 370 }, { x: 260, y: 385 }, false).quads;
  const sideways = selectText(turned, { x: 25, y: 215 }, { x: 25, y: 215 }, true).quads;
  const output = transform(source, {
    edits: {
      pages: [
        {
          page: 0,
          marks: [],
          annotations: [
            { type: "highlight", quads: words, color: [1, 1, 0] },
            { type: "underline", quads: words, color: [0, 0, 1] },
            { type: "strikeout", quads: words, color: [1, 0, 0] },
          ],
        },
        { page: 1, marks: [], annotations: [{ type: "highlight", quads: sideways, color: [0, 1, 0] }] },
      ],
    },
  });
  const doc = keep(new mupdf.PDFDocument(output));
  const annotations = doc.loadPage(0).getAnnotations();
  expect(annotations.map((a) => a.getType())).toEqual(["Highlight", "Underline", "StrikeOut"]);
  expect(annotations[0]!.getColor()).toEqual([1, 1, 0]);
  // Over the text: it's still found under the highlight.
  const [x0, y0, x1, y1] = annotations[0]!.getBounds();
  expect(x0).toBeLessThan(212);
  expect(x1).toBeGreaterThan(246);
  expect(y0).toBeLessThan(370);
  expect(y1).toBeGreaterThan(382);
  // On the turned page, round the word as it's shown.
  const [sx0, sy0, sx1, sy1] = doc.loadPage(1).getAnnotations()[0]!.getBounds();
  expect(sx1 - sx0).toBeLessThan(sy1 - sy0);
  expect(await qpdfCheck(output)).toBe(0);
});
