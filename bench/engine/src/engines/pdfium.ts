import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { paint, type Engine } from "../engine";

let lib: WrappedPdfiumModule;
// The Emscripten heap view; it is replaced when memory grows, so read it fresh each time. Missing from the typings.
const heap = () => (lib.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;

const FPDF_ANNOT = 0x01;
const FPDF_REVERSE_BYTE_ORDER = 0x10; // RGBA instead of BGRA, so no swizzle in JS

function load(bytes: Uint8Array): { doc: number; ptr: number } {
  const ptr = lib.pdfium.wasmExports.malloc(bytes.length);
  heap().set(bytes, ptr);
  const doc = lib.FPDF_LoadMemDocument(ptr, bytes.length, "");
  if (!doc) throw new Error(`PDFium could not open the file (error ${lib.FPDF_GetLastError()})`);
  return { doc, ptr };
}

function unload({ doc, ptr }: { doc: number; ptr: number }) {
  lib.FPDF_CloseDocument(doc);
  lib.pdfium.wasmExports.free(ptr);
}

function save(doc: number): Uint8Array {
  const writer = lib.PDFiumExt_OpenFileWriter();
  if (!lib.PDFiumExt_SaveAsCopy(doc, writer)) throw new Error("PDFium could not save");
  const size = lib.PDFiumExt_GetFileWriterSize(writer);
  const ptr = lib.pdfium.wasmExports.malloc(size);
  lib.PDFiumExt_GetFileWriterData(writer, ptr, size);
  const out = heap().slice(ptr, ptr + size);
  lib.pdfium.wasmExports.free(ptr);
  lib.PDFiumExt_CloseFileWriter(writer);
  return out;
}

export const engine: Engine = {
  name: "pdfium",
  async init() {
    const { init } = await import("@embedpdf/pdfium");
    lib = await init({ locateFile: () => wasmUrl });
    lib.PDFiumExt_Init();
  },
  async open(bytes) {
    const handle = load(bytes);
    const { doc } = handle;
    return {
      pageCount: lib.FPDF_GetPageCount(doc),
      async pageSize(index) {
        const page = lib.FPDF_LoadPage(doc, index);
        const size = { width: lib.FPDF_GetPageWidthF(page), height: lib.FPDF_GetPageHeightF(page) };
        lib.FPDF_ClosePage(page);
        return size;
      },
      async render(index, scale, canvas) {
        const page = lib.FPDF_LoadPage(doc, index);
        const w = Math.round(lib.FPDF_GetPageWidthF(page) * scale);
        const h = Math.round(lib.FPDF_GetPageHeightF(page) * scale);
        const bmp = lib.FPDFBitmap_Create(w, h, 1);
        lib.FPDFBitmap_FillRect(bmp, 0, 0, w, h, 0xffffffff);
        lib.FPDF_RenderPageBitmap(bmp, page, 0, 0, w, h, 0, FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER);
        const buf = lib.FPDFBitmap_GetBuffer(bmp);
        const stride = lib.FPDFBitmap_GetStride(bmp);
        const rgba = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
          rgba.set(heap().subarray(buf + y * stride, buf + y * stride + w * 4), y * w * 4);
        }
        paint(canvas, rgba, w, h);
        lib.FPDFBitmap_Destroy(bmp);
        lib.FPDF_ClosePage(page);
      },
      close: () => unload(handle),
    };
  },
  async merge(inputs) {
    const out = lib.FPDF_CreateNewDocument();
    const sources = inputs.map(load);
    for (const src of sources) {
      // A null index list imports every page.
      if (!lib.FPDF_ImportPagesByIndex(out, src.doc, 0, 0, lib.FPDF_GetPageCount(out))) {
        throw new Error("PDFium could not import pages");
      }
    }
    const result = save(out);
    lib.FPDF_CloseDocument(out);
    sources.forEach(unload);
    return result;
  },
  async rotateAll(input) {
    const handle = load(input);
    for (let i = 0; i < lib.FPDF_GetPageCount(handle.doc); i++) {
      const page = lib.FPDF_LoadPage(handle.doc, i);
      lib.FPDFPage_SetRotation(page, (lib.FPDFPage_GetRotation(page) + 1) % 4);
      lib.FPDF_ClosePage(page);
    }
    const result = save(handle.doc);
    unload(handle);
    return result;
  },
};
