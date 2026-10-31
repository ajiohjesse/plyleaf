// Generates the three reference PDFs for the engine spike (D-006) into bench/engine/public/fixtures/.
// Everything is drawn from scratch with a seeded PRNG, so the files are licence-clean and reproducible.
// Run: node bench/engine/make-fixtures.ts
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import * as mupdf from "mupdf";

const outDir = fileURLToPath(new URL("./public/fixtures/", import.meta.url));
const A4: [number, number] = [595.28, 841.89];
const MIXED_TARGET_BYTES = 50 * 1024 * 1024;

// Mulberry32: small, fast, deterministic.
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = (
  "leaf page layer paper margin column folio quire binding spine index chapter section note figure table " +
  "river stone harbour lantern meadow orchard copper willow signal garden window ledger morning distant " +
  "quiet simple careful honest bright steady local open free light small clear plain useful written " +
  "measure gather arrange carry return follow notice record repair compare prepare keep share print"
).split(" ");

function sentence(rand: () => number): string {
  const n = 6 + Math.floor(rand() * 12);
  const words = Array.from({ length: n }, () => WORDS[Math.floor(rand() * WORDS.length)]!);
  const first = words[0]!;
  words[0] = first[0]!.toUpperCase() + first.slice(1);
  return words.join(" ") + ".";
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawTextPage(page: PDFPage, font: PDFFont, bold: PDFFont, rand: () => number, title: string) {
  const [w, h] = A4;
  const margin = 64;
  let y = h - margin;
  page.drawText(title, { x: margin, y, size: 18, font: bold, color: rgb(0.1, 0.12, 0.2) });
  y -= 32;
  while (y > margin + 40) {
    const paragraph = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => sentence(rand)).join(" ");
    for (const line of wrap(paragraph, font, 11, w - margin * 2)) {
      if (y < margin) break;
      page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
      y -= 15;
    }
    y -= 10;
  }
  page.drawText(title.replace(/^.*?(\d+)$/, "Page $1"), { x: w / 2 - 20, y: 32, size: 9, font });
}

async function makeText(): Promise<Uint8Array> {
  const rand = prng(1);
  const doc = await PDFDocument.create();
  doc.setTitle("Plyleaf reference: small text");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 12; i++) drawTextPage(doc.addPage(A4), font, bold, rand, `Section ${i}`);
  return doc.save();
}

// A "scan" is a text page rendered to greyscale at 150 dpi with paper tone, noise and JPEG compression.
async function makeScanned(textPdf: Uint8Array): Promise<Uint8Array> {
  const rand = prng(2);
  const src = mupdf.Document.openDocument(textPdf, "application/pdf");
  const doc = await PDFDocument.create();
  doc.setTitle("Plyleaf reference: 100-page scan");
  const scale = mupdf.Matrix.scale(150 / 72, 150 / 72);
  for (let i = 0; i < 100; i++) {
    const page = src.loadPage(i % src.countPages());
    const pix = page.toPixmap(scale, mupdf.ColorSpace.DeviceGray, false);
    const px = pix.getPixels();
    for (let p = 0; p < px.length; p++) px[p] = px[p]! * 0.93 + 4 + (rand() - 0.5) * 10;
    const jpeg = pix.asJPEG(70);
    pix.destroy();
    page.destroy();
    const img = await doc.embedJpg(jpeg);
    doc.addPage(A4).drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
  }
  src.destroy();
  return doc.save();
}

function photoJpeg(rand: () => number, width: number, height: number): Uint8Array {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
  const px = pix.getPixels();
  const fx = 2 + rand() * 6;
  const fy = 2 + rand() * 6;
  const hue = rand() * Math.PI * 2;
  let o = 0;
  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const s = Math.sin(u * fx + Math.cos(v * fy + hue) * 2) * 0.5 + 0.5;
      const n = (rand() - 0.5) * 60;
      px[o++] = 40 + s * 180 * (0.6 + 0.4 * Math.cos(hue)) + n;
      px[o++] = 60 + v * 140 * s + n;
      px[o++] = 80 + u * 150 * (1 - s) + n;
    }
  }
  const jpeg = pix.asJPEG(90);
  pix.destroy();
  return jpeg;
}

function drawVectorPage(page: PDFPage, font: PDFFont, rand: () => number, title: string) {
  const [w, h] = A4;
  page.drawText(title, { x: 64, y: h - 64, size: 16, font });
  for (let g = 0; g <= 20; g++) {
    const y = 120 + g * 30;
    page.drawLine({ start: { x: 64, y }, end: { x: w - 64, y }, thickness: 0.4, color: rgb(0.8, 0.82, 0.86) });
  }
  for (let series = 0; series < 4; series++) {
    let d = "";
    let v = 300;
    for (let i = 0; i <= 1500; i++) {
      v = Math.min(600, Math.max(0, v + (rand() - 0.5) * 24));
      d += `${i === 0 ? "M" : "L"}${((i / 1500) * (w - 128)).toFixed(1)},${(-v).toFixed(1)} `;
    }
    const color = [rgb(0.85, 0.3, 0.2), rgb(0.2, 0.45, 0.8), rgb(0.2, 0.65, 0.4), rgb(0.6, 0.35, 0.75)][series]!;
    page.drawSvgPath(d, { x: 64, y: 120, borderColor: color, borderWidth: 0.8 });
  }
  for (let i = 0; i < 300; i++) {
    page.drawCircle({
      x: 64 + rand() * (w - 128),
      y: 120 + rand() * 600,
      size: 1 + rand() * 4,
      color: rgb(rand(), rand(), rand()),
      opacity: 0.6,
    });
  }
}

// Text, vector charts and full-page 300 dpi photos, repeated until the file is about 50 MB.
async function makeMixed(textPdf: Uint8Array): Promise<Uint8Array> {
  const rand = prng(3);
  const doc = await PDFDocument.create();
  doc.setTitle("Plyleaf reference: 50 MB mixed");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const text = await PDFDocument.load(textPdf);
  let imageBytes = 0;
  for (let i = 0; imageBytes < MIXED_TARGET_BYTES - 600_000; i++) {
    const [textPage] = await doc.copyPages(text, [i % text.getPageCount()]);
    doc.addPage(textPage);
    drawVectorPage(doc.addPage(A4), font, rand, `Chart ${i + 1}`);
    const jpeg = photoJpeg(rand, 2480, 3508);
    imageBytes += jpeg.length;
    const img = await doc.embedJpg(jpeg);
    doc.addPage(A4).drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
  }
  return doc.save();
}

await mkdir(outDir, { recursive: true });
const text = await makeText();
await writeFile(`${outDir}text.pdf`, text);
const scanned = await makeScanned(text);
await writeFile(`${outDir}scanned.pdf`, scanned);
const mixed = await makeMixed(text);
await writeFile(`${outDir}mixed.pdf`, mixed);
const mb = (b: Uint8Array) => (b.length / 1024 / 1024).toFixed(2);
console.log(`text.pdf ${mb(text)} MB, scanned.pdf ${mb(scanned)} MB, mixed.pdf ${mb(mixed)} MB`);
