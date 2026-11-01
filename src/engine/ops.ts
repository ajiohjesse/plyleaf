// The engine's operations, written against MuPDF.js directly so they run (and are unit-tested) in Node as well as in
// the worker. They hold no state: the worker owns the open documents and passes them in.
import * as mupdf from "mupdf";
import { blackAndWhite, type ScanFilter } from "~/scan/filters";
import { isConvex, outputSize, type Quad } from "~/scan/quad";
import { EngineError } from "./errors";
import {
  MAX_RENDER_SIDE,
  type Bitmap,
  type Crop,
  type ExtractedImage,
  type Fit,
  type ImageOptions,
  type PageInfo,
  type Rotation,
} from "./types";

export { MAX_RENDER_SIDE } from "./types";
export { transform } from "./transform";
/** Largest page side in PDF points (200 in), the limit in the PDF spec. */
export const MAX_PAGE_SIDE = 14_400;
/**
 * The largest page an image opens as. A4 and US Letter both fit inside it unscaled, so scans keep their size, while a
 * phone photo (4000 px at 72 or 96 dpi, over a metre wide) comes down to a page you can print.
 */
export const IMAGE_PAGE = { width: 612, height: 842 };

export type Source = { doc: mupdf.PDFDocument; page: number; rotate?: Rotation; crop?: Crop; fit?: Fit };
export type AssembleSpec = Source | { blank: { width: number; height: number } };

