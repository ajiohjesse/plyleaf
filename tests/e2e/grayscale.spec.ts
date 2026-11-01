// Grayscale PDF: colour pages in, grey pages out, text still text, checked with qpdf.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, type FileSpec } from "../helpers/files";
import { imagesPdf } from "../helpers/images";
import { A4, makePdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "grey-canary-q1b";

/** The largest difference between a pixel's red, green and blue on a page. */
function colourfulness(doc: mupdf.Document, index: number) {
  const pixmap = doc.loadPage(index).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const pixels = pixmap.getPixels();
  let most = 0;
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    most = Math.max(
      most,
      Math.max(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) - Math.min(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!),
    );
  }
  pixmap.destroy();
  return most;
}

test("makes every page grey, without sending the file anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  const merged = new mupdf.PDFDocument(makePdf([A4]));
  merged.graftPage(-1, new mupdf.PDFDocument(imagesPdf().bytes), 0);
  const bytes = merged.saveToBuffer("compress").asUint8Array().slice();
  const file: FileSpec = { name: `${SECRET}-flyer.pdf`, mimeType: "application/pdf", bytes: Array.from(bytes) };

  await page.goto("/grayscale-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(file));
  await page.getByRole("button", { name: "Convert to grayscale" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  await expect(page.getByText("2 pages in shades of grey")).toBeVisible();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe(`${SECRET}-flyer-grayscale.pdf`);
  const output = new Uint8Array(await readFile((await saved.path())!));
  const doc = mupdf.Document.openDocument(output, "application/pdf");
  expect(colourfulness(doc, 0)).toBeLessThanOrEqual(2);
  expect(colourfulness(doc, 1)).toBeLessThanOrEqual(2);
  expect(doc.loadPage(0).toStructuredText("").asText()).toContain("Page 1");
  expect(await qpdfCheck(output)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Grayscale PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/grayscale-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Grayscale PDF" })).toBeVisible();
});
