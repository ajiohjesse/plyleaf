// The engine worker. It holds the documents the page has opened and runs every operation off the main thread.
import { expose, transfer } from "comlink";
import type { PDFDocument } from "mupdf";
import { carryEngineErrors, EngineError } from "./errors";
import type { Bitmap, DocId, DocInfo, PageSpec } from "./types";

carryEngineErrors();

// MuPDF compiles its WASM in a top-level await. Importing it dynamically lets us expose the API straight away, so no
// message can arrive before there is a listener for it while the WASM is still loading.
const loading = import("./ops");

const docs = new Map<DocId, PDFDocument>();
let nextId = 1;

function get(id: DocId): PDFDocument {
  const doc = docs.get(id);
  if (!doc) throw new EngineError("unknown-document", `Document ${id} isn't open`);
  return doc;
}

const api = {
  /** Resolves once MuPDF is loaded. */
  async ready(): Promise<void> {
    await loading;
  },

  async open(bytes: Uint8Array): Promise<DocInfo> {
    const ops = await loading;
    const doc = ops.openPdf(bytes);
    try {
      const id = `d${nextId++}`;
      const { pages, repaired } = ops.describe(doc);
      docs.set(id, doc);
      return { id, pageCount: pages.length, pages, repaired };
    } catch (error) {
      doc.destroy();
      throw error;
    }
  },

  async render(id: DocId, page: number, width: number): Promise<Bitmap> {
    const ops = await loading;
    const bitmap = ops.renderPage(get(id), page, width);
    return transfer(bitmap, [bitmap.pixels.buffer]);
  },

  async assemble(pages: PageSpec[]): Promise<Uint8Array<ArrayBuffer>> {
    const ops = await loading;
    const bytes = ops.assemble(pages.map((spec) => ("blank" in spec ? spec : { ...spec, doc: get(spec.doc) })));
    return transfer(bytes, [bytes.buffer]);
  },

  close(id: DocId): void {
    docs.get(id)?.destroy();
    docs.delete(id);
  },
};

export type EngineApi = typeof api;

expose(api);