/** Opens PDF bytes. MuPDF copies them, so the caller can drop its copy. */
export function openPdf(bytes: Uint8Array): mupdf.PDFDocument {
  let doc: mupdf.Document;
  try {
    doc = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch (error) {
    throw new EngineError("invalid-file", `Not a readable PDF: ${message(error)}`);
  }
  const pdf = doc.asPDF();
  if (!pdf) {
    doc.destroy();
    throw new EngineError("invalid-file", "Not a PDF");
  }
  if (pdf.needsPassword()) {
    pdf.destroy();
    throw new EngineError("password-required", "This PDF is protected with a password");
  }
  let pageCount = 0;
  try {
    pageCount = pdf.countPages();
  } catch (error) {
    pdf.destroy();
    throw new EngineError("invalid-file", `The page tree is damaged: ${message(error)}`);
  }
  if (pageCount === 0) {
    pdf.destroy();
    throw new EngineError("invalid-file", "This PDF has no pages");
  }
  return pdf;
}

/**
 * Opens an image MuPDF can decode as a PDF with a page per frame (a multi-page TIFF has several), each the size the
 * image's resolution gives (96 dpi when it doesn't say), scaled down to fit IMAGE_PAGE. EXIF orientation is applied.
 * JPEGs are carried over as they are, without re-compressing.
 */
export function openImage(bytes: Uint8Array, type: string): mupdf.PDFDocument {
  let image: mupdf.Document;
  try {
    image = mupdf.Document.openDocument(bytes, type);
  } catch (error) {
    throw new EngineError("invalid-image", `Not a readable image: ${message(error)}`);
  }
  const buffer = new mupdf.Buffer();
  try {
    const count = image.countPages();
    if (count === 0) throw new EngineError("invalid-image", "This image has no frames");
    // "compress" deflates what isn't compressed already (decoded PNGs); JPEGs stay as they are.
    const writer = new mupdf.DocumentWriter(buffer, "pdf", "compress");
    try {
      for (let i = 0; i < count; i++) {
        const page = image.loadPage(i);
        try {
          const [x0, y0, x1, y1] = page.getBounds();
          const width = x1 - x0;
          const height = y1 - y0;
          const box = height >= width ? IMAGE_PAGE : { width: IMAGE_PAGE.height, height: IMAGE_PAGE.width };
          const scale = Math.min(1, box.width / width, box.height / height);
          const device = writer.beginPage([0, 0, width * scale, height * scale]);
          page.run(device, mupdf.Matrix.concat(mupdf.Matrix.translate(-x0, -y0), mupdf.Matrix.scale(scale, scale)));
          writer.endPage();
          device.destroy();
        } finally {
          page.destroy();
        }
      }
      writer.close();
    } finally {
      writer.destroy();
    }
    return openPdf(buffer.asUint8Array());
  } catch (error) {
    if (error instanceof EngineError && error.code !== "invalid-file") throw error;
    throw new EngineError("invalid-image", `Not a readable image: ${message(error)}`);
  } finally {
    buffer.destroy();
    image.destroy();
  }
}

/**
 * Opens a decoded image (RGBA, not premultiplied) as a one-page PDF, like openImage. Opaque images are stored as JPEG
 * at quality 90 when `lossy` (they were lossy already, like a photo), otherwise losslessly as PNG, with any
 * transparency.
 */
export function openPixels(bitmap: Bitmap, lossy: boolean): mupdf.PDFDocument {
  checkBitmap(bitmap);
  let opaque = true;
  for (let i = 3; i < bitmap.pixels.length; i += 4) {
    if (bitmap.pixels[i] !== 255) {
      opaque = false;
      break;
    }
  }
  const pixmap = pixmapFrom(bitmap, !opaque);
  try {
    const jpeg = opaque && lossy;
    return openImage(jpeg ? pixmap.asJPEG(90) : pixmap.asPNG(), jpeg ? "image/jpeg" : "image/png");
  } finally {
    pixmap.destroy();
  }
}

/**
 * Opens a page photographed at an angle as a one-page PDF: the part of `photo` inside `quad` (fractions of the photo,
 * top-left first, clockwise) straightened into a rectangle, then kept in colour, made grey, or black and white.
 * Colour and grey are stored as JPEG; black and white as (lossless, and small) PNG.
 */
export function openScan(photo: Bitmap, quad: Quad, filter: ScanFilter): mupdf.PDFDocument {
  checkBitmap(photo);
  const valid = quad.length === 4 && quad.flat().every((n) => Number.isFinite(n) && n >= 0 && n <= 1) && isConvex(quad);
  if (!valid) throw new EngineError("invalid-argument", "Those corners don't make a page shape");
  const size = outputSize(quad, photo.width, photo.height);
  const pixmap = pixmapFrom(photo, false);
  const pixmaps = [pixmap];
  try {
    const corners = quad.map(([x, y]) => [x * photo.width, y * photo.height] as mupdf.Point);
    let page = pixmap.warp(corners, size.width, size.height);
    pixmaps.push(page);
    if (filter !== "colour") {
      page = page.convertToColorSpace(mupdf.ColorSpace.DeviceGray, false);
      pixmaps.push(page);
    }
    if (filter === "bw") blackAndWhite(page.getPixels(), page.getWidth(), page.getHeight(), page.getStride());
    // A resolution that makes the longer side about A4's height (11.7 in), as most scanned pages are about that big.
    const dpi = Math.max(72, Math.round(Math.max(size.width, size.height) / 11.7));
    page.setResolution(dpi, dpi);
    return filter === "bw" ? openImage(page.asPNG(), "image/png") : openImage(page.asJPEG(85), "image/jpeg");
  } finally {
    for (const p of pixmaps) p.destroy();
  }
}

function checkBitmap({ width, height, pixels }: Bitmap) {
  if (!(width >= 1 && height >= 1 && pixels.length === width * height * 4)) {
    throw new EngineError("invalid-image", `Can't make a ${width} × ${height} image from ${pixels.length} bytes`);
  }
}

/** A MuPDF pixmap of RGBA pixels (not premultiplied): RGB, or RGB with (premultiplied) alpha. */
function pixmapFrom({ width, height, pixels }: Bitmap, alpha: boolean): mupdf.Pixmap {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], alpha);
  const target = pixmap.getPixels();
  const stride = pixmap.getStride();
  for (let y = 0; y < height; y++) {
    let from = y * width * 4;
    let to = y * stride;
    for (let x = 0; x < width; x++, from += 4) {
      if (!alpha) {
        target[to++] = pixels[from]!;
        target[to++] = pixels[from + 1]!;
        target[to++] = pixels[from + 2]!;
      } else {
        // MuPDF's pixmaps with alpha are premultiplied.
        const a = pixels[from + 3]!;
        target[to++] = Math.round((pixels[from]! * a) / 255);
        target[to++] = Math.round((pixels[from + 1]! * a) / 255);
        target[to++] = Math.round((pixels[from + 2]! * a) / 255);
        target[to++] = a;
      }
    }
  }
  return pixmap;
}

