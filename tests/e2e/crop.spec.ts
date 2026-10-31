// Crop PDF: set the crop by typing margins and by dragging the frame, crop all or some pages, and download.
// Every test that handles files also checks egress (D-020).
import { expect, test } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import { download, numbered, openTool, readPages } from "../helpers/organize";

const SECRET = "crop-canary-t1x";

test("crops every page to the margins typed, without sending the file anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page, "crop-pdf");
  const action = page.getByRole("button", { name: "Crop PDF" });
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, numbered(3))));
  await expect(page.locator('[data-crop-preview] canvas[data-state="ready"]')).toHaveCount(1);
  await expect(action).toBeDisabled();

  await page.getByLabel("Top").fill("10");
  await page.getByLabel("Left").fill("20");
  await expect(page.getByText("3 pages cropped to 80% × 90%")).toBeVisible();
  // The frame follows the margins.
  await expect(page.locator("[data-crop-frame]")).toHaveAttribute(
    "style",
    /left: 20%; top: 10%; width: 80%; height: 90%/,
  );

  // Another page shows the same frame.
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();

  await action.click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-cropped.pdf`);
  expect(readPages(result.bytes).map(({ width, height }) => [width, height])).toEqual([
    [240, 450],
    [248, 450],
    [256, 450],
  ]);

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("crops only the pages typed, to a frame dragged by its corner", async ({ page }) => {
  await openTool(page, "crop-pdf");
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("three.pdf", numbered(3))));
  const preview = page.locator("[data-crop-preview]");
  await expect(preview.locator('canvas[data-state="ready"]')).toHaveCount(1);
  await preview.evaluate((element) => element.scrollIntoView({ block: "center" }));

  // Drag the top-left handle a quarter of the way in, each way. (The bottom ones can be under the sticky action bar.)
  const box = (await preview.boundingBox())!;
  const grip = (await page.locator('[data-grip="nw"]').boundingBox())!;
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + box.width / 4, start.y + box.height / 4, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel("Left")).toHaveValue(/^2[4-6](\.\d)?$/);
  await expect(page.getByLabel("Top")).toHaveValue(/^2[4-6](\.\d)?$/);

  await page.getByRole("radio", { name: /Some pages/ }).check();
  await expect(page.getByRole("button", { name: "Crop PDF" })).toBeDisabled();
  await page.getByLabel("Pages to crop").fill("2");
  await expect(page.getByText("1 page of 3.")).toBeVisible();
  await page.getByRole("button", { name: "Crop PDF" }).click();
  const [first, second, third] = readPages((await download(page)).bytes);
  expect(first).toMatchObject({ width: 300, height: 500 });
  expect(third).toMatchObject({ width: 320, height: 500 });
  expect(second!.width).toBeGreaterThan(310 * 0.73);
  expect(second!.width).toBeLessThan(310 * 0.77);
  expect(second!.height).toBeGreaterThan(500 * 0.73);
  expect(second!.height).toBeLessThan(500 * 0.77);
});

test("explains margins that leave too little, and resets", async ({ page }) => {
  await openTool(page, "crop-pdf");
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("one.pdf", numbered(1))));
  await expect(page.locator('[data-crop-preview] canvas[data-state="ready"]')).toHaveCount(1);
  await page.getByLabel("Top").fill("60");
  await page.getByLabel("Bottom").fill("40");
  await expect(page.getByText("That leaves too little of the page.")).toBeVisible();
  await expect(page.getByLabel("Bottom")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Bottom").fill("30");
  await expect(page.getByText("1 page cropped to 100% × 10%")).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByLabel("Top")).toHaveValue("0");
  await expect(page.getByRole("button", { name: "Crop PDF" })).toBeDisabled();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Crop PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/crop-pdf$/);
  await expect(page).toHaveTitle("Crop PDF pages free, no sign-up · Plyleaf");
});
