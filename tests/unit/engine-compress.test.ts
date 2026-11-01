import * as mupdf from "mupdf";
import { afterEach, describe, expect, test } from "vitest";
import { openPdf, transform } from "~/engine/ops";
import { imagesPdf } from "../helpers/images";
import { A4, makePdf, photoPdf } from "../helpers/pdf";
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

function firstImage(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  let ref: mupdf.PDFObject | undefined;
  doc
    .findPage(0)
    .get("Resources")
    .get("XObject")
    .forEach((x) => (ref ??= x));
  const object = ref!.resolve();
  const info = {
    width: object.get("Width").asNumber(),
    filter: object.get("Filter").toString(),
    hasSMask: !object.get("SMask").isNull(),
  };
  doc.destroy();
  return info;
}

describe("compress", () => {
  test("each level makes a photo-heavy PDF smaller, and qpdf finds nothing wrong", async () => {
    const original = photoPdf();
    const doc = open(original);
    const low = transform(doc, { compress: "low" });
    const recommended = transform(doc, { compress: "recommended" });
    const extreme = transform(doc, { compress: "extreme" });
    expect(low.length).toBeLessThanOrEqual(original.length);
    expect(recommended.length).toBeLessThan(original.length / 3);
    expect(extreme.length).toBeLessThan(recommended.length);
    for (const output of [low, recommended, extreme]) expect(await qpdfCheck(output)).toBe(0);

    // Images come down to what A4 shows at 150 and 96 dpi, as JPEG; low leaves them alone.
    expect(firstImage(low)).toMatchObject({ width: 1600, filter: "/FlateDecode" });
    expect(firstImage(recommended)).toMatchObject({
      width: Math.round((1600 * (842 / 72) * 150) / 2200),
      filter: "/DCTDecode",
    });
    expect(firstImage(extreme).width).toBe(Math.round((1600 * (842 / 72) * 96) / 2200));
  });

  test("the open document stays as it was, so a second run starts from the original", () => {
    const doc = open(photoPdf(400, 550));
    transform(doc, { compress: "extreme" });
    const again = transform(doc, { compress: "low" });
    expect(firstImage(again).filter).toBe("/FlateDecode");
  });

  test("keeps soft masks, and leaves small images and pages' text alone", async () => {
    const doc = open(imagesPdf().bytes);
    const output = transform(doc, { compress: "extreme" });
    expect(await qpdfCheck(output)).toBe(0);
    const reopened = new mupdf.PDFDocument(output);
    let smasks = 0;
    reopened
      .findPage(0)
      .get("Resources")
      .get("XObject")
      .forEach((x) => (smasks += x.resolve().get("SMask").isNull() ? 0 : 1));
    expect(smasks).toBe(1);
    reopened.destroy();
  });

  test("a text-only PDF stays valid and doesn't grow much", async () => {
    const original = makePdf([A4, A4, A4]);
    const output = transform(open(original), { compress: "recommended" });
    expect(output.length).toBeLessThan(original.length * 1.1);
    expect(await qpdfCheck(output)).toBe(0);
  });
});
