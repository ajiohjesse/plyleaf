// Scan to PDF with the live camera. Only Chromium has a fake camera to test with; its launch flags need a file of
// their own.
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFile } from "node:fs/promises";
import { watchEgress } from "../helpers/egress";

test.skip(({ browserName }) => browserName !== "chromium", "Only Chromium has a fake camera to test with");
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("takes pages with the live camera, asking for it only when asked to", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [] });
  await page.goto("/scan-to-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector("video"))).toBeNull();
  await page.getByRole("button", { name: "Use camera" }).click();
  await expect(page.getByText("Fit the page in the frame, then take the photo.")).toBeVisible();
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByText("1 taken. Take the next page, or finish.")).toBeVisible();
  await page.getByRole("button", { name: "Take photo" }).click();
  const scanned = page.getByRole("list", { name: "Scanned pages" }).getByRole("listitem");
  await expect(scanned).toHaveCount(2);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("region", { name: "Camera" })).toHaveCount(0);
  await expect(scanned.locator('canvas[data-state="ready"]')).toHaveCount(2);

  await page.getByRole("button", { name: "Make PDF" }).click();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  const doc = mupdf.Document.openDocument(await readFile((await saved.path())!), "application/pdf");
  expect(doc.countPages()).toBe(2);
  expect(egress.problems()).toEqual([]);
});
