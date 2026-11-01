// Edit PDF: draw rectangles, ellipses and arrows, change them, and download them drawn into the page.
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { clickAt, editorPage, openInEditor, pointOnScreen, saveEdits } from "../helpers/editor";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "shape-canary-z3m";
// The test file's top-left quarter is red; everything here is drawn on the white rest.
const PAGE = { width: 400, height: 400 };

/** Drags across page 0 from one point to another, in points. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const start = await pointOnScreen(page, 0, from[0], from[1], PAGE.width);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const step of [0.3, 0.7, 1]) {
    await page.mouse.move(
      start.x + (to[0] - from[0]) * start.scale * step,
      start.y + (to[1] - from[1]) * start.scale * step,
    );
  }
  await page.mouse.up();
}

function colours(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const pixels = pixmap.getPixels().slice();
  const stride = pixmap.getStride();
  doc.destroy();
  return (x: number, y: number) => Array.from(pixels.subarray(y * stride + x * 3, y * stride + x * 3 + 3));
}
const near = (rgb: number[], target: number[]) => rgb.every((c, i) => Math.abs(c - target[i]!) < 40);
const RED = [217, 28, 46];
const YELLOW = [255, 212, 59];
const WHITE = [255, 255, 255];

test("draws a filled rectangle, an ellipse and an arrow, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "edit-pdf", `${SECRET}.pdf`, [PAGE]);

  // A rectangle, dragged from corner to corner, then filled.
  await page.getByRole("button", { name: "Add shape" }).click();
  await drag(page, [320, 300], [220, 220]);
  const rectangle = page.getByRole("button", { name: "Rectangle", exact: true }).last();
  await expect(rectangle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fill", exact: true }).click();

  // An ellipse, placed with a click: 120 × 80 points round the click. New shapes keep the last options (filled).
  await page.getByRole("button", { name: "Add shape" }).click();
  await page.getByRole("button", { name: "Ellipse", exact: true }).click();
  await clickAt(page, 0, 100, 300, PAGE.width);
  await expect(editorPage(page, 0).locator('[data-kind="shape"]')).toHaveCount(2);

  // An arrow, dragged left to right.
  await page.getByRole("button", { name: "Add shape" }).click();
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await page.getByLabel("Width").fill("4");
  await drag(page, [40, 240], [180, 240]);
  await expect(page.getByRole("button", { name: "Arrow", exact: true }).last()).toHaveAttribute("aria-pressed", "true");

  const result = await saveEdits(page);
  const at = colours(result.bytes);
  expect(near(at(220, 260), RED)).toBe(true);
  expect(near(at(270, 260), YELLOW)).toBe(true);
  expect(near(at(330, 260), WHITE)).toBe(true);
  // The ellipse's outline left of its centre, filled inside, and not in the corner of its box.
  expect(near(at(40, 300), RED)).toBe(true);
  expect(near(at(100, 300), YELLOW)).toBe(true);
  expect(near(at(41, 262), WHITE)).toBe(true);
  // The arrow's line (4 wide), and its head (16 long, 16 wide at its base) wider than the line near the tip.
  expect(near(at(100, 240), RED)).toBe(true);
  expect(near(at(100, 245), WHITE)).toBe(true);
  expect(near(at(167, 243), RED)).toBe(true);
  expect(near(at(186, 240), WHITE)).toBe(true);
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("a shape's outline, width and size change after it's drawn", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "change.pdf", [PAGE]);
  await page.getByRole("button", { name: "Add shape" }).click();
  // From the keyboard: in the middle of the page.
  await page.getByRole("button", { name: "Add to page 1" }).press("Enter");
  const shape = editorPage(page, 0).locator('[data-kind="shape"]');
  await expect(shape).toBeFocused();
  await page.getByLabel("Width").fill("8");
  await page.getByRole("button", { name: "No outline" }).click();
  await page.getByRole("button", { name: "Fill", exact: true }).click();
  // Twice as big from the keyboard (+ is a tenth bigger).
  await shape.focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press("+");

  const result = await saveEdits(page);
  const at = colours(result.bytes);
  // Placed 120 × 80 round the middle, from (140, 160); grown from that corner to 120 × 80 × 1.1⁷ ≈ 234 × 156.
  expect(near(at(365, 310), YELLOW)).toBe(true);
  expect(near(at(380, 322), WHITE)).toBe(true);
  // No outline: the edge is the fill colour.
  expect(near(at(372, 240), YELLOW)).toBe(true);
});
