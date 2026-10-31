// The main-thread side of the engine. Nothing here loads MuPDF: the worker (and its 10 MB of WASM) starts on the first
// call or on preloadEngine(), so pages that import this stay light until the user reaches for a file.
import { transfer, wrap, type Remote } from "comlink";
import { carryEngineErrors } from "./errors";
import type { Bitmap, DocId, DocInfo, PageSpec } from "./types";
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
}

let current: Running | null = null;

function start(): Running {
  if (!current) {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "plyleaf-engine" });
    current = { worker, remote: wrap<EngineApi>(worker), open: new Set(), bytes: 0, busy: 0 };
  }
  return current;
}

async function call<T>(run: (running: Running) => Promise<T>): Promise<T> {
  const running = start();
  running.busy++;
  try {
    return await run(running);
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
   * Opens a PDF and keeps it open in the worker until close(). A Uint8Array's buffer is transferred to the worker,
   * which leaves it empty here; pass a copy if you still need the bytes.
   */
  open(file: Blob | Uint8Array): Promise<DocInfo> {
    return call(async (running) => {
      const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : file;
      running.bytes += bytes.byteLength;
      const info = await running.remote.open(transfer(bytes, [bytes.buffer]));
      running.open.add(info.id);
      return info;
    });
  },

  /** Renders a page `width` device pixels wide on white. Paint it with `new ImageData(pixels, width, height)`. */
  render(id: DocId, page: number, width: number): Promise<Bitmap> {
    return call(({ remote }) => remote.render(id, page, width));
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

  /** For tests and diagnostics. */
  stats() {
    return { running: current !== null, openDocuments: current?.open.size ?? 0, bytesOpened: current?.bytes ?? 0 };
  },
};
