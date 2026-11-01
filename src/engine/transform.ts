// Optimize & secure: one operation that copies an open document, changes the copy and saves it. Working on a copy keeps
// the open document as the user gave it, so going back and choosing differently starts from the original.
import * as mupdf from "mupdf";
import { message, pageImages, toDisplayColours, unlockedWith } from "./ops";
import { EngineError } from "./errors";
import type { CompressLevel, Metadata, MetadataField, Permission, Security, TransformOptions } from "./types";

/** Image settings per Compress level: the resolution images are brought down to (for their page) and JPEG quality. */
const IMAGE_LEVELS: Record<Exclude<CompressLevel, "low">, { dpi: number; quality: number }> = {
  recommended: { dpi: 150, quality: 70 },
  extreme: { dpi: 96, quality: 45 },
};

/** Images smaller than this many pixels aren't worth re-encoding. */
const SMALL_IMAGE = 64 * 64;

/** `password` is the one that opened `pdf`, if it needed one: the copies are reopened with it. */
export function transform(
  pdf: mupdf.PDFDocument,
  options: TransformOptions,
  password?: string,
): Uint8Array<ArrayBuffer> {
  const copy = copyOf(pdf, password);
  try {
    // First, so form fields and annotations are greyed and compressed with the rest of the page.
    if (options.flatten) copy.bake(options.flatten === "all", true);
    if (options.metadata) changeMetadata(copy, options.metadata);
    if (options.grayscale) toGrey(copy);
    if (options.compress && options.compress !== "low") recompressImages(copy, IMAGE_LEVELS[options.compress]);
    const save = [
      "garbage=deduplicate",
      "compress",
      encryption(options.security, unlockedWith(pdf) === "user" ? password : undefined),
    ];
    if (options.compress) save.push("compress-fonts", "compress-images", "objstms");
    return repacked(saved(copy, "garbage,encrypt=keep"), save.join(","), password);
  } finally {
    copy.destroy();
  }
}

/** Sets or removes document information (see TransformOptions.metadata). */
function changeMetadata(pdf: mupdf.PDFDocument, change: { set: Metadata } | "remove") {
  const trailer = pdf.getTrailer();
  const root = trailer.get("Root");
  // The XMP copy would otherwise show the old values in readers that prefer it.
  root.delete("Metadata");
  if (change === "remove") {
    // Emptied as well as unlinked: MuPDF can write the trailer it opened with, Info and all.
    const info = trailer.get("Info");
    if (info.isDictionary()) {
      const keys: string[] = [];
      info.forEach((_, key) => keys.push(String(key)));
      for (const key of keys) info.delete(key);
    }
    trailer.delete("Info");
    root.delete("PieceInfo");
    for (let i = 0; i < pdf.countPages(); i++) {
      const page = pdf.findPage(i);
      page.delete("Metadata");
      page.delete("PieceInfo");
    }
    return;
  }
  for (const [field, value] of Object.entries(change.set) as [MetadataField, string][]) {
    if (value === "") {
      const info = trailer.get("Info");
      if (info.isDictionary()) info.delete(field);
    } else {
      pdf.setMetaData(`info:${field}`, value);
    }
  }
}

/** PDF permission bits (ISO 32000-2, table 22), counted from 1. */
const PERMISSION_BITS: Record<Permission, number> = {
  print: 3,
  edit: 4,
  copy: 5,
  annotate: 6,
  form: 9,
  accessibility: 10,
  assemble: 11,
  "print-hq": 12,
};

/** The /P value allowing `permissions`: the reserved bits set (7, 8, 13–32), 1–2 clear. */
export function permissionValue(permissions: readonly Permission[]): number {
  let value = -3904;
  for (const permission of permissions) value |= 1 << (PERMISSION_BITS[permission] - 1);
  return value;
}

/** The save option for `security`; `opening` is the user password that opened the document, if one did. */
function encryption(security: Security | undefined, opening: string | undefined): string {
  if (!security) return "encrypt=keep";
  if (security.encrypt === "none") return "encrypt=none";
  const {
    userPassword = security.keepUserPassword ? (opening ?? "") : "",
    permissions = Object.keys(PERMISSION_BITS) as Permission[],
  } = security;
  const ownerPassword = security.ownerPassword || randomPassword();
  for (const password of [userPassword, ownerPassword]) {
    if (password.includes(",")) throw new EngineError("invalid-argument", "Passwords can't contain a comma");
  }
  return [
    "encrypt=aes-256",
    `user-password=${userPassword}`,
    `owner-password=${ownerPassword}`,
    `permissions=${permissionValue(permissions)}`,
  ].join(",");
}

/** 128 random bits as hex: an owner password nobody knows, when the user doesn't set one. */
function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Saves a document again from scratch with `options`. Renumbering objects (garbage=compact or deduplicate) in the
 * document we changed loses streams in MuPDF 1.28 when we hold objects we looked at and then added streams, so changes
 * are saved without renumbering first and the final save is done on a freshly opened copy.
 */
function repacked(bytes: Uint8Array, options: string, password?: string): Uint8Array<ArrayBuffer> {
  const fresh = reopen(bytes, password);
  try {
    return saved(fresh, options);
  } finally {
    fresh.destroy();
  }
}

