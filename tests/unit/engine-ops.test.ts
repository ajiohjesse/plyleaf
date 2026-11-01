import type { PDFDocument } from "mupdf";
import { afterEach, describe, expect, test } from "vitest";
import { EngineError } from "~/engine/errors";
import { assemble, describe as describeDoc, openPdf, renderPage } from "~/engine/ops";
import type { Bitmap, EngineErrorCode } from "~/engine/types";
import { A4, LETTER, makePdf } from "../helpers/pdf";

const opened: PDFDocument[] = [];
function open(bytes: Uint8Array) {
  const doc = openPdf(bytes);
  opened.push(doc);
  return doc;
}
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});

/** The code of the EngineError that `run` throws. */
function errorCode(run: () => unknown): EngineErrorCode | "no error" {
  try {
    run();
  } catch (error) {
    if (error instanceof EngineError) return error.code;
    throw error;
  }
  return "no error";
}

/** "red" or "white" for the pixel at fractions (fx, fy) of the bitmap. */
function colourAt({ width, height, pixels }: Bitmap, fx: number, fy: number) {
  const i = (Math.floor(fy * height) * width + Math.floor(fx * width)) * 4;
  const [r, g, b, a] = pixels.slice(i, i + 4);
  expect(a).toBe(255);
  if (r! > 200 && g! < 60 && b! < 60) return "red";
  if (r! > 240 && g! > 240 && b! > 240) return "white";
  return `rgb(${r}, ${g}, ${b})`;
}

describe("openPdf and describe", () => {
  test("reads page sizes and rotation", () => {
    const doc = open(makePdf([A4, { ...LETTER, rotate: 90 }]));
    expect(describeDoc(doc)).toEqual({
      pages: [
        { width: 595, height: 842, rotation: 0 },
        // Sizes are as displayed, so a rotated page is landscape.
        { width: 792, height: 612, rotation: 90 },
      ],
      repaired: false,
      encryption: null,
      permissions: ["print", "print-hq", "copy", "edit", "annotate", "form", "assemble", "accessibility"],
    });
  });

  test("reads rotation inherited from the page tree", () => {
    const doc = open(makePdf([A4], { inheritedRotate: 180 }));
    expect(describeDoc(doc).pages[0]).toEqual({ width: 595, height: 842, rotation: 180 });
  });

  test("repairs a file with a broken cross-reference table", () => {
    const bytes = makePdf([A4, A4], { save: "" });
    const text = new TextDecoder("latin1").decode(bytes);
    // Cut off the xref table and trailer, as a truncated download would.
    const truncated = bytes.slice(0, text.lastIndexOf("xref"));
    const doc = open(truncated);
    expect(doc.countPages()).toBe(2);
    expect(describeDoc(doc).repaired).toBe(true);
  });

  test("rejects files that aren't PDFs", () => {
    expect(errorCode(() => openPdf(new TextEncoder().encode("hello, not a pdf")))).toBe("invalid-file");
    expect(errorCode(() => openPdf(new Uint8Array()))).toBe("invalid-file");
  });

  test("asks for the password of an encrypted PDF", () => {
    const bytes = makePdf([A4], { save: "encrypt=aes-256,user-password=secret,owner-password=owner" });
    expect(errorCode(() => openPdf(bytes))).toBe("password-required");
  });

  test("opens a PDF that only has an owner password", () => {
    const bytes = makePdf([A4], { save: "encrypt=aes-256,owner-password=owner" });
    expect(open(bytes).countPages()).toBe(1);
  });
});

describe("renderPage", () => {
  test("renders at the requested width, keeping the aspect ratio, on white", () => {
    const doc = open(makePdf([A4]));
    const bitmap = renderPage(doc, 0, 200);
    expect(bitmap.width).toBe(200);
    // 283.03 px: MuPDF rounds the pixel box outwards.
    expect(bitmap.height).toBe(Math.ceil((200 * 842) / 595));
    expect(bitmap.pixels.length).toBe(bitmap.width * bitmap.height * 4);
    expect(colourAt(bitmap, 0.25, 0.25)).toBe("red");
    expect(colourAt(bitmap, 0.75, 0.25)).toBe("white");
    expect(colourAt(bitmap, 0.25, 0.75)).toBe("white");
  });

  test("renders a rotated page the way it's displayed", () => {
    const doc = open(makePdf([{ ...A4, rotate: 90 }]));
    const bitmap = renderPage(doc, 0, 200);
    expect(bitmap.width).toBeGreaterThan(bitmap.height);
    // Turned 90° clockwise, the top-left quadrant ends up top-right.
    expect(colourAt(bitmap, 0.75, 0.25)).toBe("red");
    expect(colourAt(bitmap, 0.25, 0.25)).toBe("white");
  });

  test("rejects a missing page or an unreasonable size", () => {
    const doc = open(makePdf([A4]));
    expect(errorCode(() => renderPage(doc, 1, 200))).toBe("invalid-argument");
    expect(errorCode(() => renderPage(doc, -1, 200))).toBe("invalid-argument");
    expect(errorCode(() => renderPage(doc, 0, 0))).toBe("invalid-argument");
    // 8000 px wide makes an A4 page over 11,000 px tall.
    expect(errorCode(() => renderPage(doc, 0, 8000))).toBe("invalid-argument");
  });
});

