// Edit PDF and the page tools: marks (text, and more to come) drawn onto pages. They're drawn with MuPDF's PDF writer on
// pages of a scratch document, which embeds fonts and images and encodes text for us, and each of those pages then
// goes onto its page as a form XObject drawn over the existing content.
import * as mupdf from "mupdf";
import { drawOnTop, freeName, ownResources, subDictionary } from "./content";
import { EngineError } from "./errors";
import { LINE_HEIGHT, type Edits, type Mark, type StandardFont, type TextMark } from "./types";

const FONT_NAMES: Record<StandardFont, [regular: string, bold: string, italic: string, boldItalic: string]> = {
  helvetica: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"],
  times: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"],
  courier: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"],
};

/** Draws `edits` onto the pages of `pdf`. */
export function applyEdits(pdf: mupdf.PDFDocument, edits: Edits) {
  const pageCount = pdf.countPages();
  // Several entries for one page are drawn in order, as one.
  const byPage = new Map<number, Mark[]>();
  for (const { page, marks } of edits.pages) {
    if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
      throw new EngineError("invalid-argument", `There's no page ${page}`);
    }
    if (marks.length > 0) byPage.set(page, [...(byPage.get(page) ?? []), ...marks]);
  }
  if (byPage.size === 0) return;

  const targets = [...byPage.keys()];
  const scratch = drawScratch(pdf, targets, byPage);
  try {
    // One graft map, so a font or image used on many pages is copied once.
    const map = pdf.newGraftMap();
    targets.forEach((index, i) => {
      const drawn = scratch.findPage(i);
      const page = pdf.loadPage(index);
      try {
        const [x0, y0] = page.getBounds();
        const sheet = scratch.loadPage(i);
        const [, , width, height] = sheet.getBounds();
        // From the scratch page's space to the page's, through the shown page both are measured on.
        const matrix = mupdf.Matrix.concat(
          mupdf.Matrix.concat(sheet.getTransform(), mupdf.Matrix.translate(x0, y0)),
          mupdf.Matrix.invert(page.getTransform()),
        );
        sheet.destroy();
        const form = pdf.addStream(drawn.get("Contents").readStream(), {
          Type: "XObject",
          Subtype: "Form",
          BBox: [0, 0, width, height],
          Matrix: matrix,
          Resources: map.graftObject(drawn.get("Resources")),
        });
        const object = page.getObject();
        const xobjects = subDictionary(pdf, ownResources(pdf, object), "XObject");
        const name = freeName(xobjects, "PlyleafEdit");
        xobjects.put(name, form);
        drawOnTop(pdf, object, `q /${name} Do Q`);
      } finally {
        page.destroy();
      }
    });
  } finally {
    scratch.destroy();
  }
}

/** A document with a page per target page, the same size as it's shown, with its marks drawn on it. */
function drawScratch(pdf: mupdf.PDFDocument, targets: number[], byPage: Map<number, Mark[]>): mupdf.PDFDocument {
  const buffer = new mupdf.Buffer();
  const fonts = new Map<string, mupdf.Font>();
  try {
    const writer = new mupdf.DocumentWriter(buffer, "pdf", "");
    try {
      for (const index of targets) {
        const page = pdf.loadPage(index);
        const [x0, y0, x1, y1] = page.getBounds();
        page.destroy();
        const device = writer.beginPage([0, 0, x1 - x0, y1 - y0]);
        // Marks are measured from the shown page's top-left corner, which is (x0, y0) in MuPDF's page space.
        const origin = mupdf.Matrix.translate(-x0, -y0);
        try {
          for (const mark of byPage.get(index)!) drawMark(device, mark, origin, fonts);
        } finally {
          writer.endPage();
          device.destroy();
        }
      }
      writer.close();
    } finally {
      writer.destroy();
    }
    const scratch = new mupdf.PDFDocument(buffer.asUint8Array().slice());
    // Only the glyphs used are kept.
    scratch.subsetFonts();
    return scratch;
  } finally {
    buffer.destroy();
    for (const font of fonts.values()) font.destroy();
  }
}

function drawMark(device: mupdf.Device, mark: Mark, origin: mupdf.Matrix, fonts: Map<string, mupdf.Font>) {
  switch (mark.type) {
    case "text":
      drawText(device, mark, origin, fonts);
      break;
  }
}

function fontFor(mark: TextMark, fonts: Map<string, mupdf.Font>): mupdf.Font {
  const names = FONT_NAMES[mark.font];
  if (!names) throw new EngineError("invalid-argument", `There's no font "${mark.font}"`);
  const name = names[(mark.bold ? 1 : 0) + (mark.italic ? 2 : 0)]!;
  let font = fonts.get(name);
  if (!font) {
    font = new mupdf.Font(name);
    fonts.set(name, font);
  }
  return font;
}

/** How far a line runs at size 1, in points. */
function advance(font: mupdf.Font, line: string): number {
  const text = new mupdf.Text();
  try {
    return text.showString(font, mupdf.Matrix.identity, line)[4];
  } finally {
    text.destroy();
  }
}

function drawText(device: mupdf.Device, mark: TextMark, origin: mupdf.Matrix, fonts: Map<string, mupdf.Font>) {
  const { size, align = "left", rotate = 0, opacity = 1 } = mark;
  if (!(size > 0) || !mark.text) return;
  const font = fontFor(mark, fonts);
  // Characters the font has no glyph for would show as boxes; the editor warns about them before this.
  const shown = (line: string) =>
    Array.from(line.replaceAll("\t", "    "))
      .filter((char) => font.encodeCharacter(char) > 0)
      .join("");
  // Page space has y going down, so turning anticlockwise on the page is a negative angle here.
  const placed = mupdf.Matrix.concat(
    mupdf.Matrix.concat(mupdf.Matrix.rotate(-rotate), mupdf.Matrix.translate(mark.x, mark.y)),
    origin,
  );
  const text = new mupdf.Text();
  try {
    mark.text.split("\n").forEach((raw, i) => {
      const line = shown(raw);
      if (!line) return;
      const width = align === "left" ? 0 : advance(font, line) * size;
      const start = align === "center" ? -width / 2 : align === "right" ? -width : 0;
      text.showString(font, [size, 0, 0, -size, start, i * size * LINE_HEIGHT], line);
    });
    device.fillText(text, placed, mupdf.ColorSpace.DeviceRGB, [...mark.color], opacity);
  } finally {
    text.destroy();
  }
}
