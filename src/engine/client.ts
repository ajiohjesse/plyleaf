// The main-thread side of the engine. Nothing here loads MuPDF: the worker (and its 10 MB of WASM) starts on the first
// call or on preloadEngine(), so pages that import this stay light until the user reaches for a file.
import { transfer, wrap, type Remote } from "comlink";
import type { ScanFilter } from "~/scan/filters";
import type { Quad } from "~/scan/quad";
import { decodeForEngine } from "./decode";
import { carryEngineErrors, EngineError } from "./errors";
import type { Bitmap, DocId, DocInfo, ExtractedImage, ImageOptions, PageSpec, TransformOptions } from "./types";
import type { EngineApi } from "./worker";

export { EngineError } from "./errors";
export type * from "./types";

carryEngineErrors();

/**
 * The WASM heap never shrinks, so once this much input has gone through a worker we terminate it as soon as it's idle
 * with no documents open. That hands the memory back; the next call starts a fresh worker (the WASM is cached).
 */
export const RECYCLE_AFTER_BYTES = 64 * 1024 * 1024;

interface Running {
  worker: Worker;
  remote: Remote<EngineApi>;
  open: Set<DocId>;
  /** Input bytes opened since this worker started. */
  bytes: number;
  /** Calls in flight. */
  busy: number;
  /** A call has succeeded, so the worker and MuPDF loaded. */
  loaded: boolean;
  /** Rejects when the worker is torn down, so calls in flight don't wait forever for a dead worker. */
  died: Promise<never>;
  kill: (error: EngineError) => void;
}

/** These leave the worker unusable: it is terminated and the next call starts a fresh one. */
const FATAL = new Set(["engine-crashed", "engine-unavailable"]);

let current: Running | null = null;
const resetListeners = new Set<(error: EngineError) => void>();

function start(): Running {
  if (!current) {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "plyleaf-engine" });
    let kill!: (error: EngineError) => void;
    const died = new Promise<never>((_, reject) => (kill = reject));
    died.catch(() => {});
    const running: Running = {
      worker,
      remote: wrap<EngineApi>(worker),
      open: new Set(),
      bytes: 0,
      busy: 0,
      loaded: false,
      died,
      kill,
    };
    // An uncaught error in the worker, or its script failing to load. Comlink would leave our calls pending.
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      tearDown(
        running,
        running.loaded
          ? new EngineError("engine-crashed", "The engine worker stopped")
          : new EngineError("engine-unavailable", "The engine worker couldn't start"),
      );
    });
    current = running;
  }
  return current;
}

/** Terminates a worker that can't go on, fails its calls in flight and tells listeners about lost documents. */
function tearDown(running: Running, error: EngineError) {
  if (running !== current) return;
  current = null;
  running.worker.terminate();
  running.kill(error);
  if (running.open.size > 0) for (const listener of resetListeners) listener(error);
}

async function call<T>(run: (running: Running) => Promise<T>): Promise<T> {
  const running = start();
  running.busy++;
  try {
    const result = await Promise.race([run(running), running.died]);
    running.loaded = true;
    return result;
  } catch (error) {
    if (error instanceof EngineError && FATAL.has(error.code)) tearDown(running, error);
    throw error;
  } finally {
    running.busy--;
    recycleIfDone(running);
  }
}

function recycleIfDone(running: Running) {
  if (running === current && running.busy === 0 && running.open.size === 0 && running.bytes >= RECYCLE_AFTER_BYTES) {
    running.worker.terminate();
    current = null;
  }
}

/** Starts the worker and the MuPDF download without waiting. Call it when the user opens a file picker or drags a file in. */
export function preloadEngine(): void {
  // A failure here (offline, say) shows up again on the first real call, where the caller handles it.
  call(({ remote }) => remote.ready()).catch(() => {});
}

export const engine = {
  /**
   * Opens a PDF (with `password` if it needs one) and keeps it open in the worker until close(). A Uint8Array's buffer is transferred to the worker,
   * which leaves it empty here; pass a copy if you still need the bytes.
   */
  open(file: Blob | Uint8Array, password?: string): Promise<DocInfo> {
    return call(async (running) => {
      const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : file;
      running.bytes += bytes.byteLength;
      // WebP, AVIF and (in Safari) HEIC are decoded here, by the browser, and go over as pixels.
      const decoded = await decodeForEngine(bytes);
      const info = decoded
        ? await running.remote.openPixels(transfer(decoded.bitmap, [decoded.bitmap.pixels.buffer]), decoded.lossy)
        : await running.remote.open(transfer(bytes, [bytes.buffer]), password);
      running.open.add(info.id);
      return info;
    });
  },

  /**
   * Opens the page in a photo as a document: the part inside `quad` straightened, with a filter. The photo's buffer is
   * transferred to the worker. Close it like any other document.
   */
  openScan(photo: Bitmap, quad: Quad, filter: ScanFilter): Promise<DocInfo> {
    return call(async (running) => {
      running.bytes += photo.pixels.byteLength;
      const info = await running.remote.openScan(transfer(photo, [photo.pixels.buffer]), quad, filter);
      running.open.add(info.id);
      return info;
    });
  },

  /** Renders a page `width` device pixels wide on white. Paint it with `new ImageData(pixels, width, height)`. */
  render(id: DocId, page: number, width: number): Promise<Bitmap> {
    return call(({ remote }) => remote.render(id, page, width));
  },

  /** Saves a page as a JPEG or PNG at a resolution, rendered on white. */
  pageImage(id: DocId, page: number, options: ImageOptions): Promise<Uint8Array<ArrayBuffer>> {
    return call(({ remote }) => remote.pageImage(id, page, options));
  },

  /** The images page `page` draws, leaving out the object numbers in `skip` (ones already found on other pages). */
  extractImages(id: DocId, page: number, skip: number[] = []): Promise<ExtractedImage[]> {
    return call(({ remote }) => remote.extractImages(id, page, skip));
  },

  /** A changed copy of an open document (compressed, secured…), as PDF bytes. The open document stays as it was. */
  transform(id: DocId, options: TransformOptions): Promise<Uint8Array<ArrayBuffer>> {
    return call(({ remote }) => remote.transform(id, options));
  },

  /** Builds a new PDF from pages of open documents and blank pages, in order. */
  assemble(pages: PageSpec[]): Promise<Uint8Array<ArrayBuffer>> {
    return call(({ remote }) => remote.assemble(pages));
  },

  close(id: DocId): Promise<void> {
    if (!current?.open.has(id)) return Promise.resolve();
    return call(async (running) => {
      running.open.delete(id);
      await running.remote.close(id);
    });
  },

  /**
   * Calls `listener` when the worker had to be restarted (it crashed, or its WASM aborted) while documents were open.
   * Those documents are gone: their ids no longer work. Returns a function that stops listening.
   */
  onReset(listener: (error: EngineError) => void): () => void {
    resetListeners.add(listener);
    return () => resetListeners.delete(listener);
  },

  /** For tests and diagnostics. */
  stats() {
    return { running: current !== null, openDocuments: current?.open.size ?? 0, bytesOpened: current?.bytes ?? 0 };
  },
};
