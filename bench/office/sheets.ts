// Office spike (M8): renders every converted PDF into one contact-sheet PNG per file (pages side by side),
// for eyeballing fidelity. node bench/office/sheets.ts
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as mupdf from "mupdf";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "out");
const sheetDir = join(here, "sheets");
mkdirSync(sheetDir, { recursive: true });
const H = 420; // page height in the sheet, px
for (const cand of readdirSync(outRoot)) {
  for (const f of readdirSync(join(outRoot, cand)).filter((n) => n.endsWith(".pdf"))) {
    const doc = mupdf.Document.openDocument(readFileSync(join(outRoot, cand, f)), "application/pdf");
    const pix: mupdf.Pixmap[] = [];
    for (let i = 0; i < Math.min(doc.countPages(), 6); i++) {
      const page = doc.loadPage(i);
      const b = page.getBounds();
      const s = H / (b[3] - b[1]);
      pix.push(page.toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceRGB, false, true));
    }
    // Lay the page images out on one PDF page, then render that page to PNG.
    const sheet = new mupdf.PDFDocument();
    let x = 10,
      ops = "0.85 0.85 0.85 rg 0 0 W 440 re f\n";
    const res: Record<string, mupdf.PDFObject> = {};
    pix.forEach((p, i) => {
      const w = p.getWidth(),
        h = p.getHeight();
      res[`I${i}`] = sheet.addImage(new mupdf.Image(p));
      ops += `q ${w} 0 0 ${h} ${x} ${440 - 10 - h} cm /I${i} Do Q\n`;
      x += w + 10;
    });
    ops = ops.replace("W", String(x));
    const page = sheet.addPage([0, 0, x, 440], 0, { XObject: res }, ops);
    sheet.insertPage(-1, page);
    const png = sheet.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true).asPNG();
    writeFileSync(join(sheetDir, `${f.replace(/\.pdf$/, "")}.${cand}.png`), png);
  }
}
console.log(readdirSync(sheetDir).join("\n"));