/**
 * The images a page draws (its image XObjects, and those of the forms it draws), leaving out ones whose object number
 * is in `skip` (found on earlier pages) and stencil masks. A plain JPEG comes out byte for byte; anything else, or an
 * image with transparency, is decoded and saved as PNG. Inline images aren't included.
 */
export function extractImages(pdf: mupdf.PDFDocument, index: number, skip: readonly number[] = []): ExtractedImage[] {
  checkPageIndex(pdf, index);
  const skipped = new Set(skip);
  return pageImages(pdf, index)
    .filter(({ id }) => !skipped.has(id))
    .flatMap(({ id, ref }) => {
      try {
        return [extractImage(pdf, id, ref)];
      } catch {
        // An image MuPDF can't decode is left out rather than failing the whole page.
        return [];
      }
    });
}

/**
 * The image XObjects a page draws, directly or inside the forms it draws, once each, by object number. Stencil masks
 * (shapes filled with a colour) aren't included.
 */
export function pageImages(pdf: mupdf.PDFDocument, index: number): { id: number; ref: mupdf.PDFObject }[] {
  const found: { id: number; ref: mupdf.PDFObject }[] = [];
  const formsSeen = new Set<number>();
  const visit = (resources: mupdf.PDFObject) => {
    const xobjects = resources.get("XObject");
    if (!xobjects.isDictionary()) return;
    xobjects.forEach((ref) => {
      const object = ref.resolve();
      const id = ref.isIndirect() ? ref.asIndirect() : -1;
      const subtype = object.get("Subtype");
      if (subtype.isName() && subtype.asName() === "Image") {
        if (id === -1 || found.some((f) => f.id === id)) return;
        if (object.get("ImageMask").isBoolean() && object.get("ImageMask").asBoolean()) return;
        found.push({ id, ref });
      } else if (subtype.isName() && subtype.asName() === "Form" && !formsSeen.has(id)) {
        formsSeen.add(id);
        visit(object.get("Resources"));
      }
    });
  };
  visit(pdf.findPage(index).getInheritable("Resources"));
  return found;
}

function extractImage(pdf: mupdf.PDFDocument, id: number, ref: mupdf.PDFObject): ExtractedImage {
  const object = ref.resolve();
  const width = object.get("Width").asNumber();
  const height = object.get("Height").asNumber();
  if (isPlainJpeg(object)) {
    return { id, format: "jpeg", width, height, bytes: ref.readRawStream().asUint8Array().slice() };
  }
  const image = pdf.loadImage(ref);
  try {
    const mask = image.getMask();
    const pixmap = image.toPixmap();
    try {
      const rgb = toDisplayColours(pixmap);
      try {
        return { id, format: "png", width, height, bytes: withMask(rgb, mask).slice() as Uint8Array<ArrayBuffer> };
      } finally {
        if (rgb !== pixmap) rgb.destroy();
      }
    } finally {
      pixmap.destroy();
      mask?.destroy();
    }
  } finally {
    image.destroy();
  }
}

/** A JPEG any viewer shows as the PDF does: DCT only, 8-bit grey or RGB, no decode array and no soft mask. */
function isPlainJpeg(image: mupdf.PDFObject) {
  const filter = image.get("Filter");
  const filters = filter.isArray() ? Array.from({ length: filter.length }, (_, i) => filter.get(i)) : [filter];
  if (filters.length !== 1 || !filters[0]!.isName() || filters[0]!.asName() !== "DCTDecode") return false;
  if (!image.get("SMask").isNull() || !image.get("Mask").isNull() || !image.get("Decode").isNull()) return false;
  const space = image.get("ColorSpace");
  if (space.isName()) return space.asName() === "DeviceRGB" || space.asName() === "DeviceGray";
  // An ICC profile with 1 or 3 components (grey or RGB); CMYK JPEGs are often stored inverted.
  if (space.isArray() && space.get(0).asName() === "ICCBased") {
    const components = space.get(1).get("N").asNumber();
    return components === 1 || components === 3;
  }
  return false;
}

/** Grey and RGB stay as they are; anything else (CMYK, Lab, separations) becomes RGB. */
export function toDisplayColours(pixmap: mupdf.Pixmap): mupdf.Pixmap {
  const type = pixmap.getColorSpace()?.getType();
  if (type === "Gray" || type === "RGB") return pixmap;
  return pixmap.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false);
}

