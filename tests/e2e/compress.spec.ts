// Compress PDF: three levels, before and after sizes, and output that qpdf finds sound.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { asPayload, type FileSpec } from "../helpers/files";
import { A4, makePdf, photoPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "compress-canary-h5n";
const photos: FileSpec = { name: `${SECRET}-photos.pdf`, mimeType: "application/pdf", bytes: Array.from(photoPdf()) };

async function openTool(page: Page, file: FileSpec) {
  await page.goto("/compress-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(file));
  await expect(page.getByRole("button", { name: "Compress PDF" })).toBeEnabled();
}

async function download(page: Page) {
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  return { name: saved.suggestedFilename(), bytes: new Uint8Array(await readFile((await saved.path())!)) };
}

test("compresses with before and after sizes, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page, photos);
  await expect(page.getByLabel("Recommended")).toBeChecked();
  await page.getByRole("button", { name: "Compress PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  await expect(page.getByText(/\d+ KB → \d+ KB, \d+% smaller/)).toBeVisible();
  const recommended = await download(page);
  expect(recommended.name).toBe(`${SECRET}-photos-compressed.pdf`);
  expect(recommended.bytes.length).toBeLessThan(photos.bytes.length / 3);
  expect(await qpdfCheck(recommended.bytes)).toBe(0);

  // Back, stronger.
  await page.getByRole("button", { name: "Back to your file" }).click();
  await expect(page.getByRole("button", { name: "Compress PDF" })).toBeFocused();
  await expect(page.getByLabel("Recommended")).toBeChecked();
  await page.getByLabel("Extreme").check();
  await page.getByRole("button", { name: "Compress PDF" }).click();
  const extreme = await download(page);
  expect(extreme.bytes.length).toBeLessThan(recommended.bytes.length);
  expect(await qpdfCheck(extreme.bytes)).toBe(0);

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("says so when there's nothing to save, rather than give a file that's no smaller", async ({ page }) => {
  // Already saved the way Low saves.
  const packed = makePdf([A4], { save: "garbage=deduplicate,compress,compress-fonts,compress-images,objstms" });
  await openTool(page, { name: "letter.pdf", mimeType: "application/pdf", bytes: Array.from(packed) });
  await page.getByLabel("Low").check();
  await page.getByRole("button", { name: "Compress PDF" }).click();
  await expect(page.getByText("letter.pdf is already about as small as this level makes it.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Compress PDF" })).toBeEnabled();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Compress PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/compress-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Compress PDF" })).toBeVisible();
});
