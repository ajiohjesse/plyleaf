// Edit PDF and the page tools: marks (text, images…) drawn onto pages. They're drawn with MuPDF's PDF writer on
// pages of a scratch document, which embeds fonts and images and encodes text for us, and each of those pages then
// goes onto its page as a form XObject drawn over the existing content.
import * as mupdf from "mupdf";
import { KAPPA, lineGeometry } from "~/editor/shapes";
import { drawOnTop, freeName, ownResources, subDictionary } from "./content";
import { EngineError } from "./errors";
import {
  LINE_HEIGHT,
  type Annotation,
  type Edits,
  type ImageMark,
  type Mark,
  type ShapeMark,
  type StandardFont,
  type TextMark,
} from "./types";

const FONT_NAMES: Record<StandardFont, [regular: string, bold: string, italic: string, boldItalic: string]> = {
  helvetica: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"],
  times: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"],
  courier: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"],
};

/** Draws `edits` onto the pages of `pdf` and adds their annotations. */
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
  if (byPage.size > 0) drawMarks(pdf, byPage, edits.images ?? []);
  for (const { page, annotations = [] } of edits.pages) {
    if (annotations.length > 0) annotate(pdf, page, annotations);
  }
}

const ANNOTATION_TYPES = { highlight: "Highlight", underline: "Underline", strikeout: "StrikeOut" } as const;

/** Adds annotations to a page. MuPDF draws their appearance, so every reader shows them the same way. */
function annotate(pdf: mupdf.PDFDocument, index: number, annotations: Annotation[]) {
  const page = pdf.loadPage(index);
  try {
    const [x0, y0] = page.getBounds();
    const placed = (quad: readonly number[]) => quad.map((n, i) => n + (i % 2 === 0 ? x0 : y0)) as mupdf.Quad;
    for (const annotation of annotations) {
      if (annotation.type === "ink") {
        const strokes = annotation.strokes.filter((stroke) => stroke.length > 0);
        if (strokes.length === 0) continue;
        const annot = page.createAnnotation("Ink");
        annot.setColor([...annotation.color]);
        annot.setBorderWidth(annotation.width);
        if (annotation.opacity !== undefined && annotation.opacity < 1) annot.setOpacity(annotation.opacity);
        annot.setInkList(strokes.map((stroke) => stroke.map(({ x, y }): mupdf.Point => [x + x0, y + y0])));
        annot.update();
        continue;
      }
      if (annotation.quads.length === 0) continue;
      const annot = page.createAnnotation(ANNOTATION_TYPES[annotation.type]);
      annot.setColor([...annotation.color]);
      annot.setQuadPoints(annotation.quads.map(placed));
      annot.update();
    }
  } finally {
    page.destroy();
  }
}

function drawMarks(pdf: mupdf.PDFDocument, byPage: Map<number, Mark[]>, images: Uint8Array[]) {
  const targets = [...byPage.keys()];
  const scratch = drawScratch(pdf, targets, byPage, images);
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
function drawScratch(
  pdf: mupdf.PDFDocument,
  targets: number[],
  byPage: Map<number, Mark[]>,
  images: Uint8Array[],
): mupdf.PDFDocument {
  const buffer = new mupdf.Buffer();
  const resources: Resources = { fonts: new Map(), images: new Map(), sources: images };
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
          for (const mark of byPage.get(index)!) drawMark(device, mark, origin, resources);
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
    for (const font of resources.fonts.values()) font.destroy();
    for (const image of resources.images.values()) image.destroy();
  }
}

/** Fonts and images loaded while drawing, shared by every page so each is written to the scratch document once. */
interface Resources {
  fonts: Map<string, mupdf.Font>;
  images: Map<number, mupdf.Image>;
  sources: Uint8Array[];
}

function drawMark(device: mupdf.Device, mark: Mark, origin: mupdf.Matrix, resources: Resources) {
  switch (mark.type) {
    case "text":
      drawText(device, mark, origin, resources.fonts);
      break;
    case "image":
      drawImage(device, mark, origin, resources);
      break;
    case "shape":
      drawShape(device, mark, origin);
      break;
  }
}

function drawShape(device: mupdf.Device, mark: ShapeMark, origin: mupdf.Matrix) {
  const { shape, x, y, width, height, lineWidth, opacity = 1 } = mark;
  const rgb = mupdf.ColorSpace.DeviceRGB;
  const line = shape === "line" || shape === "arrow";
  const stroke = mark.stroke && lineWidth > 0 ? mark.stroke : null;
  const path = new mupdf.Path();
  const head = new mupdf.Path();
  const state = new mupdf.StrokeState({
    lineCap: line ? "Round" : "Butt",
    lineJoin: line ? "Round" : "Miter",
    lineWidth,
    miterLimit: 10,
  });
  try {
    if (shape === "rectangle") {
      path.rect(x, y, x + width, y + height);
    } else if (shape === "ellipse") {
      const [rx, ry, cx, cy] = [width / 2, height / 2, x + width / 2, y + height / 2];
      path.moveTo(cx + rx, cy);
      path.curveTo(cx + rx, cy + ry * KAPPA, cx + rx * KAPPA, cy + ry, cx, cy + ry);
      path.curveTo(cx - rx * KAPPA, cy + ry, cx - rx, cy + ry * KAPPA, cx - rx, cy);
      path.curveTo(cx - rx, cy - ry * KAPPA, cx - rx * KAPPA, cy - ry, cx, cy - ry);
      path.curveTo(cx + rx * KAPPA, cy - ry, cx + rx, cy - ry * KAPPA, cx + rx, cy);
      path.closePath();
    } else {
      const geometry = lineGeometry(x, y, width, height, lineWidth, shape === "arrow");
      if (!geometry || !stroke) return;
      path.moveTo(x, y);
      path.lineTo(geometry.end.x, geometry.end.y);
      if (geometry.head) {
        const [tip, left, right] = geometry.head;
        head.moveTo(tip.x, tip.y);
        head.lineTo(left.x, left.y);
        head.lineTo(right.x, right.y);
        head.closePath();
      }
    }
    if (!line && mark.fill) device.fillPath(path, false, origin, rgb, [...mark.fill], opacity);
    if (stroke) device.strokePath(path, state, origin, rgb, [...stroke], opacity);
    if (stroke && shape === "arrow") device.fillPath(head, false, origin, rgb, [...stroke], opacity);
  } finally {
    path.destroy();
    head.destroy();
    state.destroy();
  }
}

function drawImage(device: mupdf.Device, mark: ImageMark, origin: mupdf.Matrix, resources: Resources) {
  const { x, y, width, height, rotate = 0, opacity = 1 } = mark;
  if (!(width > 0 && height > 0)) return;
  let image = resources.images.get(mark.image);
  if (!image) {
    const bytes = resources.sources[mark.image];
    if (!bytes) throw new EngineError("invalid-argument", `There's no image ${mark.image}`);
    try {
      image = new mupdf.Image(bytes.slice());
    } catch (error) {
      throw new EngineError("invalid-image", `Not a JPEG or PNG MuPDF can read: ${String(error)}`);
    }
    resources.images.set(mark.image, image);
  }
  // An image fills the unit square; this stretches it over the box, turned about the box's centre.
  const matrix = [
    mupdf.Matrix.scale(width, height),
    mupdf.Matrix.translate(-width / 2, -height / 2),
    mupdf.Matrix.rotate(-rotate),
    mupdf.Matrix.translate(x + width / 2, y + height / 2),
    origin,
  ].reduce((a, b) => mupdf.Matrix.concat(a, b));
  device.fillImage(image, matrix, opacity);
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
