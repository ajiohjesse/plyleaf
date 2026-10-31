import type * as PdfLib from "@cantoo/pdf-lib";
import type { Engine } from "../engine";

let lib: typeof PdfLib;

export const engine: Engine = {
  name: "pdflib",
  async init() {
    lib = await import("@cantoo/pdf-lib");
  },
  async open(bytes) {
    const doc = await lib.PDFDocument.load(bytes);
    return {
      pageCount: doc.getPageCount(),
      async pageSize(index) {
        return doc.getPage(index).getSize();
      },
      close: () => {},
    };
  },
  async merge(inputs) {
    const out = await lib.PDFDocument.create();
    for (const bytes of inputs) {
      const src = await lib.PDFDocument.load(bytes);
      for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
    }
    return out.save();
  },
  async rotateAll(input) {
    const doc = await lib.PDFDocument.load(input);
    for (const page of doc.getPages()) page.setRotation(lib.degrees(page.getRotation().angle + 90));
    return doc.save();
  },
};