/** PNG bytes of `pixmap`, with `mask` (a soft mask the same size) as its transparency. */
function withMask(pixmap: mupdf.Pixmap, mask: mupdf.Image | null): Uint8Array {
  if (!mask || mask.getWidth() !== pixmap.getWidth() || mask.getHeight() !== pixmap.getHeight()) {
    return pixmap.asPNG();
  }
  const alpha = mask.toPixmap();
  const colours = pixmap.getNumberOfComponents() - pixmap.getAlpha();
  const out = new mupdf.Pixmap(pixmap.getColorSpace()!, [0, 0, pixmap.getWidth(), pixmap.getHeight()], true);
  try {
    const from = pixmap.getPixels();
    const a = alpha.getPixels();
    const to = out.getPixels();
    const n = pixmap.getNumberOfComponents();
    for (let y = 0; y < pixmap.getHeight(); y++) {
      for (let x = 0; x < pixmap.getWidth(); x++) {
        const source = y * pixmap.getStride() + x * n;
        const target = y * out.getStride() + x * (colours + 1);
        const opacity = a[y * alpha.getStride() + x * alpha.getNumberOfComponents()]!;
        // MuPDF's pixmaps with alpha are premultiplied.
        for (let c = 0; c < colours; c++) to[target + c] = Math.round((from[source + c]! * opacity) / 255);
        to[target + colours] = opacity;
      }
    }
    return out.asPNG();
  } finally {
    out.destroy();
    alpha.destroy();
  }
}

export function describe(pdf: mupdf.PDFDocument): { pages: PageInfo[]; repaired: boolean } {
  const pages: PageInfo[] = [];
  for (let i = 0; i < pdf.countPages(); i++) {
    const page = pdf.loadPage(i);
    const [x0, y0, x1, y1] = page.getBounds();
    pages.push({ width: x1 - x0, height: y1 - y0, rotation: pageRotation(page.getObject()) });
    page.destroy();
  }
  return { pages, repaired: pdf.wasRepaired() };
}

