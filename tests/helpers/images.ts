// Builds small images for tests with MuPDF (JPEG, PNG) or by hand (TIFF, EXIF), licence-clean like tests/helpers/pdf.ts.
// Each picture is white with its top-left quadrant red, so a render shows which way up it is.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as mupdf from "mupdf";

/** The RGB pixels of a `width` × `height` picture with a red top-left quadrant. */
function picture(width: number, height: number) {
  const pixels = new Uint8Array(width * height * 3).fill(255);
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width / 2; x++) {
      const i = (y * width + x) * 3;
      pixels[i + 1] = 0;
      pixels[i + 2] = 0;
    }
  }
  return pixels;
}

function pixmapOf(width: number, height: number) {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
  const rgb = picture(width, height);
  const target = pixmap.getPixels();
  const stride = pixmap.getStride();
  for (let y = 0; y < height; y++) target.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * stride);
  return pixmap;
}

/**
 * A JPEG, optionally with an EXIF orientation (6 = shown turned 90° clockwise) and a resolution in its JFIF header.
 * The pixels are stored as given; a reader applying the orientation shows them turned.
 */
export function makeJpeg(
  width: number,
  height: number,
  options: { orientation?: number; dpi?: number } = {},
): Uint8Array<ArrayBuffer> {
  const pixmap = pixmapOf(width, height);
  if (options.dpi) pixmap.setResolution(options.dpi, options.dpi);
  const jpeg = pixmap.asJPEG(90).slice();
  pixmap.destroy();
  if (!options.orientation) return new Uint8Array(jpeg);
  // A big-endian TIFF block with one IFD entry: Orientation (0x0112), SHORT, 1 value.
  const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, options.orientation, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, 0, 0, 0, 0];
  const app1 = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  return new Uint8Array([0xff, 0xd8, ...app1, ...jpeg.subarray(2)]);
}

export function makePng(width: number, height: number): Uint8Array<ArrayBuffer> {
  const pixmap = pixmapOf(width, height);
  const png = new Uint8Array(pixmap.asPNG());
  pixmap.destroy();
  return png;
}

/** An uncompressed RGB TIFF with a page per size given. */
export function makeTiff(frames: { width: number; height: number }[]): Uint8Array<ArrayBuffer> {
  const parts: number[] = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0];
  const u16 = (n: number) => [n & 255, n >> 8];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
  frames.forEach(({ width, height }, index) => {
    const ifdAt = parts.length;
    const entries = 9;
    const ifdSize = 2 + entries * 12 + 4;
    const bitsAt = ifdAt + ifdSize;
    const dataAt = bitsAt + 6;
    const pixels = picture(width, height);
    const nextAt = index === frames.length - 1 ? 0 : dataAt + pixels.length;
    const entry = (tag: number, type: number, count: number, value: number[]) => [
      ...u16(tag),
      ...u16(type),
      ...u32(count),
      ...value,
      ...Array(4 - value.length).fill(0),
    ];
    parts.push(
      ...u16(entries),
      ...entry(256, 3, 1, u16(width)),
      ...entry(257, 3, 1, u16(height)),
      ...entry(258, 3, 3, u32(bitsAt)),
      ...entry(259, 3, 1, u16(1)),
      ...entry(262, 3, 1, u16(2)),
      ...entry(273, 4, 1, u32(dataAt)),
      ...entry(277, 3, 1, u16(3)),
      ...entry(278, 3, 1, u16(height)),
      ...entry(279, 4, 1, u32(pixels.length)),
      ...u32(nextAt),
      ...u16(8),
      ...u16(8),
      ...u16(8),
      ...pixels,
    );
  });
  return new Uint8Array(parts);
}

/** A committed fixture from tests/fixtures (made by tests/fixtures/make-images.ts). */
export function fixture(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(join(import.meta.dirname, "..", "fixtures", name)));
}
