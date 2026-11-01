// Edit PDF: add pictures, move and resize them, and download them drawn into the page.
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { editorPage, openInEditor, pointOnScreen, saveEdits } from "../helpers/editor";
import { makeJpeg, makePng } from "../helpers/images";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "image-canary-k8w";
const PAGE = { width: 400, height: 400 };

/** The colour at (x, y) points on a page of a PDF. */
function colourAt(bytes: Uint8Array, index: number, x: number, y: number) {
  const doc = new mupdf.PDFDocument(bytes);
  const pixmap = doc.loadPage(index).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const i = Math.round(y) * pixmap.getStride() + Math.round(x) * 3;
  const rgb = Array.from(pixmap.getPixels().subarray(i, i + 3));
  doc.destroy();
  return rgb;
}
const isRed = ([r, g, b]: number[]) => r! > 200 && g! < 80 && b! < 80;

test("adds a picture in the middle of the page, resized and moved, without sending anything", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "edit-pdf", `${SECRET}.pdf`, [PAGE]);
  // 200 × 200 px at 96 dpi is 150 × 150 points: it fits half the page as it is.
  await page
    .getByLabel("Image to add")
    .setInputFiles({ name: `${SECRET}.png`, mimeType: "image/png", buffer: Buffer.from(makePng(200, 200)) });
  const image = page.getByRole("button", { name: `Image: ${SECRET}.png` });
  await expect(image).toHaveAttribute("aria-pressed", "true");
  await expect(image).toBeFocused();

  // Smaller from the keyboard (10% a press), then dragged 50 points left.
  await page.keyboard.press("-");
  await page.keyboard.press("=");
  await page.keyboard.press("-");
  const start = await pointOnScreen(page, 0, 200, 200, PAGE.width);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 25 * start.scale, start.y, { steps: 4 });
  await page.mouse.move(start.x - 50 * start.scale, start.y, { steps: 4 });
  await page.mouse.up();

  const result = await saveEdits(page);
  // 150 × 150 / 1.1 ≈ 136 points, centred at (200, 200), then 50 left: its top-left is about (82, 132).
  expect(isRed(colourAt(result.bytes, 0, 90, 140))).toBe(true);
  expect(isRed(colourAt(result.bytes, 0, 200, 140))).toBe(false);
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("a phone photo is turned the way it's shown, and the corner handle resizes", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "photo.pdf", [PAGE]);
  // Stored with red top-left; EXIF orientation 6 shows it turned a quarter clockwise, red top-right.
  await page.getByLabel("Image to add").setInputFiles({
    name: "turned.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(makeJpeg(200, 100, { orientation: 6 })),
  });
  const image = editorPage(page, 0).locator('[data-kind="image"]');
  await expect(image).toHaveCount(1);
  // In the middle of the screen, clear of the sticky toolbar and action bar.
  await image.locator("[data-resize]").evaluate((handle) => handle.scrollIntoView({ block: "center" }));
  // Shown 100 × 200 px: 75 × 150 points, centred.
  const box = (await image.boundingBox())!;
  expect(box.height / box.width).toBeCloseTo(2, 1);

  // Dragging the handle right makes it wider, keeping its shape.
  const handle = image.locator("[data-resize]");
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + box.width / 2, grip.y + grip.height / 2, { steps: 5 });
  await page.mouse.up();
  const resized = (await image.boundingBox())!;
  expect(resized.width / box.width).toBeCloseTo(1.5, 1);
  expect(resized.height / resized.width).toBeCloseTo(2, 1);

  const result = await saveEdits(page);
  // Now about 112 × 225 points with its top-left at (162.5, 125): red is in its top-right quarter.
  expect(isRed(colourAt(result.bytes, 0, 260, 150))).toBe(true);
  expect(isRed(colourAt(result.bytes, 0, 175, 150))).toBe(false);
});

test("says when a file isn't a picture it can read", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "bad.pdf", [PAGE]);
  await page
    .getByLabel("Image to add")
    .setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert")).toContainText("broken.png couldn't be read as a picture here");
});
