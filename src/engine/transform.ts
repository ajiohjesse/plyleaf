// Optimize & secure: one operation that copies an open document, changes the copy and saves it. Working on a copy keeps
// the open document as the user gave it, so going back and choosing differently starts from the original.
import * as mupdf from "mupdf";
import { message, pageImages, toDisplayColours } from "./ops";
import type { CompressLevel, TransformOptions } from "./types";

/** Image settings per Compress level: the resolution images are brought down to (for their page) and JPEG quality. */
const IMAGE_LEVELS: Record<Exclude<CompressLevel, "low">, { dpi: number; quality: number }> = {
  recommended: { dpi: 150, quality: 70 },
  extreme: { dpi: 96, quality: 45 },
};

/** Images smaller than this many pixels aren't worth re-encoding. */
const SMALL_IMAGE = 64 * 64;

export function transform(pdf: mupdf.PDFDocument, options: TransformOptions): Uint8Array<ArrayBuffer> {
  const copy = copyOf(pdf);
  try {
    if (options.compress && options.compress !== "low") recompressImages(copy, IMAGE_LEVELS[options.compress]);
    const save = ["garbage=deduplicate", "compress", "encrypt=keep"];
    if (options.compress) save.push("compress-fonts", "compress-images", "objstms");
    return saved(copy, save.join(","));
  } finally {
    copy.destroy();
  }
}

/** A separate copy of an open document, encryption and all. */
function copyOf(pdf: mupdf.PDFDocument): mupdf.PDFDocument {
  const buffer = pdf.saveToBuffer("encrypt=keep");
  try {
    return new mupdf.PDFDocument(buffer.asUint8Array().slice());
  } finally {
    buffer.destroy();
  }
}

function saved(pdf: mupdf.PDFDocument, options: string): Uint8Array<ArrayBuffer> {
  const buffer = pdf.saveToBuffer(options);
  try {
    return buffer.asUint8Array().slice();
  } finally {
    buffer.destroy();
  }
}

/**
 * Brings each image down to what its page can show at `dpi` (an image is rarely bigger than the page it's on) and
 * re-encodes it as JPEG, keeping the new version only when it's clearly smaller. Soft masks stay as they are (they may
 * be a different size from their image). 1-bit images (fax, JBIG2) are already as small as they get.
 */
function recompressImages(pdf: mupdf.PDFDocument, { dpi, quality }: { dpi: number; quality: number }) {
  const done = new Set<number>();
  for (let index = 0; index < pdf.countPages(); index++) {
    const page = pdf.loadPage(index);
    const [x0, y0, x1, y1] = page.getBounds();
    page.destroy();
    const maxSide = (Math.max(x1 - x0, y1 - y0) / 72) * dpi;
    for (const { id, ref } of pageImages(pdf, index)) {
      if (done.has(id)) continue;
      done.add(id);
      try {
        recompressImage(pdf, ref, maxSide, quality);
      } catch (error) {
        // An image MuPDF can't decode stays as it is.
        console.warn(`Kept image ${id} as it was: ${message(error)}`);
      }
    }
  }
}

function recompressImage(pdf: mupdf.PDFDocument, ref: mupdf.PDFObject, maxSide: number, quality: number) {
  const object = ref.resolve();
  const width = object.get("Width").asNumber();
  const height = object.get("Height").asNumber();
  const bits = object.get("BitsPerComponent");
  if (width * height < SMALL_IMAGE || (bits.isNumber() && bits.asNumber() === 1)) return;
  const filter = object.get("Filter").toString();
  if (/JBIG2Decode|CCITTFaxDecode/.test(filter)) return;

  const image = pdf.loadImage(ref);
  const pixmaps: mupdf.Pixmap[] = [];
  try {
    const decoded = image.toPixmap();
    pixmaps.push(decoded);
    const colours = toDisplayColours(decoded);
    if (colours !== decoded) pixmaps.push(colours);
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const sized = scale < 1 ? resized(colours, Math.round(width * scale), Math.round(height * scale)) : colours;
    if (sized !== colours) pixmaps.push(sized);
    const jpeg = sized.asJPEG(quality);
    if (jpeg.length > ref.readRawStream().getLength() * 0.9) return;
    replaceImage(pdf, ref, new mupdf.Image(jpeg.slice()));
  } finally {
    for (const pixmap of pixmaps) pixmap.destroy();
    image.destroy();
  }
}

/** `pixmap` drawn smaller (MuPDF scales down smoothly), without alpha. */
function resized(pixmap: mupdf.Pixmap, width: number, height: number): mupdf.Pixmap {
  const out = new mupdf.Pixmap(pixmap.getColorSpace()!, [0, 0, Math.max(1, width), Math.max(1, height)], false);
  out.clear(255);
  const source = new mupdf.Image(pixmap);
  const device = new mupdf.DrawDevice(mupdf.Matrix.identity, out);
  try {
    device.fillImage(source, [out.getWidth(), 0, 0, out.getHeight(), 0, 0], 1);
    device.close();
  } finally {
    device.destroy();
    source.destroy();
  }
  return out;
}

/**
 * Puts `image`'s data and description in place of the image at `ref`, so every page and form that uses it gets the new
 * one. Its soft mask and other entries stay; colour-key masks and decode arrays (already applied) go.
 */
export function replaceImage(pdf: mupdf.PDFDocument, ref: mupdf.PDFObject, image: mupdf.Image) {
  const fresh = pdf.addImage(image);
  try {
    const target = ref.resolve();
    const source = fresh.resolve();
    for (const key of ["Filter", "DecodeParms", "Width", "Height", "ColorSpace", "BitsPerComponent", "Decode"]) {
      const value = source.get(key);
      if (value.isNull()) target.delete(key);
      else target.put(key, value);
    }
    if (target.get("Mask").isArray()) target.delete("Mask");
    ref.writeRawStream(fresh.readRawStream());
  } finally {
    pdf.deleteObject(fresh);
    image.destroy();
  }
}
