// Other readers' engines, to check our output the way they'll see it: PDFium (Chrome and Edge's PDF viewer) renders
// pages, pdf.js (Firefox's) reads text and annotations. Both are dev dependencies from the engine spike.
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import * as mupdf from "mupdf";

let pdfium: WrappedPdfiumModule | null = null;

const FPDF_ANNOT = 0x01;
const FPDF_REVERSE_BYTE_ORDER = 0x10;

/** Every page rendered by PDFium with its annotations, as RGBA at `scale` pixels per point. */
export async function renderWithPdfium(bytes: Uint8Array, scale: number) {
  if (!pdfium) {
    const { init } = await import("@embedpdf/pdfium");
    pdfium = await init({});
    pdfium.PDFiumExt_Init();
  }
  const lib = pdfium;
  const heap = () => (lib.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
  const ptr = lib.pdfium.wasmExports.malloc(bytes.length);
  heap().set(bytes, ptr);
  const doc = lib.FPDF_LoadMemDocument(ptr, bytes.length, "");
  if (!doc) throw new Error(`PDFium couldn't open the file (error ${lib.FPDF_GetLastError()})`);
  try {
    return Array.from({ length: lib.FPDF_GetPageCount(doc) }, (_, index) => {
      const page = lib.FPDF_LoadPage(doc, index);
      const width = Math.round(lib.FPDF_GetPageWidthF(page) * scale);
      const height = Math.round(lib.FPDF_GetPageHeightF(page) * scale);
      const bitmap = lib.FPDFBitmap_Create(width, height, 1);
      lib.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff);
      lib.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER);
      const buffer = lib.FPDFBitmap_GetBuffer(bitmap);
      const stride = lib.FPDFBitmap_GetStride(bitmap);
      const rgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++)
        rgba.set(heap().subarray(buffer + y * stride, buffer + y * stride + width * 4), y * width * 4);
      lib.FPDFBitmap_Destroy(bitmap);
      lib.FPDF_ClosePage(page);
      return { width, height, rgba };
    });
  } finally {
    lib.FPDF_CloseDocument(doc);
    lib.pdfium.wasmExports.free(ptr);
  }
}

/** Every page rendered by MuPDF with its annotations, as RGBA at `scale` pixels per point. */
export function renderWithMupdf(bytes: Uint8Array, scale: number) {
  const doc = new mupdf.PDFDocument(bytes);
  try {
    return Array.from({ length: doc.countPages() }, (_, index) => {
      const pixmap = doc
        .loadPage(index)
        .toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, true, true);
      const width = pixmap.getWidth();
      const height = pixmap.getHeight();
      const rgba = new Uint8Array(pixmap.getPixels());
      pixmap.destroy();
      return { width, height, rgba };
    });
  } finally {
    doc.destroy();
  }
}

/** The share of pixels whose colour differs by more than `tolerance` in some channel (anti-aliasing aside). */
export function difference(
  a: { width: number; height: number; rgba: Uint8Array },
  b: { width: number; height: number; rgba: Uint8Array },
  tolerance = 96,
) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let different = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    // MuPDF's pixmap has alpha over transparent; treat transparent as white.
    const alpha = b.rgba[i + 3]! / 255;
    for (let c = 0; c < 3; c++) {
      const bc = b.rgba[i + c]! * alpha + 255 * (1 - alpha);
      if (Math.abs(a.rgba[i + c]! - bc) > tolerance) {
        different++;
        break;
      }
    }
  }
  return different / (a.width * a.height);
}

/** Each page's text and annotations as pdf.js reads them. */
export async function readWithPdfjs(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const text = await page.getTextContent();
      const annotations = (await page.getAnnotations()) as { subtype: string; contentsObj?: { str: string } }[];
      pages.push({
        // pdf.js splits runs where spacing changes; one space between words is enough to compare.
        text: text.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " "),
        // A note's pop-up is listed as an annotation of its own; it belongs to the note.
        annotations: annotations
          .filter((annotation) => annotation.subtype !== "Popup")
          .map((annotation) => ({
            subtype: annotation.subtype,
            contents: annotation.contentsObj?.str ?? "",
          })),
      });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