/** Renders a page `width` pixels wide (height follows the page's aspect ratio) on a white background. */
export function renderPage(pdf: mupdf.PDFDocument, index: number, width: number): Bitmap {
  checkPageIndex(pdf, index);
  const page = pdf.loadPage(index);
  try {
    const [x0, y0, x1, y1] = page.getBounds();
    const scale = width / (x1 - x0);
    const height = (y1 - y0) * scale;
    if (!(width >= 1 && width <= MAX_RENDER_SIDE && height >= 1 && height <= MAX_RENDER_SIDE)) {
      throw new EngineError("invalid-argument", `Can't render page ${index + 1} at ${width} px wide`);
    }
    // No alpha, so MuPDF paints the page on white and nothing is premultiplied; then widen RGB to RGBA for ImageData.
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      return toRgba(pixmap);
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

/**
 * Renders a page at `dpi` (on white) and encodes it as JPEG (quality 0–100) or PNG, with the resolution recorded in
 * the file. The page is scaled down if that would make a side longer than MAX_RENDER_SIDE.
 */
export function pageImage(
  pdf: mupdf.PDFDocument,
  index: number,
  { dpi, format, quality = 90 }: ImageOptions,
): Uint8Array<ArrayBuffer> {
  checkPageIndex(pdf, index);
  if (!(Number.isFinite(dpi) && dpi >= 1 && dpi <= 2400 && quality >= 1 && quality <= 100)) {
    throw new EngineError("invalid-argument", `Can't make an image at ${dpi} dpi, quality ${quality}`);
  }
  const page = pdf.loadPage(index);
  try {
    const [x0, y0, x1, y1] = page.getBounds();
    const scale = Math.min(dpi / 72, MAX_RENDER_SIDE / (x1 - x0), MAX_RENDER_SIDE / (y1 - y0));
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      const actual = Math.round(scale * 72);
      pixmap.setResolution(actual, actual);
      return (format === "png" ? pixmap.asPNG() : pixmap.asJPEG(quality)).slice() as Uint8Array<ArrayBuffer>;
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

/**
 * Builds a new PDF from pages of open documents and blank pages, in order. This one operation covers merge, extract,
 * delete, reorder, rotate, duplicate and insert-blank. Each source's shared resources (fonts, images) are copied once.
 */
export function assemble(specs: readonly AssembleSpec[]): Uint8Array<ArrayBuffer> {
  if (specs.length === 0) throw new EngineError("invalid-argument", "No pages to assemble");
  const out = new mupdf.PDFDocument();
  const maps = new Map<mupdf.PDFDocument, mupdf.PDFGraftMap>();
  try {
    for (const spec of specs) {
      if ("blank" in spec) {
        const { width, height } = spec.blank;
        if (!(width >= 1 && width <= MAX_PAGE_SIDE && height >= 1 && height <= MAX_PAGE_SIDE)) {
          throw new EngineError("invalid-argument", `A blank page can't be ${width} × ${height} pt`);
        }
        out.insertPage(-1, out.addPage([0, 0, width, height], 0, {}, ""));
        continue;
      }
      checkPageIndex(spec.doc, spec.page);
      let map = maps.get(spec.doc);
      if (!map) maps.set(spec.doc, (map = out.newGraftMap()));
      map.graftPage(-1, spec.doc, spec.page);
      const page = out.findPage(out.countPages() - 1);
      // Crop first: the crop is measured on the page as its own rotation shows it.
      if (spec.crop) cropPage(page, spec.crop, spec.page);
      if (spec.rotate) page.put("Rotate", (pageRotation(page) + spec.rotate) % 360);
      if (spec.fit) fitPage(out, out.countPages() - 1, spec.fit, spec.page);
    }
    const buffer = out.saveToBuffer("garbage,compress");
    try {
      // Copy out of WASM memory: the view dies with the buffer.
      return buffer.asUint8Array().slice();
    } finally {
      buffer.destroy();
    }
  } finally {
    for (const map of maps.values()) map.destroy();
    out.destroy();
  }
}

/** Sets a page's /CropBox to the part `crop` describes, in the page's own (unrotated) coordinates. */
function cropPage(page: mupdf.PDFObject, crop: Crop, index: number) {
  const { x, y, width, height } = crop;
  const valid = [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0;
  if (!valid || x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
    throw new EngineError("invalid-argument", `Page ${index + 1} can't be cropped to that area`);
  }
  // What shows now: the crop box (if any) inside the media box.
  const media = boxOf(page, "MediaBox") ?? [0, 0, 612, 792];
  const current = boxOf(page, "CropBox") ?? media;
  const llx = Math.max(media[0], current[0]);
  const lly = Math.max(media[1], current[1]);
  const urx = Math.min(media[2], current[2]);
  const ury = Math.min(media[3], current[3]);
  const w = urx - llx;
  const h = ury - lly;
  // Where a point (u right, v down, as fractions of the shown page) is in the page's own coordinates.
  const at = (u: number, v: number): [number, number] => {
    switch (pageRotation(page)) {
      case 90:
        return [llx + v * w, lly + u * h];
      case 180:
        return [urx - u * w, lly + v * h];
      case 270:
        return [urx - v * w, ury - u * h];
      default:
        return [llx + u * w, ury - v * h];
    }
  };
  const [ax, ay] = at(x, y);
  const [bx, by] = at(x + width, y + height);
  const box = [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)] as const;
  if (box[2] - box[0] < 1 || box[3] - box[1] < 1) {
    throw new EngineError("invalid-argument", `Page ${index + 1} would be cropped to less than a point`);
  }
  page.put(
    "CropBox",
    box.map((n) => Math.round(n * 1000) / 1000),
  );
}

/**
 * Replaces page `at` of `out` with a page of `fit`'s size that shows it, scaled to fit inside the margins and centred.
 * The old page's content becomes a form XObject; its annotations (links, notes) don't come along.
 */
function fitPage(out: mupdf.PDFDocument, at: number, fit: Fit, index: number) {
  const { width, height, margin } = fit;
  const valid =
    [width, height, margin].every(Number.isFinite) &&
    width >= 1 &&
    width <= MAX_PAGE_SIDE &&
    height >= 1 &&
    height <= MAX_PAGE_SIDE &&
    margin >= 0 &&
    Math.min(width, height) - 2 * margin >= 1;
  if (!valid) {
    throw new EngineError("invalid-argument", `Page ${index + 1} can't go on a ${width} × ${height} pt page`);
  }
  const page = out.findPage(at);
  const media = boxOf(page, "MediaBox") ?? [0, 0, 612, 792];
  const crop = boxOf(page, "CropBox") ?? media;
  const llx = Math.max(media[0], crop[0]);
  const lly = Math.max(media[1], crop[1]);
  const urx = Math.min(media[2], crop[2]);
  const ury = Math.min(media[3], crop[3]);
  const w = urx - llx;
  const h = ury - lly;
  const rotation = pageRotation(page);
  const [shownWidth, shownHeight] = rotation % 180 === 0 ? [w, h] : [h, w];
  const scale = Math.min((width - 2 * margin) / shownWidth, (height - 2 * margin) / shownHeight);
  // From the page's own coordinates to how /Rotate shows it (turned clockwise), with the origin at the bottom left.
  const turn: Record<Rotation, Matrix6> = {
    0: [1, 0, 0, 1, 0, 0],
    90: [0, -1, 1, 0, 0, w],
    180: [-1, 0, 0, -1, w, h],
    270: [0, 1, -1, 0, h, 0],
  };
  const matrix = [
    turn[rotation],
    [scale, 0, 0, scale, (width - shownWidth * scale) / 2, (height - shownHeight * scale) / 2] as Matrix6,
  ].reduce(then, [1, 0, 0, 1, -llx, -lly]);

  // Not resolved: MuPDF only treats the indirect reference as a stream.
  const contents = page.get("Contents");
  const streams = contents.isArray() ? Array.from({ length: contents.length }, (_, i) => contents.get(i)) : [contents];
  const parts = streams.filter((s) => s.isStream()).map((s) => s.readStream().asUint8Array().slice());
  // Content streams count as one, with whitespace between them.
  const content = new Uint8Array(parts.reduce((sum, part) => sum + part.length + 1, 0)).fill(0x0a);
  let offset = 0;
  for (const part of parts) {
    content.set(part, offset);
    offset += part.length + 1;
  }
  const form = out.addStream(content, {
    Type: "XObject",
    Subtype: "Form",
    BBox: [llx, lly, urx, ury],
    Resources: page.getInheritable("Resources"),
  });
  const placed = out.addPage(
    [0, 0, width, height],
    0,
    { XObject: { Page: form } },
    `q ${matrix.map(num).join(" ")} cm /Page Do Q`,
  );
  out.deletePage(at);
  out.insertPage(at, placed);
}

type Matrix6 = [number, number, number, number, number, number];

/** The matrix that applies `a`, then `b`. */
function then(a: Matrix6, b: Matrix6): Matrix6 {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

/** A number the way content streams take it: no exponent, at most 5 decimals. */
function num(n: number) {
  const text = n.toFixed(5).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}

/** A page's box (inherited if need be), normalised so the first corner is the lower left. */
function boxOf(page: mupdf.PDFObject, key: "MediaBox" | "CropBox"): [number, number, number, number] | null {
  const value = page.getInheritable(key);
  if (!value.isArray() || value.length < 4) return null;
  const [a, b, c, d] = [0, 1, 2, 3].map((i) => value.get(i).asNumber());
  return [Math.min(a!, c!), Math.min(b!, d!), Math.max(a!, c!), Math.max(b!, d!)];
}

export function checkPageIndex(pdf: mupdf.PDFDocument, index: number) {
  const count = pdf.countPages();
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new EngineError("invalid-argument", `Page ${index + 1} doesn't exist (the document has ${count})`);
  }
}

function pageRotation(page: mupdf.PDFObject): Rotation {
  const value = page.getInheritable("Rotate");
  const degrees = value.isNumber() ? value.asNumber() : 0;
  // The spec allows only multiples of 90; MuPDF rounds others the same way.
  return ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as Rotation;
}

function toRgba(pixmap: mupdf.Pixmap): Bitmap {
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const stride = pixmap.getStride();
  const rgb = pixmap.getPixels();
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    let from = y * stride;
    let to = y * width * 4;
    for (let x = 0; x < width; x++) {
      pixels[to++] = rgb[from++]!;
      pixels[to++] = rgb[from++]!;
      pixels[to++] = rgb[from++]!;
      pixels[to++] = 255;
    }
  }
  return { width, height, pixels };
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
