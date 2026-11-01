// Everything the editor and page tools write, in one file, checked the way other readers see it: PDFium (Chrome,
// Edge) renders it like MuPDF does, and pdf.js (Firefox) finds the text and annotations. The file is also written to
// test-results/editor-sample.pdf, to open by hand in Acrobat Reader and macOS Preview.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { openPdf, pageText, selectText, transform } from "~/engine/ops";
import type { Edits } from "~/engine/types";
import { pageNumberEdits, DEFAULT_NUMBERS } from "~/pagetools/numbers";
import { DEFAULT_STYLE } from "~/pagetools/stamping";
import { makePng } from "../helpers/images";
import { A4, makePdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";
import { difference, readWithPdfjs, renderWithMupdf, renderWithPdfium } from "../helpers/viewers";

function kitchenSink() {
  const source = openPdf(makePdf([A4, { ...A4, rotate: 90 }]));
  const words = (page: number) => {
    const text = pageText(source, page);
    // makePdf writes "Page N" near the bottom of each page as it's shown.
    const found = selectText(text, { x: 300, y: 805 }, { x: 360, y: 825 }, false).quads;
    text.text.destroy();
    return found;
  };
  const sideways = (() => {
    const text = pageText(source, 1);
    const found = selectText(text, { x: 25, y: 310 }, { x: 25, y: 310 }, true).quads;
    text.text.destroy();
    return found;
  })();
  // Page 2 is turned a quarter, so it shows landscape.
  const numbers = pageNumberEdits([A4, { width: A4.height, height: A4.width }], {
    ...DEFAULT_NUMBERS,
    style: DEFAULT_STYLE,
    template: "Page {page} of {pages}",
    position: { vertical: "top", horizontal: "right" },
  });
  const edits: Edits = {
    images: [makePng(120, 80)],
    pages: [
      {
        page: 0,
        removeText: [],
        marks: [
          { type: "text", text: "Added in Helvetica", x: 320, y: 120, font: "helvetica", size: 14, color: [0, 0, 0] },
          {
            type: "text",
            text: "Times bold, two\nlines, Ünïcödé Жук",
            x: 320,
            y: 160,
            font: "times",
            bold: true,
            size: 14,
            color: [0.1, 0.3, 0.8],
          },
          {
            type: "text",
            text: "Courier italic",
            x: 320,
            y: 220,
            font: "courier",
            italic: true,
            size: 12,
            color: [0, 0.5, 0],
          },
          { type: "image", image: 0, x: 330, y: 250, width: 150, height: 100 },
          {
            type: "shape",
            shape: "rectangle",
            x: 60,
            y: 480,
            width: 150,
            height: 80,
            stroke: [0.85, 0.11, 0.18],
            fill: [1, 0.83, 0.23],
            lineWidth: 3,
          },
          {
            type: "shape",
            shape: "ellipse",
            x: 240,
            y: 480,
            width: 120,
            height: 80,
            stroke: [0, 0, 1],
            fill: null,
            lineWidth: 2,
          },
          {
            type: "shape",
            shape: "arrow",
            x: 400,
            y: 520,
            width: 140,
            height: -40,
            stroke: [0, 0, 0],
            fill: null,
            lineWidth: 3,
          },
          {
            type: "shape",
            shape: "rectangle",
            x: 60,
            y: 600,
            width: 200,
            height: 40,
            stroke: null,
            fill: [1, 1, 1],
            lineWidth: 0,
          },
          {
            type: "text",
            text: "DRAFT",
            x: 297,
            y: 700,
            font: "helvetica",
            bold: true,
            size: 60,
            color: [0.85, 0.11, 0.18],
            align: "center",
            rotate: 30,
            opacity: 0.3,
          },
          ...numbers.pages[0]!.marks,
        ],
        annotations: [
          { type: "highlight", quads: words(0), color: [1, 0.89, 0.2] },
          { type: "underline", quads: words(0), color: [0.15, 0.39, 0.92] },
          {
            type: "ink",
            strokes: [
              [
                { x: 60, y: 680 },
                { x: 120, y: 720 },
                { x: 180, y: 680 },
              ],
            ],
            color: [0.15, 0.39, 0.92],
            width: 3,
          },
          { type: "note", x: 500, y: 600, text: "A comment", color: [1, 0.83, 0.23] },
          { type: "stamp", x: 330, y: 380, width: 190, name: "Approved", color: [0.09, 0.55, 0.27] },
        ],
      },
      {
        page: 1,
        marks: [
          { type: "text", text: "On a turned page", x: 100, y: 100, font: "helvetica", size: 16, color: [0, 0, 0] },
          ...numbers.pages[1]!.marks,
        ],
        annotations: [
          { type: "strikeout", quads: sideways, color: [0.85, 0.11, 0.18] },
          { type: "stamp", x: 300, y: 200, width: 190, name: "PAID", color: [0.85, 0.11, 0.18] },
          { type: "note", x: 600, y: 300, text: "Turned page note", color: [1, 0.83, 0.23] },
        ],
      },
    ],
  };
  try {
    return transform(source, { edits });
  } finally {
    source.destroy();
  }
}

test("PDFium (Chrome's viewer) draws the editor's output as MuPDF does", { timeout: 30_000 }, async () => {
  const output = kitchenSink();
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/editor-sample.pdf", output);
  expect(await qpdfCheck(output)).toBe(0);
  const scale = 1;
  const chrome = await renderWithPdfium(output, scale);
  const ours = renderWithMupdf(output, scale);
  expect(chrome).toHaveLength(2);
  for (const [i, page] of chrome.entries()) {
    // Anti-aliasing and font hinting differ a little; anything misplaced, missing or turned would differ a lot.
    expect(difference(page, ours[i]!), `page ${i + 1}`).toBeLessThan(0.005);
  }
});

test("pdf.js (Firefox's viewer) finds the text and annotations", { timeout: 30_000 }, async () => {
  const [first, second] = await readWithPdfjs(kitchenSink());
  for (const words of ["Added in Helvetica", "Ünïcödé Жук", "Courier italic", "DRAFT", "Page 1 of 2"]) {
    expect(first!.text).toContain(words);
  }
  expect(second!.text).toContain("On a turned page");
  expect(first!.annotations.map((a) => a.subtype)).toEqual(["Highlight", "Underline", "Ink", "Text", "Stamp"]);
  expect(first!.annotations.find((a) => a.subtype === "Text")!.contents).toBe("A comment");
  expect(second!.annotations.map((a) => a.subtype)).toEqual(["StrikeOut", "Stamp", "Text"]);
});
