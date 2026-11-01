import * as mupdf from "mupdf";
import { afterEach, describe, expect, test } from "vitest";
import { EngineError } from "~/engine/errors";
import { openScan, renderPage } from "~/engine/ops";
import { detectDocument, greyFromRgba, otsu } from "~/scan/detect";
import { blackAndWhite } from "~/scan/filters";
import { area, isConvex, moveCorner, orderCorners, outputSize, WHOLE, type Quad } from "~/scan/quad";
import { PAGE, scanPhoto } from "../helpers/scan";

const opened: mupdf.PDFDocument[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});

describe("quads", () => {
  test("orders corners from the top-left, clockwise", () => {
    expect(
      orderCorners([
        [0.9, 0.9],
        [0.1, 0.1],
        [0.1, 0.8],
        [0.8, 0.2],
      ]),
    ).toEqual([
      [0.1, 0.1],
      [0.8, 0.2],
      [0.9, 0.9],
      [0.1, 0.8],
    ]);
  });

  test("knows a page shape from a crossed or flat one", () => {
    expect(isConvex(WHOLE)).toBe(true);
    expect(isConvex(PAGE)).toBe(true);
    expect(isConvex([WHOLE[0], WHOLE[2], WHOLE[1], WHOLE[3]])).toBe(false);
    expect(
      isConvex([
        [0, 0],
        [0.5, 0],
        [1, 0],
        [0, 1],
      ] as Quad),
    ).toBe(false);
    expect(area(WHOLE)).toBe(1);
  });

  test("the straightened size follows the longer edges, capped", () => {
    expect(outputSize(PAGE, 1000, 1000)).toEqual({ width: 641, height: 742 });
    expect(outputSize(WHOLE, 6000, 4000)).toEqual({ width: 3000, height: 2000 });
  });

  test("a corner moves but stays in the photo", () => {
    expect(moveCorner(WHOLE, 2, [1.2, 0.5])[2]).toEqual([1, 0.5]);
  });
});

describe("finding the page", () => {
  test("finds the corners of a page lying at an angle", () => {
    const quad = detectDocument(greyFromRgba(scanPhoto()));
    expect(quad).not.toBeNull();
    quad!.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(PAGE[i]![0], 1);
      expect(y).toBeCloseTo(PAGE[i]![1], 1);
      expect(Math.hypot(x - PAGE[i]![0], y - PAGE[i]![1])).toBeLessThan(0.025);
    });
  });

  test("finds nothing in a plain photo or one the page fills", () => {
    const plain = { width: 100, height: 80, pixels: new Uint8ClampedArray(100 * 80 * 4).fill(128) };
    expect(detectDocument(greyFromRgba(plain))).toBeNull();
    expect(detectDocument(greyFromRgba(scanPhoto(200, 150, WHOLE)))).toBeNull();
  });

  test("Otsu splits two levels between them", () => {
    const t = otsu(Uint8Array.from([...Array(50).fill(40), ...Array(50).fill(200)]));
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(200);
  });
});

test("black and white ignores uneven light", () => {
  // A page lit from the left: the background fades from 250 to 150, with dark text across it.
  const width = 200;
  const height = 50;
  const grey = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) grey[y * width + x] = y >= 20 && y < 24 && x % 10 < 6 ? 60 : 250 - x / 2;
  }
  blackAndWhite(grey, width, height);
  expect(grey[5 * width + 190]).toBe(255);
  expect(grey[21 * width + 192]).toBe(0);
  expect(grey[21 * width + 2]).toBe(0);
  expect(grey[40 * width + 100]).toBe(255);
});

describe("opening a scan", () => {
  const colourAt = (bitmap: ReturnType<typeof renderPage>, fx: number, fy: number) => {
    const i = (Math.floor(fy * bitmap.height) * bitmap.width + Math.floor(fx * bitmap.width)) * 4;
    const [r, g, b] = bitmap.pixels.slice(i, i + 3);
    if (r! > 180 && g! < 90 && b! < 90) return "red";
    if (r! > 200 && g! > 200 && b! > 200) return "white";
    if (r! < 100 && g! < 100 && b! < 100) return "dark";
    return `rgb(${r}, ${g}, ${b})`;
  };

  test("straightens the page: red at its top-left, white paper, no desk", () => {
    const photo = scanPhoto(960, 720);
    const doc = openScan(photo, PAGE, "colour");
    opened.push(doc);
    const page = renderPage(doc, 0, 200);
    const size = outputSize(PAGE, 960, 720);
    expect(page.height / page.width).toBeCloseTo(size.height / size.width, 1);
    // A small photo stays at 72 dpi (a phone photo's page comes out about A4's height).
    const [, , width] = doc.loadPage(0).getBounds();
    expect(width).toBeCloseTo(size.width, 0);
    expect(colourAt(page, 0.25, 0.19)).toBe("red");
    expect(colourAt(page, 0.75, 0.19)).toBe("white");
    // The corners are paper, not desk.
    for (const [x, y] of [
      [0.03, 0.03],
      [0.97, 0.03],
      [0.97, 0.97],
      [0.03, 0.97],
    ]) {
      expect(colourAt(page, x!, y!)).toBe("white");
    }
  });

  test("black and white makes a grey PNG of black and white", () => {
    const doc = openScan(scanPhoto(), PAGE, "bw");
    opened.push(doc);
    let ref: mupdf.PDFObject | undefined;
    doc
      .findPage(0)
      .get("Resources")
      .get("XObject")
      .forEach((x) => (ref ??= x));
    expect(ref!.resolve().get("Filter").asName()).toBe("FlateDecode");
    const image = doc.loadImage(ref!);
    expect(image.getColorSpace()?.getType()).toBe("Gray");
    image.destroy();
    const page = renderPage(doc, 0, 100);
    expect(colourAt(page, 0.5, 0.95)).toBe("white");
  });

  test("refuses corners that don't make a page", () => {
    const crossed: Quad = [PAGE[0], PAGE[2], PAGE[1], PAGE[3]];
    expect(() => openScan(scanPhoto(), crossed, "colour")).toThrow(EngineError);
  });
});
