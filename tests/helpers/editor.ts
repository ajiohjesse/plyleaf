// Shared steps for the editor's E2E tests: open a PDF in it, press a page at a point given in PDF points, save, and
// read text back from the downloaded file with MuPDF.
import { expect, type Locator, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { asPayload, pdfFile } from "./files";
import { download } from "./organize";
import type { TestPage } from "./pdf";

/**
 * Opens `slug` and the PDF `name` (made of `pages`, or these bytes) in its editor, and waits for the first page to
 * show.
 */
export async function openInEditor(page: Page, slug: string, name: string, pages: TestPage[] | Uint8Array) {
  await page.goto(`/${slug}`);
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  const file = Array.isArray(pages)
    ? asPayload(pdfFile(name, pages))
    : { name, mimeType: "application/pdf", buffer: Buffer.from(pages) };
  await page.getByLabel("Choose a file").setInputFiles(file);
  await expect(editorPage(page, 0).locator('canvas[data-state="ready"]')).toHaveCount(1);
}

/** The editor's page at a 0-based index. */
export const editorPage = (page: Page, index: number): Locator =>
  page.getByRole("list", { name: "Pages" }).getByRole("listitem").nth(index);

/** Clicks page `index` at (x, y) PDF points from its top-left, `widthPt` being the page's width in points. */
export async function clickAt(page: Page, index: number, x: number, y: number, widthPt: number) {
  const { x: left, y: top } = await pointOnScreen(page, index, x, y, widthPt);
  await page.mouse.click(left, top);
}

/** Where (x, y) points on page `index` are in the viewport, scrolling it into the middle of the screen first. */
export async function pointOnScreen(page: Page, index: number, x: number, y: number, widthPt: number) {
  const target = editorPage(page, index);
  let box = (await target.boundingBox())!;
  const scale = box.width / widthPt;
  await page.evaluate((offset) => window.scrollBy(0, offset), box.y + y * scale - page.viewportSize()!.height / 2);
  box = (await target.boundingBox())!;
  return { x: box.x + x * scale, y: box.y + y * scale, scale };
}

/** Saves the edits and downloads the file from the done screen. */
export async function saveEdits(page: Page) {
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  return download(page);
}

export interface TextLine {
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  font: { name: string; size: number };
}

/** Each line of text MuPDF finds on a page, in points from the top-left of the page as shown. */
export function textLines(bytes: Uint8Array, index: number): TextLine[] {
  const doc = new mupdf.PDFDocument(bytes);
  const page = doc.loadPage(index);
  const json = JSON.parse(page.toStructuredText("").asJSON()) as { blocks: { lines?: TextLine[] }[] };
  page.destroy();
  doc.destroy();
  return json.blocks.flatMap((block) => block.lines ?? []);
}
