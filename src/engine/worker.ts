// The engine worker. It holds the documents the page has opened and runs every operation off the main thread.
import { expose, transfer } from "comlink";
import type { PDFDocument } from "mupdf";
import { sniffKind } from "~/intake/files";
import type { ScanFilter } from "~/scan/filters";
import type { Quad } from "~/scan/quad";
import { isHeif, mupdfImageType } from "./decode";
import { carryEngineErrors, EngineError } from "./errors";
import type { PageText } from "./text";
import type {
  Bitmap,
  DocId,
  DocInfo,
  ExtractedImage,
  ImageOptions,
  PageSpec,
  TextSelection,
  TransformOptions,
} from "./types";

carryEngineErrors();

// MuPDF compiles its WASM in a top-level await. Importing it dynamically lets us expose the API straight away, so no
// message can arrive before there is a listener for it while the WASM is still loading.
const loading = import("./ops").catch((error: unknown) => {
  throw new EngineError("engine-unavailable", `Couldn't load MuPDF: ${error instanceof Error ? error.message : error}`);
});
// Calls report the failure; this only stops it also showing up as an unhandled rejection.
loading.catch(() => {});

const docs = new Map<DocId, PDFDocument>();
/** The passwords that opened documents, for operations that reopen a copy. They stay in this worker's memory. */
const passwords = new Map<DocId, string>();
let nextId = 1;
/**
 * Pages' text, kept while the user selects text on them (a drag asks again at every move), a few pages at most. Keyed
 * by document id and page.
 */
const texts = new Map<string, PageText>();
const TEXTS_KEPT = 4;

/** Intake has already checked the file; a PDF without a header (a damaged one MuPDF may repair) isn't an image. */
const isImage = (bytes: Uint8Array) => sniffKind(bytes.subarray(0, 1024), "", "") === "image";

/** Holds an opened document under a new id and describes it. */
function keep(ops: Awaited<typeof loading>, doc: PDFDocument, source: DocInfo["source"], password?: string): DocInfo {
  try {
    const id = `d${nextId++}`;
    if (password !== undefined && ops.unlockedWith(doc)) passwords.set(id, password);
    const description = ops.describe(doc);
    docs.set(id, doc);
    return { id, source, pageCount: description.pages.length, ...description };
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

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

  /**
   * Opens a PDF, or an image MuPDF or libheif decodes as a PDF with a page per frame. Other images are decoded on the
   * page and come in through openPixels.
   */
  async open(bytes: Uint8Array, password?: string): Promise<DocInfo> {
    const ops = await loading;
    if (!isImage(bytes)) return keep(ops, ops.openPdf(bytes, password), "pdf", password);
    const type = mupdfImageType(bytes);
    if (type) return keep(ops, ops.openImage(bytes, type), "image");
    if (isHeif(bytes)) {
      const { decodeHeic } = await import("./heic");
      return keep(ops, ops.openPixels(await decodeHeic(bytes), true), "image");
    }
    throw new EngineError("invalid-image", "This image has to be decoded on the page first");
  },

  /** Opens an image decoded to RGBA (by the page) as a one-page PDF. */
  async openPixels(bitmap: Bitmap, lossy: boolean): Promise<DocInfo> {
    const ops = await loading;
    return keep(ops, ops.openPixels(bitmap, lossy), "image");
  },

  /** Opens the page in a photo, straightened (see ops.openScan). */
  async openScan(photo: Bitmap, quad: Quad, filter: ScanFilter): Promise<DocInfo> {
    const ops = await loading;
    return keep(ops, ops.openScan(photo, quad, filter), "image");
  },

  async render(id: DocId, page: number, width: number): Promise<Bitmap> {
    const ops = await loading;
    const bitmap = ops.renderPage(get(id), page, width);
    return transfer(bitmap, [bitmap.pixels.buffer]);
  },

  async pageImage(id: DocId, page: number, options: ImageOptions): Promise<Uint8Array<ArrayBuffer>> {
    const ops = await loading;
    const bytes = ops.pageImage(get(id), page, options);
    return transfer(bytes, [bytes.buffer]);
  },

  async extractImages(id: DocId, page: number, skip: number[]): Promise<ExtractedImage[]> {
    const ops = await loading;
    const images = ops.extractImages(get(id), page, skip);
    return transfer(
      images,
      images.map((image) => image.bytes.buffer),
    );
  },

  async transform(id: DocId, options: TransformOptions): Promise<Uint8Array<ArrayBuffer>> {
    const ops = await loading;
    const bytes = ops.transform(get(id), options, passwords.get(id));
    return transfer(bytes, [bytes.buffer]);
  },

  async selectText(
    id: DocId,
    page: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
    words: boolean,
  ): Promise<TextSelection> {
    const ops = await loading;
    const key = `${id}:${page}`;
    let text = texts.get(key);
    if (text) texts.delete(key);
    else text = ops.pageText(get(id), page);
    // Most recently used last.
    texts.set(key, text);
    for (const [old, stale] of texts) {
      if (texts.size <= TEXTS_KEPT) break;
      stale.text.destroy();
      texts.delete(old);
    }
    return ops.selectText(text, from, to, words);
  },

  async assemble(pages: PageSpec[]): Promise<Uint8Array<ArrayBuffer>> {
    const ops = await loading;
    const bytes = ops.assemble(pages.map((spec) => ("blank" in spec ? spec : { ...spec, doc: get(spec.doc) })));
    return transfer(bytes, [bytes.buffer]);
  },

  close(id: DocId): void {
    for (const [key, text] of texts) {
      if (!key.startsWith(`${id}:`)) continue;
      text.text.destroy();
      texts.delete(key);
    }
    docs.get(id)?.destroy();
    docs.delete(id);
    passwords.delete(id);
  },
};

export type EngineApi = typeof api;

expose(api);
