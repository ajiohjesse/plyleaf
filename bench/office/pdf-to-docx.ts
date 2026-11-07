// Office spike (M8): feasibility of PDF → Word without LibreOffice (which can't write DOCX from a PDF).
// MuPDF's structured text gives text blocks with fonts and positions; the `docx` library writes them as paragraphs
// (size, bold, italic, one page per PDF page). Then LibreOffice renders the DOCX back to PDF so the round trip can be
// eyeballed in a contact sheet. Prototype only: no tables, images or columns.
//   node bench/office/pdf-to-docx.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as mupdf from "mupdf";
import { Document, Packer, Paragraph, TextRun } from "docx";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "package.json"));
const src = join(here, "out", "libreoffice", "report.docx.pdf");

type Line = { text: string; font: { name: string; size: number; weight: string; style: string }; bbox: { y: number } };
type Block = { type: string; lines?: Line[] };

const t0 = performance.now();
const pdf = mupdf.Document.openDocument(readFileSync(src), "application/pdf");
const children: Paragraph[] = [];
for (let i = 0; i < pdf.countPages(); i++) {
  const st = JSON.parse(pdf.loadPage(i).toStructuredText("preserve-whitespace").asJSON()) as { blocks: Block[] };
  st.blocks.forEach((b, j) => {
    if (b.type !== "text" || !b.lines?.length) return;
    const first = b.lines[0]!.font;
    children.push(
      new Paragraph({
        pageBreakBefore: i > 0 && j === 0,
        children: [
          new TextRun({
            text: b.lines
              .map((l) => l.text)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim(),
            size: Math.round(first.size * 2),
            bold: first.weight === "bold",
            italics: first.style === "italic",
          }),
        ],
      }),
    );
  });
}
const docx = await Packer.toBuffer(new Document({ sections: [{ children }] }));
const ms = Math.round(performance.now() - t0);
mkdirSync(join(here, "out", "pdf-to-docx"), { recursive: true });
writeFileSync(join(here, "out", "pdf-to-docx", "report.docx"), docx);

const { createConverter } = await import("@matbee/libreoffice-converter");
const wasmLoader = require("@matbee/libreoffice-converter/wasm/loader");
const lo = await createConverter({
  wasmLoader,
  wasmPath: dirname(require.resolve("@matbee/libreoffice-converter/wasm/loader")),
});
const back = await lo.convert(docx, { outputFormat: "pdf", inputFormat: "docx" });
writeFileSync(join(here, "out", "pdf-to-docx", "report.roundtrip.pdf"), back.data);
await lo.destroy();
console.log(`PDF → DOCX: ${children.length} paragraphs in ${ms} ms, ${docx.length} bytes`);
process.exit(0);
