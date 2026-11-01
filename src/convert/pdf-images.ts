// PDF to images: image sizes, file names and WebP encoding. Sizes and names are pure; the WebP helpers use a canvas.
import { outputName } from "~/download/download";
import { MAX_RENDER_SIDE, type Bitmap, type PageInfo } from "~/engine/types";

export type ImageFormat = "jpeg" | "png" | "webp";

export const EXTENSIONS: Record<ImageFormat, string> = { jpeg: "jpg", png: "png", webp: "webp" };
export const MIME_TYPES: Record<ImageFormat, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * A page's image size in pixels at `dpi`, scaled down (like the engine does) if a side would pass MAX_RENDER_SIDE.
 * Partial pixels count, as MuPDF rounds them up.
 */
export function imageSize(page: Pick<PageInfo, "width" | "height">, dpi: number) {
  const scale = Math.min(dpi / 72, MAX_RENDER_SIDE / page.width, MAX_RENDER_SIDE / page.height);
  const pixels = (points: number) => Math.max(1, Math.ceil(points * scale - 0.001));
  return {
    width: pixels(page.width),
    height: pixels(page.height),
    capped: scale < dpi / 72,
  };
}

/**
 * A name per page image: "report.pdf", page 3 of 12 as JPEG makes "report-page-03.jpg". Numbers are padded to the
 * same width so the files sort in page order.
 */
export function pageImageName(source: string, page: number, pageCount: number, format: ImageFormat): string {
  const number = String(page + 1).padStart(String(pageCount).length, "0");
  return outputName(source, `page-${number}`, EXTENSIONS[format]);
}

/** Whether this browser's canvas can encode WebP (Safari's can't, and quietly makes a PNG instead). */
export function canEncodeWebp(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = Object.assign(document.createElement("canvas"), { width: 1, height: 1 });
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

/** Encodes an RGBA bitmap as WebP with the browser's encoder; `quality` is 0–1. */
export async function encodeWebp({ width, height, pixels }: Bitmap, quality: number): Promise<Blob> {
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob || blob.type !== "image/webp") throw new Error("This browser can't make WebP images");
  return blob;
}
