// The engine's operations, written against MuPDF.js directly so they run (and are unit-tested) in Node as well as in
// the worker. They hold no state: the worker owns the open documents and passes them in.
import * as mupdf from "mupdf";
import { EngineError } from "./errors";
import type { Bitmap, Crop, PageInfo, Rotation } from "./types";

/** Largest bitmap side we render, in pixels. Bigger requests would need hundreds of MB of WASM memory. */
export const MAX_RENDER_SIDE = 8192;
/** Largest page side in PDF points (200 in), the limit in the PDF spec. */
export const MAX_PAGE_SIDE = 14_400;

export type Source = { doc: mupdf.PDFDocument; page: number; rotate?: Rotation; crop?: Crop };
export type AssembleSpec = Source | { blank: { width: number; height: number } };

/** Opens PDF bytes. MuPDF copies them, so the caller can drop its copy. */
export function openPdf(bytes: Uint8Array): mupdf.PDFDocument {
  let doc: mupdf.Document;
  try {
    doc = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch (error) {
    throw new EngineError("invalid-file", `Not a readable PDF: ${message(error)}`);
  }
  const pdf = doc.asPDF();
  if (!pdf) {
    doc.destroy();
    throw new EngineError("invalid-file", "Not a PDF");
  }
  if (pdf.needsPassword()) {
    pdf.destroy();
    throw new EngineError("password-required", "This PDF is protected with a password");
  }
  let pageCount = 0;
  try {
    pageCount = pdf.countPages();
  } catch (error) {
    pdf.destroy();
    throw new EngineError("invalid-file", `The page tree is damaged: ${message(error)}`);
  }
  if (pageCount === 0) {
    pdf.destroy();
    throw new EngineError("invalid-file", "This PDF has no pages");
  }
  return pdf;
}

export function describe(pdf: mupdf.PDFDocument): { pages: PageInfo[]; repaired: boolean } {
  const pages: PageInfo[] = [];
  for (let i = 0; i < pdf.countPages(); i++) {
    const page = pdf.loadPage(i);
    const [x0, y0, x1, y1] = page.getBounds();
    pages.push({ width: x1 - x0, height: y1 - y0, rotation: pageRotation(page.getObject()) });
    page.destroy();
  }
  return { pages, repaired: pdf.wasRepaired() };
}

/** Renders a page `width` pixels wide (height follows the page's aspect ratio) on a white background. */
export function renderPage(pdf: mupdf.PDFDocument, index: number, width: number): Bitmap {
  checkPageIndex(pdf, index);
  const page = pdf.loadPage(index);
  try {
    const [x0, y0, x1, y1] = page.getBounds();
    const scale = width / (x1 - x0);
    const height = (y1 - y0) * scale;
    if (!(width >= 1 && width <= MAX_RENDER_SIDE && height >= 1 && height <= MAX_RENDER_SIDE)) {
      throw new EngineError("invalid-argument", `Can't render page ${index + 1} at ${width} px wide`);
    }
    // No alpha, so MuPDF paints the page on white and nothing is premultiplied; then widen RGB to RGBA for ImageData.
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      return toRgba(pixmap);
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

/**
 * Builds a new PDF from pages of open documents and blank pages, in order. This one operation covers merge, extract,
 * delete, reorder, rotate, duplicate and insert-blank. Each source's shared resources (fonts, images) are copied once.
 */
export function assemble(specs: readonly AssembleSpec[]): Uint8Array<ArrayBuffer> {
  if (specs.length === 0) throw new EngineError("invalid-argument", "No pages to assemble");
  const out = new mupdf.PDFDocument();
  const maps = new Map<mupdf.PDFDocument, mupdf.PDFGraftMap>();
  try {
    for (const spec of specs) {
      if ("blank" in spec) {
        const { width, height } = spec.blank;
        if (!(width >= 1 && width <= MAX_PAGE_SIDE && height >= 1 && height <= MAX_PAGE_SIDE)) {
          throw new EngineError("invalid-argument", `A blank page can't be ${width} × ${height} pt`);
        }
        out.insertPage(-1, out.addPage([0, 0, width, height], 0, {}, ""));
        continue;
      }
      checkPageIndex(spec.doc, spec.page);
      let map = maps.get(spec.doc);
      if (!map) maps.set(spec.doc, (map = out.newGraftMap()));
      map.graftPage(-1, spec.doc, spec.page);
      const page = out.findPage(out.countPages() - 1);
      // Crop first: the crop is measured on the page as its own rotation shows it.
      if (spec.crop) cropPage(page, spec.crop, spec.page);
      if (spec.rotate) page.put("Rotate", (pageRotation(page) + spec.rotate) % 360);
    }
    const buffer = out.saveToBuffer("garbage,compress");
    try {
      // Copy out of WASM memory: the view dies with the buffer.
      return buffer.asUint8Array().slice();
    } finally {
      buffer.destroy();
    }
  } finally {
    for (const map of maps.values()) map.destroy();
    out.destroy();
  }
}

/** Sets a page's /CropBox to the part `crop` describes, in the page's own (unrotated) coordinates. */
function cropPage(page: mupdf.PDFObject, crop: Crop, index: number) {
  const { x, y, width, height } = crop;
  const valid = [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0;
  if (!valid || x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
    throw new EngineError("invalid-argument", `Page ${index + 1} can't be cropped to that area`);
  }
  // What shows now: the crop box (if any) inside the media box.
  const media = boxOf(page, "MediaBox") ?? [0, 0, 612, 792];
  const current = boxOf(page, "CropBox") ?? media;
  const llx = Math.max(media[0], current[0]);
  const lly = Math.max(media[1], current[1]);
  const urx = Math.min(media[2], current[2]);
  const ury = Math.min(media[3], current[3]);
  const w = urx - llx;
  const h = ury - lly;
  // Where a point (u right, v down, as fractions of the shown page) is in the page's own coordinates.
  const at = (u: number, v: number): [number, number] => {
    switch (pageRotation(page)) {
      case 90:
        return [llx + v * w, lly + u * h];
      case 180:
        return [urx - u * w, lly + v * h];
      case 270:
        return [urx - v * w, ury - u * h];
      default:
        return [llx + u * w, ury - v * h];
    }
  };
  const [ax, ay] = at(x, y);
  const [bx, by] = at(x + width, y + height);
  const box = [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)] as const;
  if (box[2] - box[0] < 1 || box[3] - box[1] < 1) {
    throw new EngineError("invalid-argument", `Page ${index + 1} would be cropped to less than a point`);
  }
  page.put(
    "CropBox",
    box.map((n) => Math.round(n * 1000) / 1000),
  );
}

/** A page's box (inherited if need be), normalised so the first corner is the lower left. */
function boxOf(page: mupdf.PDFObject, key: "MediaBox" | "CropBox"): [number, number, number, number] | null {
  const value = page.getInheritable(key);
  if (!value.isArray() || value.length < 4) return null;
  const [a, b, c, d] = [0, 1, 2, 3].map((i) => value.get(i).asNumber());
  return [Math.min(a!, c!), Math.min(b!, d!), Math.max(a!, c!), Math.max(b!, d!)];
}

function checkPageIndex(pdf: mupdf.PDFDocument, index: number) {
  const count = pdf.countPages();
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new EngineError("invalid-argument", `Page ${index + 1} doesn't exist (the document has ${count})`);
  }
}

function pageRotation(page: mupdf.PDFObject): Rotation {
  const value = page.getInheritable("Rotate");
  const degrees = value.isNumber() ? value.asNumber() : 0;
  // The spec allows only multiples of 90; MuPDF rounds others the same way.
  return ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as Rotation;
}

function toRgba(pixmap: mupdf.Pixmap): Bitmap {
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const stride = pixmap.getStride();
  const rgb = pixmap.getPixels();
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    let from = y * stride;
    let to = y * width * 4;
    for (let x = 0; x < width; x++) {
      pixels[to++] = rgb[from++]!;
      pixels[to++] = rgb[from++]!;
      pixels[to++] = rgb[from++]!;
      pixels[to++] = 255;
    }
  }
  return { width, height, pixels };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