describe("assemble", () => {
  const sizes = (bytes: Uint8Array) => describeDoc(open(bytes)).pages;

  test("merges documents in order", () => {
    const a = open(makePdf([A4, A4]));
    const b = open(makePdf([LETTER]));
    const out = assemble([
      { doc: a, page: 0 },
      { doc: a, page: 1 },
      { doc: b, page: 0 },
    ]);
    expect(sizes(out).map((p) => p.width)).toEqual([595, 595, 612]);
  });

  test("reorders, duplicates and drops pages", () => {
    const doc = open(makePdf([A4, LETTER, { width: 300, height: 300 }]));
    const out = assemble([
      { doc, page: 2 },
      { doc, page: 0 },
      { doc, page: 0 },
    ]);
    expect(sizes(out).map((p) => p.width)).toEqual([300, 595, 595]);
  });

  test("adds rotation to the page's own and inherited rotation", () => {
    const own = open(makePdf([{ ...A4, rotate: 90 }]));
    const inherited = open(makePdf([A4], { inheritedRotate: 270 }));
    const out = assemble([
      { doc: own, page: 0, rotate: 90 },
      { doc: inherited, page: 0, rotate: 180 },
      { doc: inherited, page: 0 },
    ]);
    expect(sizes(out).map((p) => p.rotation)).toEqual([180, 90, 270]);
    // The rotated output still renders the right way round: 180° puts the red quadrant bottom-right.
    expect(colourAt(renderPage(open(out), 0, 100), 0.75, 0.75)).toBe("red");
  });

  test("inserts blank pages", () => {
    const doc = open(makePdf([A4]));
    const out = assemble([{ blank: LETTER }, { doc, page: 0 }]);
    expect(sizes(out)[0]).toEqual({ width: 612, height: 792, rotation: 0 });
    expect(colourAt(renderPage(open(out), 0, 100), 0.25, 0.25)).toBe("white");
  });

  test("crops pages to a part of how they're shown, whatever their own rotation", () => {
    // The red quadrant is the page's own top-left, so it shows top-left, top-right, bottom-right, bottom-left.
    const shown = { 0: [0, 0], 90: [0.5, 0], 180: [0.5, 0.5], 270: [0, 0.5] } as const;
    for (const rotate of [0, 90, 180, 270] as const) {
      const doc = open(makePdf([{ ...A4, rotate }]));
      const [x, y] = shown[rotate];
      const out = open(assemble([{ doc, page: 0, crop: { x, y, width: 0.5, height: 0.5 } }]));
      const [page] = describeDoc(out).pages;
      const full = rotate % 180 === 0 ? A4 : { width: A4.height, height: A4.width };
      expect(page!.width).toBeCloseTo(full.width / 2, 1);
      expect(page!.height).toBeCloseTo(full.height / 2, 1);
      const bitmap = renderPage(out, 0, 100);
      for (const [fx, fy] of [
        [0.1, 0.1],
        [0.9, 0.1],
        [0.5, 0.5],
        [0.1, 0.9],
        [0.9, 0.9],
      ] as const) {
        expect(colourAt(bitmap, fx, fy), `rotate ${rotate} at ${fx},${fy}`).toBe("red");
      }
    }
  });

  test("crops inside an existing crop, then adds rotation", () => {
    const doc = open(makePdf([A4]));
    const top = open(assemble([{ doc, page: 0, crop: { x: 0, y: 0, width: 1, height: 0.5 } }]));
    // Left half of the top half: the red quadrant, then turned a quarter.
    const out = open(assemble([{ doc: top, page: 0, crop: { x: 0, y: 0, width: 0.5, height: 1 }, rotate: 90 }]));
    const [page] = describeDoc(out).pages;
    expect(page!.width).toBeCloseTo(A4.height / 2, 1);
    expect(page!.height).toBeCloseTo(A4.width / 2, 1);
    expect(page!.rotation).toBe(90);
    expect(colourAt(renderPage(out, 0, 100), 0.5, 0.5)).toBe("red");
  });

  test("copies each source's shared resources once", () => {
    const doc = open(makePdf([A4]));
    const once = assemble([{ doc, page: 0 }]);
    const thrice = assemble([
      { doc, page: 0 },
      { doc, page: 0 },
      { doc, page: 0 },
    ]);
    // The font is shared, so extra copies of a page only add its small page and content objects.
    expect(thrice.length).toBeLessThan(once.length * 1.6);
  });

  test("rejects bad input", () => {
    const doc = open(makePdf([A4]));
    expect(errorCode(() => assemble([{ doc, page: 0, crop: { x: 0.5, y: 0, width: 0.6, height: 1 } }]))).toBe(
      "invalid-argument",
    );
    expect(errorCode(() => assemble([{ doc, page: 0, crop: { x: 0, y: 0, width: 0, height: 1 } }]))).toBe(
      "invalid-argument",
    );
    expect(errorCode(() => assemble([]))).toBe("invalid-argument");
    expect(errorCode(() => assemble([{ doc, page: 1 }]))).toBe("invalid-argument");
    expect(errorCode(() => assemble([{ blank: { width: 0, height: 100 } }]))).toBe("invalid-argument");
    expect(errorCode(() => assemble([{ blank: { width: 100, height: 20_000 } }]))).toBe("invalid-argument");
  });
});
