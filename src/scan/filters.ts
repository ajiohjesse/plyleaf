// How a scanned page looks: as photographed, in grey, or black and white like a photocopy. Pure, on greyscale pixels,
// so the engine applies it after straightening and it's unit-tested in Node.

export type ScanFilter = "colour" | "grey" | "bw";

/**
 * Black and white with an adaptive threshold (Bradley's method): a pixel is black when it's darker than the average
 * around it by more than `contrast`, so shadows and uneven light across the page don't turn into black patches.
 * `grey` is one byte per pixel, rows `stride` bytes apart; it's changed in place.
 */
export function blackAndWhite(
  grey: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  stride = width,
  contrast = 0.12,
) {
  // A summed-area table makes each window's average one lookup.
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += grey[y * stride + x]!;
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1]! + row;
    }
  }
  const r = Math.max(4, Math.round(Math.max(width, height) / 32));
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const total =
        sums[y1 * (width + 1) + x1]! -
        sums[y0 * (width + 1) + x1]! -
        sums[y1 * (width + 1) + x0]! +
        sums[y0 * (width + 1) + x0]!;
      const mean = total / ((x1 - x0) * (y1 - y0));
      const i = y * stride + x;
      grey[i] = grey[i]! < mean * (1 - contrast) ? 0 : 255;
    }
  }
}
