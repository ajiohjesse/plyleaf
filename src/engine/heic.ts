// HEIC/HEIF photos (what iPhones take) decoded with libheif (LGPL-3.0). Only Safari decodes them natively, so the
// worker comes here when the browser can't. The module embeds its 1.5 MB of WASM and is imported only when a HEIC
// file needs it.
import { EngineError } from "./errors";
import type { Bitmap } from "./types";

type Libheif = ReturnType<(typeof import("libheif-js/libheif-wasm/libheif-bundle.mjs"))["default"]>;
let loading: Promise<Libheif> | undefined;

/** Decodes the primary image of a HEIF file to RGBA, with its rotation and mirroring applied. */
export async function decodeHeic(bytes: Uint8Array): Promise<Bitmap> {
  loading ??= import("libheif-js/libheif-wasm/libheif-bundle.mjs").then((module) => module.default());
  const libheif = await loading;
  let images: ReturnType<InstanceType<Libheif["HeifDecoder"]>["decode"]>;
  try {
    images = new libheif.HeifDecoder().decode(bytes);
  } catch (error) {
    throw new EngineError(
      "invalid-image",
      `Not a readable HEIF image: ${error instanceof Error ? error.message : error}`,
    );
  }
  try {
    const image = images.find((candidate) => candidate.is_primary()) ?? images[0];
    if (!image) throw new EngineError("invalid-image", "This HEIF file has no images");
    const width = image.get_width();
    const height = image.get_height();
    const pixels = new Uint8ClampedArray(width * height * 4);
    const decoded = await new Promise<boolean>((resolve) =>
      image.display({ data: pixels, width, height }, (result) => resolve(result !== null)),
    );
    if (!decoded) throw new EngineError("invalid-image", "This HEIF image couldn't be decoded");
    return { width, height, pixels };
  } finally {
    for (const image of images) image.free();
  }
}
