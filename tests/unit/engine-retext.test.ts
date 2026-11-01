import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { openPdf, pageText, textLines, transform } from "~/engine/ops";
import { A4 } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const opened: { destroy: () => void }[] = [];
afterEach(() => {
  for (const thing of opened.splice(0)) thing.destroy();
});
const keep = <T extends { destroy: () => void }>(thing: T) => (opened.push(thing), thing);

/** An A4 page with three lines: Times-Bold 14 in red, Helvetica 12, and Courier 10, on top of a grey band. */
function styledPdf(rotate: 0 | 90 = 0) {
  const doc = new mupdf.PDFDocument();
  const fonts = {
    T: doc.addSimpleFont(new mupdf.Font("Times-Bold")),
    H: doc.addSimpleFont(new mupdf.Font("Helvetica")),
    C: doc.addSimpleFont(new mupdf.Font("Courier")),
  };
  const contents = [
    "0.9 g 60 680 300 80 re f",
    "BT 1 0 0 rg /T 14 Tf 72 742 Td (Quarterly report) Tj ET",
    "BT 0 g /H 12 Tf 72 722 Td (Revenue grew by 12 percent) Tj ET",
    "BT 0 g /C 10 Tf 72 702 Td (ref: 2026-Q3) Tj ET",
  ].join("\n");
  doc.insertPage(-1, doc.addPage([0, 0, A4.width, A4.height], rotate, { Font: fonts }, contents));
  const bytes = doc.saveToBuffer("").asUint8Array().slice();
  doc.destroy();
  return bytes;
}

test("reads each line with its standard font, size, colour and baseline", () => {
  const pdf = keep(openPdf(styledPdf()));
  const text = pageText(pdf, 0);
  keep(text.text);
  const lines = textLines(text);
  expect(lines.map((line) => line.text)).toEqual(["Quarterly report", "Revenue grew by 12 percent", "ref: 2026-Q3"]);
  expect(lines[0]).toMatchObject({ font: "times", bold: true, italic: false, exact: true, size: 14, color: [1, 0, 0] });
  expect(lines[0]!.x).toBeCloseTo(72, 1);
  expect(lines[0]!.y).toBeCloseTo(A4.height - 742, 1);
  expect(lines[1]).toMatchObject({ font: "helvetica", bold: false, size: 12, color: [0, 0, 0] });
  expect(lines[2]).toMatchObject({ font: "courier", size: 10 });
});

test("a line is rewritten in place: the old words gone, the new ones in its font, the rest untouched", async () => {
  const source = styledPdf();
  const pdf = keep(openPdf(source));
  const text = pageText(pdf, 0);
  keep(text.text);
  const [, line] = textLines(text);
  const output = transform(pdf, {
    edits: {
      pages: [
        {
          page: 0,
          removeText: [line!.box],
          marks: [
            {
              type: "text",
              text: "Revenue grew by 15 percent",
              x: line!.x,
              y: line!.y,
              font: line!.font,
              bold: line!.bold,
              italic: line!.italic,
              size: line!.size,
              color: line!.color,
            },
          ],
        },
      ],
    },
  });
  const after = keep(openPdf(output));
  const read = pageText(after, 0);
  keep(read.text);
  const lines = textLines(read);
  // The new line is drawn after the page's own content, so it's read last.
  expect(lines.map((found) => found.text).sort()).toEqual([
    "Quarterly report",
    "Revenue grew by 15 percent",
    "ref: 2026-Q3",
  ]);
  const rewritten = lines.find((found) => found.text.includes("15"))!;
  expect(read.text.asText()).not.toContain("12 percent");
  expect(rewritten).toMatchObject({ font: "helvetica", size: 12 });
  expect(rewritten.y).toBeCloseTo(line!.y, 1);
  expect(rewritten.x).toBeCloseTo(line!.x, 1);
  // The grey band behind the text is still there.
  const pixmap = after.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const at = (x: number, y: number) => pixmap.getPixels()[y * pixmap.getStride() + x * 3];
  expect(Math.abs(at(340, Math.round(A4.height - 718))! - 230)).toBeLessThanOrEqual(2);
  pixmap.destroy();
  expect(await qpdfCheck(output)).toBe(0);
});

test("turned text isn't offered for changing", () => {
  const pdf = keep(openPdf(styledPdf(90)));
  const text = pageText(pdf, 0);
  keep(text.text);
  expect(textLines(text)).toEqual([]);
});
