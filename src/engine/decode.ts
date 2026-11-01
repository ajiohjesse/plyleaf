// Images MuPDF can't decode (WebP, AVIF, and HEIC in Safari) are decoded by the browser, on the page: workers can't
// count on a canvas (no OffscreenCanvas before Safari 16.4). The pixels then go to the worker. HEIC the browser can't
// decode goes to the worker as it is, for libheif. No MuPDF here, so the page can import it.
import { EngineError } from "./errors";
import type { Bitmap } from "./types";

const heifBrands = ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"];

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/**
 * The MIME type MuPDF decodes an image as, from its first bytes, or null for images it can't decode itself (WebP,
 * AVIF, HEIC).
 */
export function mupdfImageType(head: Uint8Array): string | null {
  const at = (signature: number[]) => signature.every((byte, i) => head[i] === byte);
  if (at([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (at([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (at([0x49, 0x49, 0x2a, 0]) || at([0x4d, 0x4d, 0, 0x2a])) return "image/tiff";
  return null;
}

/** A HEIF file that isn't AVIF (our libheif has an HEVC decoder only). */
export function isHeif(head: Uint8Array): boolean {
  return ascii(head, 4, 4) === "ftyp" && heifBrands.includes(ascii(head, 8, 4));
}

/** Whether the image was stored lossily, so storing it as JPEG loses nothing it hadn't already. */
export function isLossy(head: Uint8Array): boolean {
  // A lossless WebP has a VP8L chunk (straight after the header, or after VP8X's 10 bytes of flags).
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") {
    return !ascii(head, 12, 64).includes("VP8L");
  }
  return true;
}

/** Decodes an image with the browser (EXIF orientation applied) to RGBA. */
async function decodeInBrowser(bytes: Uint8Array): Promise<Bitmap> {
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  try {
    const { width, height } = bitmap;
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d", { willReadFrequently: true }) as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) throw new Error("No 2D canvas");
    context.drawImage(bitmap, 0, 0);
    return { width, height, pixels: context.getImageData(0, 0, width, height).data };
  } finally {
    bitmap.close();
  }
}

/**
 * Decodes an image the engine can't take as it is (WebP, AVIF, HEIC). Null when the engine can take the bytes: a PDF,
 * an image MuPDF decodes, or HEIC the browser can't decode (the worker has libheif for it).
 */
export async function decodeForEngine(bytes: Uint8Array): Promise<{ bitmap: Bitmap; lossy: boolean } | null> {
  const webp = ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
  // AVIF and HEIC both start with an ftyp box.
  if (!webp && ascii(bytes, 4, 4) !== "ftyp") return null;
  try {
    return { bitmap: await decodeInBrowser(bytes), lossy: isLossy(bytes) };
  } catch (error) {
    if (isHeif(bytes)) return null;
    throw new EngineError(
      "invalid-image",
      `This browser can't decode the image: ${error instanceof Error ? error.message : error}`,
    );
  }
}
