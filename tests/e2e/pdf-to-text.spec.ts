// PDF to text: a PDF's text out as a UTF-8 .txt file (or copied), with nothing sent anywhere.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, type FileSpec } from "../helpers/files";
import { photoPdf, textPdf } from "../helpers/pdf";

const SECRET = "pdftext-canary-m3x";

function twoPages(): Uint8Array {
  const doc = new mupdf.PDFDocument(textPdf(["First page, first line", "First page, second line"]));
  doc.graftPage(-1, new mupdf.PDFDocument(photoPdf(200, 300)), 0);
  doc.graftPage(-1, new mupdf.PDFDocument(textPdf(["Third page text"])), 0);
  return doc.saveToBuffer("compress").asUint8Array().slice();
}

const pdf = (name: string, bytes: Uint8Array): FileSpec => ({
  name,
  mimeType: "application/pdf",
  bytes: Array.from(bytes),
});

test("saves a PDF's text as a .txt file, without sending it anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/pdf-to-text");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdf(`${SECRET}-report.pdf`, twoPages())));
  await expect(page.getByLabel("Show where each page starts")).toBeChecked();
  await page.getByRole("button", { name: "Get the text" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  await expect(page.getByText("page 2 had no text (pictures only), so it's empty")).toBeVisible();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe(`${SECRET}-report.txt`);
  const text = await readFile((await saved.path())!, "utf8");
  expect(text).toBe(
    "--- Page 1 ---\n\nFirst page, first line\n\nFirst page, second line\n\n--- Page 2 ---\n\n--- Page 3 ---\n\nThird page text\n",
  );
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("runs pages on without markers, and copies the text", async ({ page, context, browserName }) => {
  await page.goto("/pdf-to-text");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdf("plain.pdf", textPdf(["Only line"]))));
  await page.getByLabel("Show where each page starts").uncheck();
  await page.getByRole("button", { name: "Get the text" }).click();
  await expect(page.getByText("Text from 1 page")).toBeVisible();
  // Only Chromium lets a test grant clipboard access.
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy text" }).click();
  await expect(page.getByText("Copied the text.")).toBeVisible();
  // Windows' clipboard stores line ends as \r\n.
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe("Only line\n");
});

test("says so when a PDF has no text at all", async ({ page }) => {
  await page.goto("/pdf-to-text");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdf("scan.pdf", photoPdf(200, 300))));
  await page.getByRole("button", { name: "Get the text" }).click();
  await expect(page.getByText(/scan\.pdf has no text to copy: its pages are pictures/)).toBeVisible();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /PDF to text/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/pdf-to-text$/);
  await expect(page.getByRole("heading", { level: 1, name: "PDF to text" })).toBeVisible();
});
