// Images the user adds in the editor: which files can go into the PDF as they are, and how big they start.

/** The EXIF orientation a JPEG asks to be shown with (1 = as stored), or 1 when it doesn't say. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1]!;
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    // Start of scan: the headers are over.
    if (marker === 0xda) return 1;
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === "Exif") {
      return tiffOrientation(bytes.subarray(at + 10, at + 2 + length));
    }
    at += 2 + length;
  }
  return 1;
}

function tiffOrientation(tiff: Uint8Array): number {
  const little = tiff[0] === 0x49;
  const u16 = (i: number) => (little ? tiff[i]! | (tiff[i + 1]! << 8) : (tiff[i]! << 8) | tiff[i + 1]!);
  const u32 = (i: number) => (little ? u16(i) + u16(i + 2) * 65536 : u16(i) * 65536 + u16(i + 2));
  const ifd = u32(4);
  const count = u16(ifd);
  for (let entry = 0; entry < count; entry++) {
    const at = ifd + 2 + entry * 12;
    if (at + 12 > tiff.length) break;
    if (u16(at) === 0x0112) return u16(at + 8);
  }
  return 1;
}

/**
 * Whether an image can go into the PDF byte for byte: a PNG, or a JPEG shown as it's stored (PDF readers ignore EXIF
 * orientation). Anything else is redrawn by the browser first.
 */
export function usableAsIs(bytes: Uint8Array): "jpeg" | "png" | null {
  const at = (signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (at([0x89, 0x50, 0x4e, 0x47])) return "png";
  if (at([0xff, 0xd8, 0xff]) && jpegOrientation(bytes) <= 1) return "jpeg";
  return null;
}

/**
 * The size, in points, an image starts at on a page: its own size at 96 pixels per inch, made smaller (keeping its
 * shape) to fit half the page's width and height.
 */
export function startingSize(image: { width: number; height: number }, page: { width: number; height: number }) {
  const width = image.width * 0.75;
  const height = image.height * 0.75;
  const scale = Math.min(1, (page.width * 0.5) / width, (page.height * 0.5) / height);
  return { width: width * scale, height: height * scale };
}
