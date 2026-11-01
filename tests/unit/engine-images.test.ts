import * as mupdf from "mupdf";
import { afterEach, describe, expect, test } from "vitest";
import { EngineError } from "~/engine/errors";
import { mupdfImageType } from "~/engine/decode";
import { decodeHeic } from "~/engine/heic";
import { assemble, describe as describeDoc, openImage, openPdf, openPixels, pageImage, renderPage } from "~/engine/ops";
import type { Bitmap, EngineErrorCode, Fit, Rotation } from "~/engine/types";
import { fixture, makeJpeg, makePng, makeTiff } from "../helpers/images";
import { A4, makePdf } from "../helpers/pdf";

const opened: mupdf.PDFDocument[] = [];
const keep = (doc: mupdf.PDFDocument) => (opened.push(doc), doc);
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});

const image = (bytes: Uint8Array) => keep(openImage(bytes, mupdfImageType(bytes)!));
const sizes = (doc: mupdf.PDFDocument) => describeDoc(doc).pages.map(({ width, height }) => [width, height]);

function errorCode(run: () => unknown): EngineErrorCode | "no error" {
  try {
    run();
  } catch (error) {
    if (error instanceof EngineError) return error.code;
    throw error;
  }
  return "no error";
}

/** "red", "white" or the colour, at fractions (fx, fy) of the bitmap. Lossy images are allowed some noise. */
function colourAt({ width, height, pixels }: Bitmap, fx: number, fy: number) {
  const i = (Math.floor(fy * height) * width + Math.floor(fx * width)) * 4;
  const [r, g, b] = pixels.slice(i, i + 3);
  if (r! > 200 && g! < 70 && b! < 70) return "red";
  if (r! > 230 && g! > 230 && b! > 230) return "white";
  return `rgb(${r}, ${g}, ${b})`;
}

/** The first image XObject's /Filter on page 1. */
function imageFilter(doc: mupdf.PDFDocument) {
  let filter = "";
  doc
    .findPage(0)
    .get("Resources")
    .get("XObject")
    .forEach((xobject) => (filter ||= xobject.resolve().get("Filter").toString()));
  return filter;
}

describe("opening images", () => {
  test("sniffs the types MuPDF decodes", () => {
    expect(mupdfImageType(makeJpeg(8, 8))).toBe("image/jpeg");
    expect(mupdfImageType(makePng(8, 8))).toBe("image/png");
    expect(mupdfImageType(makeTiff([{ width: 8, height: 8 }]))).toBe("image/tiff");
    expect(mupdfImageType(fixture("photo.webp"))).toBeNull();
    expect(mupdfImageType(fixture("photo.heic"))).toBeNull();
  });

  test("a JPEG becomes a page its size at 96 dpi, with the JPEG carried over as it is", () => {
    const doc = image(makeJpeg(400, 200));
    expect(sizes(doc)).toEqual([[300, 150]]);
    expect(imageFilter(doc)).toBe("/DCTDecode");
    const bitmap = renderPage(doc, 0, 200);
    expect(colourAt(bitmap, 0.25, 0.25)).toBe("red");
    expect(colourAt(bitmap, 0.75, 0.25)).toBe("white");
    expect(colourAt(bitmap, 0.25, 0.75)).toBe("white");
  });

  test("uses the image's own resolution", () => {
    expect(sizes(image(makeJpeg(600, 300, { dpi: 300 })))).toEqual([[144, 72]]);
  });

  test("applies the EXIF orientation", () => {
    // Orientation 6: the stored pixels are shown turned a quarter clockwise, so the red corner ends up top right.
    const doc = image(makeJpeg(400, 200, { orientation: 6 }));
    expect(sizes(doc)).toEqual([[150, 300]]);
    const bitmap = renderPage(doc, 0, 150);
    expect(colourAt(bitmap, 0.75, 0.25)).toBe("red");
    expect(colourAt(bitmap, 0.25, 0.25)).toBe("white");
  });

  test("scales a big photo down to fit A4 and US Letter's bounding page", () => {
    const [[width, height]] = sizes(image(makeJpeg(2000, 1500, { dpi: 72 }))) as [[number, number]];
    expect(width).toBeCloseTo(816, 0);
    expect(height).toBeCloseTo(612, 0);
  });

  test("a PNG is stored losslessly", () => {
    const doc = image(makePng(64, 64));
    expect(imageFilter(doc)).toBe("/FlateDecode");
    expect(colourAt(renderPage(doc, 0, 64), 0.25, 0.25)).toBe("red");
  });

  test("a multi-page TIFF gives a page per frame", () => {
    expect(
      sizes(
        image(
          makeTiff([
            { width: 96, height: 48 },
            { width: 48, height: 96 },
          ]),
        ),
      ),
    ).toEqual([
      [72, 36],
      [36, 72],
    ]);
  });

  test("bytes that aren't a readable image say so", () => {
    expect(errorCode(() => openImage(new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), "image/jpeg"))).toBe(
      "invalid-image",
    );
  });
});

