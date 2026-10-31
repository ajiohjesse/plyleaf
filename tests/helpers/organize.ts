// Shared steps for the page-level Organize tools' E2E tests: a PDF whose pages can be told apart by width, opening a
// tool page, the board, and reading a downloaded PDF back with MuPDF.
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import * as mupdf from "mupdf";

/** `count` pages, each a different width (300, 310, 320…), so output pages can be told apart by size. */
export const numbered = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ width: 300 + i * 10, height: 500 }));
/** The widths of these 1-based source pages in a `numbered` PDF. */
export const widthsOf = (...pages: number[]) => pages.map((page) => 300 + (page - 1) * 10);

export async function openTool(page: Page, slug: string) {
  await page.goto(`/${slug}`);
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
}

/** The pages on the board, as list items. */
export const boardPages = (page: Page) => page.getByRole("list", { name: /^Pages of / }).getByRole("listitem");

/** The page toggle at a 1-based position on the board. */
export const pageButton = (page: Page, position: number) =>
  page.getByRole("button", { name: new RegExp(`^Page ${position}(,|$)`) });

/** Waits until every page on the board (all near the viewport, for small files) has rendered. */
export async function boardRendered(page: Page, count: number) {
  await expect(boardPages(page)).toHaveCount(count);
  await expect(boardPages(page).locator('canvas[data-state="ready"]')).toHaveCount(count);
}

export interface PdfPage {
  width: number;
  height: number;
  /** The page's /Rotate. */
  rotate: number;
}

/** Opens a PDF with MuPDF and lists each page's displayed size and /Rotate. */
export function readPages(bytes: Uint8Array): PdfPage[] {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf") as mupdf.PDFDocument;
  const pages = Array.from({ length: doc.countPages() }, (_, i) => {
    const page = doc.loadPage(i) as mupdf.PDFPage;
    const [x0, y0, x1, y1] = page.getBounds();
    const rotate = page.getObject().getInheritable("Rotate");
    return {
      width: Math.round(x1 - x0),
      height: Math.round(y1 - y0),
      rotate: rotate.isNumber() ? rotate.asNumber() : 0,
    };
  });
  doc.destroy();
  return pages;
}

/** Clicks Download on the done screen and returns the file's name and bytes. */
export async function download(page: Page) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  return { name: file.suggestedFilename(), bytes: new Uint8Array(await readFile((await file.path())!)) };
}
