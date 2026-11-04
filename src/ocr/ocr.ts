// OCR PDF on the page: each page is rendered by the engine, read by Tesseract (in its own worker, with its own WASM),
// and comes back as a text layer for `engine.transform`. Nothing here is loaded until OCR starts, and nothing leaves
// the device: Tesseract and its reading data are fetched from our own origin.
import { engine } from "~/engine/client";
import type { DocId, PageInfo, TextLayer } from "~/engine/types";
import type { LanguageCode } from "./catalogue";
import { ocrResolution } from "./resolution";

/** Where the reading data is served from (copied there by scripts/ocr-data.ts): `<code>.traineddata.gz`. */
export const TESSDATA = "/ocr/tessdata/4.0.0_best_int";

export type OcrProgress =
  | { stage: "loading"; fraction: number }
  | { stage: "reading"; page: number; done: number; total: number; fraction: number };

export interface OcrResult {
  layers: TextLayer[];
  /** Words read on each page read, by page index. */
  words: Map<number, number>;
}

/** Thrown when OCR is cancelled with its signal. */
export class OcrCancelled extends Error {
  constructor() {
    super("OCR was cancelled");
  }
}

/**
 * Reads `pages` (indexes into `pageInfo`) of an open document in `languages`, calling `onProgress` as it goes. Stops
 * with OcrCancelled when `signal` aborts.
 */
export async function readPages(
  doc: DocId,
  pageInfo: readonly PageInfo[],
  pages: readonly number[],
  languages: readonly LanguageCode[],
  onProgress: (progress: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<OcrResult> {
  onProgress({ stage: "loading", fraction: 0 });
  const [{ default: Tesseract }, { tesseractPaths }] = await Promise.all([
    import("tesseract.js/dist/tesseract.esm.min.js"),
    import("./core"),
  ]);
  const paths = await tesseractPaths();
  if (signal?.aborted) throw new OcrCancelled();

  // Tesseract reports a failure (data that won't load, say) to errorHandler and leaves its promise pending, and a
  // stopped worker never answers; so every step races these.
  let fail!: (error: Error) => void;
  const failed = new Promise<never>((_, reject) => (fail = reject));
  const cancelled = new Promise<never>((_, reject) => {
    if (signal?.aborted) reject(new OcrCancelled());
    signal?.addEventListener("abort", () => reject(new OcrCancelled()), { once: true });
  });
  failed.catch(() => {});
  cancelled.catch(() => {});
  const guard = <T>(step: Promise<T>) => Promise.race([step, failed, cancelled]);

  let current: { page: number; done: number } | null = null;
  const starting = Tesseract.createWorker(languages.join("+"), Tesseract.OEM.LSTM_ONLY, {
    ...paths,
    langPath: new URL(TESSDATA, location.href).href,
    workerBlobURL: false,
    // The browser's HTTP cache keeps the data (its path names its version), so Tesseract needn't keep a copy too.
    cacheMethod: "none",
    gzip: true,
    errorHandler: (error: unknown) => fail(new Error(`Tesseract failed: ${String(error)}`)),
    logger: (message) => {
      if (message.status === "loading language traineddata") {
        onProgress({ stage: "loading", fraction: message.progress });
      } else if (current && message.status === "recognizing text") {
        onProgress({
          stage: "reading",
          page: current.page,
          done: current.done,
          total: pages.length,
          fraction: (current.done + message.progress) / pages.length,
        });
      }
    },
  });
  try {
    const worker = await guard(starting);
    const layers: TextLayer[] = [];
    const words = new Map<number, number>();
    for (const [done, page] of pages.entries()) {
      current = { page, done };
      onProgress({ stage: "reading", page, done, total: pages.length, fraction: done / pages.length });
      const dpi = ocrResolution(pageInfo[page]!);
      const image = await guard(engine.pageImage(doc, page, { dpi, format: "png" }));
      await guard(worker.setParameters({ user_defined_dpi: String(dpi) }));
      const png = new Blob([image], { type: "image/png" });
      const { data: result } = await guard(worker.recognize(png, { pdfTextOnly: true }, { pdf: true, text: true }));
      const count = result.text.split(/\s+/).filter(Boolean).length;
      words.set(page, count);
      if (count > 0 && result.pdf) layers.push({ page, pdf: new Uint8Array(result.pdf) });
    }
    onProgress({ stage: "reading", page: pages.at(-1) ?? 0, done: pages.length, total: pages.length, fraction: 1 });
    return { layers, words };
  } finally {
    // Done, failed or stopped, the worker goes: now, or whenever it finishes starting.
    starting.then((worker) => worker.terminate()).catch(() => {});
  }
}
