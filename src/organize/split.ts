// Split PDF: what the parts are called and how several of them become one download.
import { zipSync } from "fflate";
import { outputName } from "~/download/download";
import type { PageRange } from "./ranges";

/**
 * A file name for each part, from the source's name and the part's pages: "report.pdf" and pages 1–3 make
 * "report-pages-1-3.pdf". Ranges typed twice get "-2", "-3"… so no two parts share a name in the zip.
 */
export function partNames(source: string, ranges: readonly PageRange[]): string[] {
  const seen = new Map<string, number>();
  return ranges.map(({ first, last }) => {
    const pages = first === last ? `page-${first}` : `pages-${first}-${last}`;
    const count = (seen.get(pages) ?? 0) + 1;
    seen.set(pages, count);
    return outputName(source, count === 1 ? pages : `${pages}-${count}`);
  });
}

/**
 * Packs files into a zip. PDFs are compressed inside already, so they're stored as they are: that keeps zipping fast
 * (it only computes checksums) and runs on the main thread without fflate's worker, which would start from a blob: URL.
 */
export function zipFiles(files: readonly { name: string; bytes: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const zipped = zipSync(Object.fromEntries(files.map(({ name, bytes }) => [name, [bytes, { level: 0 }]])));
  return zipped as Uint8Array<ArrayBuffer>;
}
