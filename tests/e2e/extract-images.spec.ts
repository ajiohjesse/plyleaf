// Extract images: every image a PDF draws, once each, JPEGs byte for byte and the rest as PNG.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile, type FileSpec } from "../helpers/files";
import { imagesPdf } from "../helpers/images";

const SECRET = "extract-canary-t4m";
const { bytes, jpeg } = imagesPdf();
const withImages: FileSpec = { name: `${SECRET}-brochure.pdf`, mimeType: "application/pdf", bytes: Array.from(bytes) };

async function openTool(page: Page, file: FileSpec) {
  await page.goto("/extract-images");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(file));
  await expect(page.getByRole("button", { name: "Extract images" })).toBeEnabled();
}

async function download(page: Page) {
  await page.getByRole("button", { name: "Extract images" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  return { name: saved.suggestedFilename(), bytes: new Uint8Array(await readFile((await saved.path())!)) };
}

test("extracts every image once, without sending the file anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page, withImages);
  await page.getByLabel("Leave out tiny images").uncheck();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-brochure-images.zip`);
  await expect(page.getByText("4 images in one zip file")).toBeVisible();
  const files = unzipSync(result.bytes);
  expect(Object.keys(files)).toEqual([
    `${SECRET}-brochure-page-1-image-1.jpg`,
    `${SECRET}-brochure-page-1-image-2.png`,
    `${SECRET}-brochure-page-1-image-3.png`,
    `${SECRET}-brochure-page-2-image-1.png`,
  ]);
  // The JPEG is the one in the PDF, byte for byte.
  expect(Array.from(Object.values(files)[0]!)).toEqual(Array.from(jpeg));
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("leaves out tiny images by default; one image downloads as itself", async ({ page }) => {
  await openTool(page, withImages);
  await expect(page.getByLabel("Leave out tiny images")).toBeChecked();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-brochure-page-1-image-1.jpg`);
  expect(Array.from(result.bytes)).toEqual(Array.from(jpeg));
  // Back, and the option is as it was.
  await page.getByRole("button", { name: "Back to your file" }).click();
  await expect(page.getByRole("button", { name: "Extract images" })).toBeFocused();
});

test("says so when a PDF has no images", async ({ page }) => {
  await openTool(page, pdfFile("text-only.pdf"));
  await page.getByRole("button", { name: "Extract images" }).click();
  await expect(page.getByRole("status").filter({ hasText: "No images found in text-only.pdf" })).toBeVisible();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Extract images/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/extract-images$/);
  await expect(page.getByRole("heading", { level: 1, name: "Extract images" })).toBeVisible();
});
