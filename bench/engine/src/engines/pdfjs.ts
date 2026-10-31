import type * as Pdfjs from "pdfjs-dist";
// oxlint-disable-next-line import/default -- Vite's ?url suffix provides the default export
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Engine } from "../engine";

let pdfjs: typeof Pdfjs;
let worker: Pdfjs.PDFWorker;

export const engine: Engine = {
  name: "pdfjs",
  async init() {
    pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    worker = new pdfjs.PDFWorker();
    await worker.promise;
  },
  async open(bytes) {
    // pdf.js transfers the buffer to its worker, so give it a copy.
    const task = pdfjs.getDocument({ data: bytes.slice(), worker });
    const doc = await task.promise;
    return {
      pageCount: doc.numPages,
      async pageSize(index) {
        const page = await doc.getPage(index + 1);
        const { width, height } = page.getViewport({ scale: 1, rotation: 0 });
        return { width, height };
      },
      async render(index, scale, canvas) {
        const page = await doc.getPage(index + 1);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvas, viewport }).promise;
        page.cleanup();
      },
      close: () => void task.destroy(),
    };
  },
  async merge(inputs) {
    const [first, ...rest] = inputs;
    const task = pdfjs.getDocument({ data: first!.slice(), worker });
    const doc = await task.promise;
    const out = await doc.extractPages([{ document: null }, ...rest.map((document) => ({ document }))]);
    await task.destroy();
    return out;
  },
};
