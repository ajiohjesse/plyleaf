// PDF to images: pages out as JPG, PNG or WebP at a chosen resolution, one image or a zip of several.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import { A4, LETTER } from "../helpers/pdf";

const SECRET = "toimages-canary-r2c";

async function openTool(page: Page, pages = [A4, LETTER, { ...A4, rotate: 90 as const }]) {
  await page.goto("/pdf-to-jpg");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}-report.pdf`, pages)));
  await expect(page.getByRole("button", { name: "Convert to images" })).toBeEnabled();
}

async function download(page: Page) {
  await page.getByRole("button", { name: "Convert to images" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  return { name: saved.suggestedFilename(), bytes: new Uint8Array(await readFile((await saved.path())!)) };
}

/** Width, height and resolution of an image MuPDF can read. */
function describeImage(bytes: Uint8Array) {
  const image = new mupdf.Image(bytes);
  const info = [image.getWidth(), image.getHeight(), image.getXResolution()];
  image.destroy();
  return info;
}

test("saves every page as a JPG in a zip, without sending the file anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page);
  await expect(page.getByText("The first page will be 1240 × 1755 pixels.")).toBeVisible();
  await expect(page.getByText("3 images, downloaded as one zip")).toBeVisible();
  const { name, bytes } = await download(page);
  expect(name).toBe(`${SECRET}-report-images.zip`);
  const files = unzipSync(bytes);
  expect(Object.keys(files)).toEqual([
    `${SECRET}-report-page-1.jpg`,
    `${SECRET}-report-page-2.jpg`,
    `${SECRET}-report-page-3.jpg`,
  ]);
  const sizes = Object.values(files).map(describeImage);
  // 150 dpi; the rotated page comes out landscape.
  expect(sizes).toEqual([
    [1240, 1755, 150],
    [1275, 1650, 150],
    [1755, 1240, 150],
  ]);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("one page as a PNG at 300 dpi downloads as the image itself", async ({ page }) => {
  await openTool(page);
  await page.getByText("PNG", { exact: true }).click();
  await page.getByLabel("Resolution").selectOption("300");
  await page.getByText("Some pages", { exact: true }).click();
  await page.getByLabel("Pages to convert").fill("2");
  await expect(page.getByText("The image will be 2550 × 3300 pixels.")).toBeVisible();
  await expect(page.getByText("1 image", { exact: true })).toBeVisible();
  const { name, bytes } = await download(page);
  expect(name).toBe(`${SECRET}-report-page-2.png`);
  expect(Array.from(bytes.subarray(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  expect(describeImage(bytes)).toEqual([2550, 3300, 300]);
});

test("makes WebP images where the browser can, and says so where it can't", async ({ page }) => {
  await openTool(page, [A4, A4]);
  await page.getByText("WebP", { exact: true }).click();
  await page.getByLabel("Resolution").selectOption("72");
  const canEncode = await page.evaluate(() =>
    document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp"),
  );
  if (!canEncode) {
    await expect(page.getByText("This browser can't make WebP images.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Convert to images" })).toBeDisabled();
    return;
  }
  const { bytes } = await download(page);
  const files = unzipSync(bytes);
  for (const image of Object.values(files)) {
    expect(new TextDecoder().decode(image.subarray(8, 12))).toBe("WEBP");
  }
  expect(Object.keys(files)).toEqual([`${SECRET}-report-page-1.webp`, `${SECRET}-report-page-2.webp`]);
});

test("says what's wrong with typed pages", async ({ page }) => {
  await openTool(page);
  await page.getByText("Some pages", { exact: true }).click();
  await expect(page.getByText("Type the pages to convert, like 1-3, 5.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Convert to images" })).toBeDisabled();
  await page.getByLabel("Pages to convert").fill("2-9");
  await expect(page.getByLabel("Pages to convert")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Pages to convert").fill("3, 1");
  await expect(page.getByText("2 pages of 3.")).toBeVisible();
  const files = unzipSync((await download(page)).bytes);
  expect(Object.keys(files)).toEqual([`${SECRET}-report-page-1.jpg`, `${SECRET}-report-page-3.jpg`]);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /PDF to images/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/pdf-to-jpg$/);
  await expect(page.getByRole("heading", { level: 1, name: "PDF to images" })).toBeVisible();
});
