import type * as Mupdf from "mupdf";
import { paint, type Engine } from "../engine";

let mupdf: typeof Mupdf;

export const engine: Engine = {
  name: "mupdf",
  async init() {
    mupdf = await import("mupdf");
  },
  async open(bytes) {
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    return {
      pageCount: doc.countPages(),
      async pageSize(index) {
        const page = doc.loadPage(index);
        const [x0, y0, x1, y1] = page.getBounds();
        page.destroy();
        return { width: x1 - x0, height: y1 - y0 };
      },
      async render(index, scale, canvas) {
        const page = doc.loadPage(index);
        const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, true, true);
        paint(canvas, new Uint8ClampedArray(pix.getPixels()), pix.getWidth(), pix.getHeight());
        pix.destroy();
        page.destroy();
      },
      close: () => doc.destroy(),
    };
  },
  async merge(inputs) {
    const out = new mupdf.PDFDocument();
    for (const bytes of inputs) {
      const src = new mupdf.PDFDocument(bytes);
      const map = out.newGraftMap();
      for (let i = 0; i < src.countPages(); i++) map.graftPage(-1, src, i);
      src.destroy();
    }
    const buf = out.saveToBuffer("compress");
    const result = buf.asUint8Array().slice();
    buf.destroy();
    out.destroy();
    return result;
  },
  async rotateAll(input) {
    const doc = new mupdf.PDFDocument(input);
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.findPage(i);
      const rotate = page.get("Rotate");
      page.put("Rotate", ((rotate.isNumber() ? rotate.asNumber() : 0) + 90) % 360);
    }
    // A full rewrite, like pdf-lib and PDFium. MuPDF could also save incrementally (append only the changed objects).
    const buf = doc.saveToBuffer("compress");
    const result = buf.asUint8Array().slice();
    buf.destroy();
    doc.destroy();
    return result;
  },
};