/** A separate copy of an open document, encryption and all, opened with the password that opened the original. */
function copyOf(pdf: mupdf.PDFDocument, password?: string): mupdf.PDFDocument {
  const buffer = pdf.saveToBuffer("encrypt=keep");
  try {
    return reopen(buffer.asUint8Array(), password);
  } finally {
    buffer.destroy();
  }
}

function reopen(bytes: Uint8Array, password?: string): mupdf.PDFDocument {
  const doc = new mupdf.PDFDocument(bytes.slice());
  if (doc.needsPassword() && (password === undefined || doc.authenticatePassword(password) === 0)) {
    doc.destroy();
    throw new EngineError("password-required", "The copy needs the password that opened the original");
  }
  return doc;
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

/**
 * Greyscale. Images are converted for real (JPEGs stay JPEG at quality 85, the rest lossless), which also makes the
 * file smaller. Text, drawings and shadings are greyed by painting black over each page with the Saturation blend
 * mode: it keeps each colour's luminosity and takes away its saturation, exactly a luminance greyscale, while text
 * stays text. Annotations (comments, form fields) keep their colours.
 */
function toGrey(pdf: mupdf.PDFDocument) {
  const done = new Set<number>();
  for (let index = 0; index < pdf.countPages(); index++) {
    for (const { id, ref } of pageImages(pdf, index)) {
      if (done.has(id)) continue;
      done.add(id);
      try {
        greyImage(pdf, ref);
      } catch (error) {
        console.warn(`Kept image ${id} as it was: ${message(error)}`);
      }
    }
    desaturatePage(pdf, pdf.findPage(index));
  }
}

function greyImage(pdf: mupdf.PDFDocument, ref: mupdf.PDFObject) {
  const object = ref.resolve();
  const bits = object.get("BitsPerComponent");
  if (bits.isNumber() && bits.asNumber() === 1) return;
  if (/JBIG2Decode|CCITTFaxDecode/.test(object.get("Filter").toString())) return;
  const image = pdf.loadImage(ref);
  const pixmaps: mupdf.Pixmap[] = [];
  try {
    if (image.getColorSpace()?.getType() === "Gray") return;
    const decoded = image.toPixmap();
    pixmaps.push(decoded);
    const grey = decoded.convertToColorSpace(mupdf.ColorSpace.DeviceGray, false);
    pixmaps.push(grey);
    const jpeg = /DCTDecode|JPXDecode/.test(object.get("Filter").toString());
    replaceImage(pdf, ref, jpeg ? new mupdf.Image(grey.asJPEG(85).slice()) : new mupdf.Image(grey));
  } finally {
    for (const pixmap of pixmaps) pixmap.destroy();
    image.destroy();
  }
}

/** Wraps the page's content in q/Q and paints black over it with the Saturation blend mode. */
function desaturatePage(pdf: mupdf.PDFDocument, page: mupdf.PDFObject) {
  // Resources inherited from the page tree are copied onto the page, so the blend mode is added for this page only.
  let resources = page.get("Resources");
  if (!resources.isDictionary()) {
    resources = pdf.newDictionary();
    const inherited = page.getInheritable("Resources");
    if (inherited.isDictionary()) inherited.forEach((value, key) => resources.put(key, value));
    page.put("Resources", resources);
  }
  let states = resources.get("ExtGState");
  if (!states.isDictionary()) {
    states = pdf.newDictionary();
    resources.put("ExtGState", states);
  }
  // Pages that share one resources dictionary share the blend mode too.
  let name = "PlyleafGrey";
  for (let n = 2; ; n++) {
    const existing = states.get(name);
    if (existing.isNull()) {
      states.put(name, pdf.addObject({ Type: "ExtGState", BM: "Saturation", ca: 1, CA: 1 }));
      break;
    }
    if (existing.get("BM").isName() && existing.get("BM").asName() === "Saturation") break;
    name = `PlyleafGrey${n}`;
  }

  const media = page.getInheritable("MediaBox");
  const box = [0, 1, 2, 3].map((i) => (media.isArray() ? media.get(i).asNumber() : [0, 0, 612, 792][i]!));
  const [x0, y0, x1, y1] = [
    Math.min(box[0]!, box[2]!),
    Math.min(box[1]!, box[3]!),
    Math.max(box[0]!, box[2]!),
    Math.max(box[1]!, box[3]!),
  ];
  const contents = page.get("Contents");
  const streams = contents.isArray()
    ? Array.from({ length: contents.length }, (_, i) => contents.get(i))
    : contents.isNull()
      ? []
      : [contents];
  const wrapped = pdf.newArray();
  wrapped.push(pdf.addStream("q\n", {}));
  for (const stream of streams) wrapped.push(stream);
  wrapped.push(pdf.addStream(`\nQ q /${name} gs 0 g ${x0} ${y0} ${x1 - x0} ${y1 - y0} re f Q\n`, {}));
  page.put("Contents", wrapped);
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
    // The temporary image object is no longer used; saving (always with garbage=) drops it.
    image.destroy();
  }
}
