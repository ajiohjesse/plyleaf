import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { describe as describeDoc, openPdf, transform } from "~/engine/ops";
import { formsPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const opened: mupdf.PDFDocument[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});
const open = (bytes: Uint8Array) => {
  const doc = openPdf(bytes);
  opened.push(doc);
  return doc;
};

/** The colour at a point of page 1, in PDF coordinates (from the bottom left of the 300 pt page). */
function colourAt(doc: mupdf.PDFDocument, x: number, y: number) {
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const i = (300 - y) * pixmap.getStride() + x * 3;
  const [r, g, b] = pixmap.getPixels().slice(i, i + 3);
  pixmap.destroy();
  return r! > 200 && g! < 60 && b! < 60 ? "red" : r! < 60 && g! < 60 && b! > 200 ? "blue" : `rgb(${r}, ${g}, ${b})`;
}

test("counts annotations and form fields, but not links", () => {
  expect(describeDoc(open(formsPdf()))).toMatchObject({ annotations: 1, formFields: 1 });
});

test("flattening everything draws fields and annotations into the page and keeps links", async () => {
  const output = transform(open(formsPdf()), { flatten: "all" });
  const doc = open(output);
  expect(describeDoc(doc)).toMatchObject({ annotations: 0, formFields: 0 });
  expect(colourAt(doc, 70, 115)).toBe("blue");
  expect(colourAt(doc, 200, 150)).toBe("red");
  expect(doc.loadPage(0).getLinks()).toHaveLength(1);
  expect(await qpdfCheck(output)).toBe(0);
});

test("flattening forms only keeps annotations editable", async () => {
  const output = transform(open(formsPdf()), { flatten: "forms" });
  const doc = open(output);
  expect(describeDoc(doc)).toMatchObject({ annotations: 1, formFields: 0 });
  expect(colourAt(doc, 70, 115)).toBe("blue");
  expect(await qpdfCheck(output)).toBe(0);
});
