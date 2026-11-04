/** Tesseract reads best at about 300 pixels per inch. */
export const OCR_DPI = 300;

/** The longest side a page is rendered at for reading, in pixels: enough for a poster's text, not a huge bitmap. */
export const OCR_MAX_SIDE = 5000;

/** The resolution a page is read at: 300 dpi, or less for a page so big that would pass OCR_MAX_SIDE. */
export function ocrResolution(page: { width: number; height: number }): number {
  const longest = Math.max(page.width, page.height);
  return Math.max(36, Math.min(OCR_DPI, Math.floor((OCR_MAX_SIDE * 72) / longest)));
}
