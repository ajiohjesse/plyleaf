import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { mupdfImageType } from "~/engine/decode";
import { extractImages, openPdf } from "~/engine/ops";
import { imagesPdf } from "../helpers/images";

const opened: mupdf.PDFDocument[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});
const open = (bytes: Uint8Array) => {
  const doc = openPdf(bytes);
  opened.push(doc);
  return doc;
};

const summary = (images: ReturnType<typeof extractImages>) =>
  images.map(({ format, width, height, bytes }) => ({ format, width, height, type: mupdfImageType(bytes) }));

test("finds a page's images, a JPEG byte for byte and the rest as PNG", () => {
  const { bytes, jpeg } = imagesPdf();
  const doc = open(bytes);
  const page1 = extractImages(doc, 0);
  expect(summary(page1)).toEqual([
    { format: "jpeg", width: 40, height: 20, type: "image/jpeg" },
    { format: "png", width: 16, height: 16, type: "image/png" },
    { format: "png", width: 8, height: 8, type: "image/png" },
  ]);
  expect(Array.from(page1[0]!.bytes)).toEqual(Array.from(jpeg));
});

test("keeps transparency and turns CMYK into RGB", () => {
  const doc = open(imagesPdf().bytes);
  const [, transparent, cmyk] = extractImages(doc, 0);
  const withAlpha = new mupdf.Image(transparent!.bytes).toPixmap();
  expect(withAlpha.getAlpha()).toBe(1);
  // The right half is see-through.
  const stride = withAlpha.getStride();
  expect(withAlpha.getPixels()[8 * stride + 12 * 4 + 3]).toBe(0);
  expect(withAlpha.getPixels()[8 * stride + 2 * 4 + 3]).toBe(255);
  withAlpha.destroy();
  const rgb = new mupdf.Image(cmyk!.bytes);
  expect(rgb.getColorSpace()?.getType()).toBe("RGB");
  rgb.destroy();
});

test("looks inside forms, skips stencil masks and images already found", () => {
  const doc = open(imagesPdf().bytes);
  const page1 = extractImages(doc, 0);
  // Page 2 draws the JPEG again and a form holding a new image.
  expect(
    summary(
      extractImages(
        doc,
        1,
        page1.map((image) => image.id),
      ),
    ),
  ).toEqual([{ format: "png", width: 4, height: 4, type: "image/png" }]);
  expect(extractImages(doc, 1)).toHaveLength(2);
});
