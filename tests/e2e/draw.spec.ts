// Annotate PDF: draw freehand, saved as ink annotations; strokes can be moved, restyled, undone and deleted.
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { editorPage, openInEditor, pointOnScreen, saveEdits } from "../helpers/editor";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "draw-canary-v2n";
const PAGE = { width: 400, height: 400 };

/** Draws a stroke on page 0 through points (in points). */
async function stroke(page: Page, points: [number, number][]) {
  const [first] = points;
  const start = await pointOnScreen(page, 0, first![0], first![1], PAGE.width);
  const toScreen = ([x, y]: [number, number]) => [
    start.x + (x - first![0]) * start.scale,
    start.y + (y - first![1]) * start.scale,
  ];
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const [x, y] = toScreen(point);
    await page.mouse.move(x!, y!, { steps: 3 });
  }
  await page.mouse.up();
}

function inks(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const found = doc
    .loadPage(0)
    .getAnnotations()
    .map((annot) => ({ type: annot.getType(), width: annot.getBorderWidth(), bounds: annot.getBounds() }));
  doc.destroy();
  return found;
}

test("draws strokes as ink annotations, without sending the file anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "annotate-pdf", `${SECRET}.pdf`, [PAGE]);
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await page.getByLabel("Thickness").fill("6");
  await stroke(page, [
    [220, 220],
    [260, 300],
    [300, 220],
    [340, 300],
  ]);
  await stroke(page, [
    [220, 340],
    [340, 340],
  ]);
  const drawings = editorPage(page, 0).getByRole("button", { name: "Drawing", exact: true });
  await expect(drawings).toHaveCount(2);

  // One undo takes back the second stroke whole.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(drawings).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(drawings).toHaveCount(2);

  // The first stroke, moved 10 points right from the keyboard.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await drawings.first().focus();
  await page.keyboard.press("Shift+ArrowRight");

  const result = await saveEdits(page);
  const found = inks(result.bytes);
  expect(found.map((ink) => [ink.type, ink.width])).toEqual([
    ["Ink", 6],
    ["Ink", 6],
  ]);
  // Both strokes start at x = 220; the first was moved 10 points right.
  const [x0, y0, x1, y1] = found[0]!.bounds;
  expect(x0 - found[1]!.bounds[0]).toBeCloseTo(10, 0);
  expect(x1).toBeGreaterThan(350);
  expect(y0).toBeLessThan(220);
  expect(y1).toBeGreaterThan(300);
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});
