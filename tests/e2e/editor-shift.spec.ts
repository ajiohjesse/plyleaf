// Edit PDF: what Shift does while drawing and resizing (D-044). Boxes and lines are free unless Shift is held; pictures
// keep their shape unless it is.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { editorPage, openInEditor, pointOnScreen } from "../helpers/editor";
import { makePng } from "../helpers/images";

const PAGE = { width: 400, height: 400 };

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

/** Drags an item's resize handle by (dx, dy) CSS pixels. */
async function resize(page: Page, item: Locator, dx: number, dy: number) {
  // In the middle of the screen, clear of the sticky action bar.
  await item.locator("[data-resize]").evaluate((handle) => handle.scrollIntoView({ block: "center" }));
  const handle = (await item.locator("[data-resize]").boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
}

async function ratio(item: Locator) {
  const box = (await item.boundingBox())!;
  return box.width / box.height;
}

test("Shift draws a square and a level line", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "shift.pdf", [PAGE]);
  const shapes = editorPage(page, 0).locator('[data-kind="shape"]');

  await page.getByRole("button", { name: "Add shape" }).click();
  await page.keyboard.down("Shift");
  await drag(page, [100, 100], [220, 150]);
  await page.keyboard.up("Shift");
  expect(await ratio(shapes.first())).toBeCloseTo(1, 1);

  await page.getByRole("button", { name: "Add shape" }).click();
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await page.keyboard.down("Shift");
  await drag(page, [80, 300], [260, 312]);
  await page.keyboard.up("Shift");
  // Level: its box is only as tall as the stroke and the space round it for grabbing, whatever its length.
  expect(await ratio(shapes.nth(1))).toBeGreaterThan(8);
});

test("a box resizes freely, and keeps its proportions with Shift", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "shift.pdf", [PAGE]);
  await page.getByRole("button", { name: "Add shape" }).click();
  await drag(page, [100, 100], [200, 150]);
  const box = editorPage(page, 0).locator('[data-kind="shape"]');
  expect(await ratio(box)).toBeGreaterThan(1.6);

  await resize(page, box, 0, 60);
  const freely = await ratio(box);
  expect(freely).toBeLessThan(1.6);

  const before = (await box.boundingBox())!.width;
  await page.keyboard.down("Shift");
  await resize(page, box, 80, 10);
  await page.keyboard.up("Shift");
  expect((await box.boundingBox())!.width).toBeGreaterThan(before + 40);
  expect(await ratio(box)).toBeCloseTo(freely, 1);
});

test("a picture keeps its shape when resized, and stretches with Shift", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "shift.pdf", [PAGE]);
  await page
    .getByLabel("Image to add")
    .setInputFiles({ name: "wide.png", mimeType: "image/png", buffer: Buffer.from(makePng(200, 100)) });
  const picture = page.getByRole("button", { name: "Image: wide.png" });
  await expect(picture).toHaveAttribute("aria-pressed", "true");
  expect(await ratio(picture)).toBeCloseTo(2, 1);

  const before = (await picture.boundingBox())!.width;
  await resize(page, picture, 10, 60);
  expect((await picture.boundingBox())!.width).toBeGreaterThan(before + 60);
  expect(await ratio(picture)).toBeCloseTo(2, 1);

  await page.keyboard.down("Shift");
  await resize(page, picture, -60, 40);
  await page.keyboard.up("Shift");
  expect(await ratio(picture)).toBeLessThan(1.5);
});
