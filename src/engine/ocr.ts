// OCR PDF: the words Tesseract read on a page go onto it as invisible text, so the page looks the same but its text
// can be searched, selected and copied. Tesseract writes each page's words as a one-page, text-only PDF (its own
// "glyphless" font, every word placed and stretched to the size it is in the picture); that page is drawn onto the
// page as a form XObject, stretched over it.
import * as mupdf from "mupdf";
import { drawOnTop, freeName, ownResources, subDictionary } from "./content";
import { checkPageIndex } from "./ops";
import { EngineError } from "./errors";
import type { TextLayer } from "./types";

/** Puts each layer's words onto its page. */
export function addTextLayers(pdf: mupdf.PDFDocument, layers: readonly TextLayer[]) {
  for (const { page, pdf: bytes } of layers) addTextLayer(pdf, page, bytes);
}

function addTextLayer(pdf: mupdf.PDFDocument, index: number, bytes: Uint8Array) {
  checkPageIndex(pdf, index);
  let source: mupdf.PDFDocument;
  try {
    source = new mupdf.PDFDocument(bytes.slice());
  } catch (error) {
    throw new EngineError("invalid-argument", `A text layer isn't a PDF: ${String(error)}`);
  }
  try {
    if (source.countPages() !== 1) throw new EngineError("invalid-argument", "A text layer must be one page");
    const sheet = source.loadPage(0);
    const page = pdf.loadPage(index);
    try {
      const [sx0, sy0, sx1, sy1] = sheet.getBounds();
      const [x0, y0, x1, y1] = page.getBounds();
      // The layer's page is the picture's size at the resolution it was read at: within a pixel of the page's.
      const fit = mupdf.Matrix.concat(
        mupdf.Matrix.translate(-sx0, -sy0),
        mupdf.Matrix.scale((x1 - x0) / (sx1 - sx0), (y1 - y0) / (sy1 - sy0)),
      );
      // From the layer page's space to this page's, through the shown page both are measured on.
      const matrix = [
        sheet.getTransform(),
        fit,
        mupdf.Matrix.translate(x0, y0),
        mupdf.Matrix.invert(page.getTransform()),
      ].reduce((a, b) => mupdf.Matrix.concat(a, b));
      const object = sheet.getObject();
      const box = object.getInheritable("MediaBox");
      const bbox = [0, 1, 2, 3].map((i) => box.get(i).asNumber());
      const form = pdf.addStream(contentsOf(object), {
        Type: "XObject",
        Subtype: "Form",
        BBox: bbox,
        Matrix: matrix,
        Resources: pdf.graftObject(object.getInheritable("Resources")),
      });
      const target = page.getObject();
      const xobjects = subDictionary(pdf, ownResources(pdf, target), "XObject");
      const name = freeName(xobjects, "PlyleafOcr");
      xobjects.put(name, form);
      drawOnTop(pdf, target, `q /${name} Do Q`);
    } finally {
      page.destroy();
      sheet.destroy();
    }
  } finally {
    source.destroy();
  }
}

/** A page's content as one string of operators (its content streams joined). */
function contentsOf(page: mupdf.PDFObject): string {
  const contents = page.get("Contents");
  if (contents.isStream()) return contents.readStream().asString();
  if (!contents.isArray()) return "";
  return Array.from({ length: contents.length }, (_, i) => contents.get(i).readStream().asString()).join("\n");
}
