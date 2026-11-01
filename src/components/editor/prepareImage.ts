import { usableAsIs } from "~/editor/images";

/** Pictures redrawn by the browser are kept to this many pixels on their longer side. */
const MAX_SIDE = 4000;

export interface PreparedImage {
  /** JPEG or PNG, as the engine takes them. */
  bytes: Uint8Array<ArrayBuffer>;
  /** Pixels, as shown (EXIF orientation applied). */
  width: number;
  height: number;
}

/**
 * Turns a picked image into a JPEG or PNG the PDF can hold: PNGs and upright JPEGs as they are, anything else (a
 * turned phone photo, WebP, GIF, AVIF, HEIC where the browser reads it) redrawn by the browser: as JPEG when it was a
 * JPEG, otherwise as PNG, which keeps transparency.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bitmap = await createImageBitmap(file);
  try {
    if (usableAsIs(bytes)) return { bytes, width: bitmap.width, height: bitmap.height };
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas");
    context.drawImage(bitmap, 0, 0, width, height);
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, jpeg ? "image/jpeg" : "image/png", 0.92),
    );
    if (!blob) throw new Error("The image couldn't be redrawn");
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
}
