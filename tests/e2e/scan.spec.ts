// Scan to PDF: photos of a page at an angle in, corners found, straightened page out; the corner editor, filters and
// the live camera (Chromium's fake camera).
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, type FileSpec } from "../helpers/files";
import { scanPhotoPng } from "../helpers/scan";

const SECRET = "scan-canary-w9d";
const photo = (name: string): FileSpec => ({ name, mimeType: "image/png", bytes: Array.from(scanPhotoPng(960, 720)) });
const scanned = (page: Page) => page.getByRole("list", { name: "Scanned pages" }).getByRole("listitem");

async function openTool(page: Page) {
  await page.goto("/scan-to-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
}

async function makePdf(page: Page) {
  await page.getByRole("button", { name: "Make PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe("scan.pdf");
  return mupdf.Document.openDocument(await readFile((await saved.path())!), "application/pdf");
}

/** "red", "white", "desk" (the photo's dark background) or the colour, at fractions of page `index`. */
function colourAt(doc: mupdf.Document, index: number, fx: number, fy: number) {
  const pixmap = doc.loadPage(index).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const i = Math.floor(fy * pixmap.getHeight()) * pixmap.getStride() + Math.floor(fx * pixmap.getWidth()) * 3;
  const [r, g, b] = pixmap.getPixels().slice(i, i + 3);
  pixmap.destroy();
  if (r! > 180 && g! < 90 && b! < 90) return "red";
  if (r! > 200 && g! > 200 && b! > 200) return "white";
  if (r! < 100 && g! < 100 && b! < 100) return "desk";
  return `rgb(${r}, ${g}, ${b})`;
}

const aspect = (doc: mupdf.Document, index: number) => {
  const [x0, y0, x1, y1] = doc.loadPage(index).getBounds();
  return (y1 - y0) / (x1 - x0);
};

test("finds and straightens the page in each photo, without sending them anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page);
  await page
    .getByLabel("Choose files")
    .setInputFiles([photo(`${SECRET}-1.png`), photo(`${SECRET}-2.png`)].map(asPayload));
  await expect(scanned(page)).toHaveCount(2);
  await expect(scanned(page).locator('canvas[data-state="ready"]')).toHaveCount(2);
  await expect(page.getByText("2 pages, in this order")).toBeVisible();

  const doc = await makePdf(page);
  expect(doc.countPages()).toBe(2);
  // Straightened: the red block is at the page's top-left, and the corners are paper, not desk.
  expect(colourAt(doc, 0, 0.25, 0.19)).toBe("red");
  expect(colourAt(doc, 0, 0.75, 0.19)).toBe("white");
  for (const [x, y] of [
    [0.04, 0.04],
    [0.96, 0.04],
    [0.96, 0.96],
    [0.04, 0.96],
  ]) {
    expect(colourAt(doc, 0, x!, y!)).toBe("white");
  }
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("the corners can be adjusted by keyboard, or set to the whole photo", async ({ page }) => {
  await openTool(page);
  await page.getByLabel("Choose files").setInputFiles(asPayload(photo("desk.png")));
  await expect(scanned(page).locator('canvas[data-state="ready"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Adjust corners of page 1" }).click();
  await expect(page.getByRole("heading", { name: "Adjust the corners" })).toBeFocused();
  // Detected near where the page lies (22% across, 12% down).
  const topLeft = page.getByRole("button", { name: /^Top-left corner/ });
  await expect(topLeft).toHaveAccessibleName(/Top-left corner, 2[1-3]% across, 1[1-3]% down/);
  await topLeft.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(topLeft).toHaveAccessibleName(/Top-left corner, 1[6-8]% across/);
  await page.getByRole("button", { name: "Back to detected" }).click();
  await expect(topLeft).toHaveAccessibleName(/Top-left corner, 2[1-3]% across/);

  await page.getByRole("button", { name: "Whole photo" }).click();
  await expect(topLeft).toHaveAccessibleName("Top-left corner, 0% across, 0% down");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(scanned(page).locator('canvas[data-state="ready"]')).toHaveCount(1);
  const doc = await makePdf(page);
  // The whole 4:3 photo, desk and all.
  expect(aspect(doc, 0)).toBeCloseTo(0.75, 2);
  expect(colourAt(doc, 0, 0.02, 0.02)).toBe("desk");
});

test("black and white, on A4", async ({ page }) => {
  await openTool(page);
  await page.getByLabel("Choose files").setInputFiles(asPayload(photo("note.png")));
  await expect(scanned(page).locator('canvas[data-state="ready"]')).toHaveCount(1);
  await page.getByText("Black and white", { exact: true }).click();
  await page.getByText("A4", { exact: true }).click();
  await expect(scanned(page).locator('canvas[data-state="ready"]')).toHaveCount(1);
  const doc = await makePdf(page);
  const [, , width, height] = doc.loadPage(0).getBounds();
  expect([Math.round(width), Math.round(height)]).toEqual([842, 595]);
  // Black and white: the red block is now black.
  const pdf = doc.asPDF()!;
  const form = pdf.findPage(0).get("Resources").get("XObject").get("Page");
  let image: mupdf.PDFObject | undefined;
  form
    .get("Resources")
    .get("XObject")
    .forEach((x) => (image ??= x));
  expect(pdf.loadImage(image!).getColorSpace()?.getType()).toBe("Gray");
});

test("says so when a file isn't a photo", async ({ page }) => {
  await openTool(page);
  await page
    .getByLabel("Choose files")
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByRole("list", { name: "Photo messages" })).toContainText("notes.txt isn't an image.");
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Scan to PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/scan-to-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Scan to PDF" })).toBeVisible();
});