describe("opening decoded pixels", () => {
  const rgba = (width: number, height: number, alpha = 255): Bitmap => {
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let i = 0; i < width * height; i++) {
      const x = i % width;
      const y = Math.floor(i / width);
      if (x < width / 2 && y < height / 2) pixels.set([255, 0, 0, alpha], i * 4);
      else if (x >= width / 2) pixels[i * 4 + 3] = alpha;
    }
    return { width, height, pixels };
  };

  test("an opaque photo is stored as JPEG, a drawing as PNG", () => {
    expect(imageFilter(keep(openPixels(rgba(32, 32), true)))).toBe("/DCTDecode");
    expect(imageFilter(keep(openPixels(rgba(32, 32), false)))).toBe("/FlateDecode");
  });

  test("keeps transparency, which shows the white page through", () => {
    const doc = keep(openPixels(rgba(32, 32, 0), true));
    const xobjects: mupdf.PDFObject[] = [];
    doc
      .findPage(0)
      .get("Resources")
      .get("XObject")
      .forEach((x) => xobjects.push(x.resolve()));
    expect(xobjects[0]!.get("SMask").isNull()).toBe(false);
    const bitmap = renderPage(doc, 0, 32);
    // Red, but see-through: white shows instead.
    expect(colourAt(bitmap, 0.25, 0.25)).toBe("white");
    expect(colourAt(bitmap, 0.25, 0.75)).toBe("white");
  });

  test("refuses pixels that don't match the size", () => {
    expect(errorCode(() => openPixels({ width: 4, height: 4, pixels: new Uint8ClampedArray(8) }, true))).toBe(
      "invalid-image",
    );
  });
});

test("decodes a HEIC photo with libheif", async () => {
  const bitmap = await decodeHeic(fixture("photo.heic"));
  expect([bitmap.width, bitmap.height]).toEqual([320, 240]);
  expect(colourAt(bitmap, 0.25, 0.25)).toBe("red");
  expect(colourAt(bitmap, 0.75, 0.75)).toBe("white");
  expect(sizes(keep(openPixels(bitmap, true)))).toEqual([[240, 180]]);
});

describe("fitting pages onto a page size", () => {
  const corners: [number, number][] = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ];

  test.each([0, 90, 180, 270] as Rotation[])("a page with /Rotate %i keeps how it looks", (rotate) => {
    const source = keep(openPdf(makePdf([{ width: 400, height: 200, rotate }])));
    const [shown] = describeDoc(source).pages;
    const fit: Fit = { ...A4, margin: 36 };
    const doc = keep(openPdf(assemble([{ doc: source, page: 0, fit }])));
    expect(sizes(doc)).toEqual([[595, 842]]);

    const before = renderPage(source, 0, 200);
    const after = renderPage(doc, 0, 595);
    // Where the page went: scaled to the space inside the margins, centred.
    const scale = Math.min((595 - 72) / shown!.width, (842 - 72) / shown!.height);
    const placed = { width: shown!.width * scale, height: shown!.height * scale };
    const left = (595 - placed.width) / 2;
    const top = (842 - placed.height) / 2;
    for (const [fx, fy] of corners) {
      const x = (left + fx * placed.width) / 595;
      const y = (top + fy * placed.height) / 842;
      expect(colourAt(after, x, y), `at ${fx}, ${fy}`).toBe(colourAt(before, fx, fy));
    }
    // The margins stay empty.
    expect(colourAt(after, 0.5, 10 / 842)).toBe("white");
    expect(colourAt(after, 10 / 595, 0.5)).toBe("white");
  });

  test("an image is scaled up to fill the page", () => {
    const photo = image(makeJpeg(40, 20));
    const doc = keep(openPdf(assemble([{ doc: photo, page: 0, fit: { width: 842, height: 595, margin: 0 } }])));
    expect(sizes(doc)).toEqual([[842, 595]]);
    const bitmap = renderPage(doc, 0, 421);
    // 40 × 20 fills the width; the height is centred with white above and below.
    expect(colourAt(bitmap, 0.1, 0.5 - 0.1)).toBe("red");
    expect(colourAt(bitmap, 0.1, 0.05)).toBe("white");
  });

  test("refuses margins that leave no room", () => {
    const source = keep(openPdf(makePdf([A4])));
    expect(errorCode(() => assemble([{ doc: source, page: 0, fit: { ...A4, margin: 300 } }]))).toBe("invalid-argument");
  });
});

describe("saving pages as images", () => {
  const decoded = (bytes: Uint8Array) => {
    const result = new mupdf.Image(bytes);
    const info = [result.getWidth(), result.getHeight(), result.getXResolution()];
    result.destroy();
    return info;
  };

  test("a JPEG at the resolution asked, the right way up", () => {
    const source = keep(openPdf(makePdf([A4, { width: 400, height: 200, rotate: 90 }])));
    const jpeg = pageImage(source, 0, { dpi: 144, format: "jpeg" });
    expect(mupdfImageType(jpeg)).toBe("image/jpeg");
    expect(decoded(jpeg)).toEqual([1190, 1684, 144]);
    // A rotated page comes out as it's shown.
    const turned = keep(openImage(pageImage(source, 1, { dpi: 72, format: "png" }), "image/png"));
    const bitmap = renderPage(turned, 0, 200);
    expect([bitmap.width, bitmap.height]).toEqual([200, 400]);
    expect(colourAt(bitmap, 0.75, 0.25)).toBe("red");
  });

  test("a PNG, losslessly", () => {
    const source = keep(openPdf(makePdf([A4])));
    const png = pageImage(source, 0, { dpi: 72, format: "png" });
    expect(mupdfImageType(png)).toBe("image/png");
    expect(decoded(png)).toEqual([595, 842, 72]);
  });

  test("scales a page down rather than make a side over 8192 px", () => {
    const source = keep(openPdf(makePdf([{ width: 5669, height: 2835 }])));
    const [width, height] = decoded(pageImage(source, 0, { dpi: 300, format: "jpeg" }));
    expect(width).toBe(8192);
    expect(height).toBeCloseTo(4097, -1);
  });

  test("refuses a bad resolution or page", () => {
    const source = keep(openPdf(makePdf([A4])));
    expect(errorCode(() => pageImage(source, 0, { dpi: 0, format: "png" }))).toBe("invalid-argument");
    expect(errorCode(() => pageImage(source, 3, { dpi: 72, format: "png" }))).toBe("invalid-argument");
  });
});
