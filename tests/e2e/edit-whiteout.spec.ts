// Edit PDF: whiteout covers part of a page in white (or another colour). It hides what's there; it doesn't remove it,
// as the editor says.
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { editorPage, openInEditor, pointOnScreen, saveEdits, textLines } from "../helpers/editor";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "whiteout-canary-h5d";
// makePdf's pages: the top-left quarter red, "Page 1" written near the bottom, right of the middle.
const PAGE = { width: 400, height: 400 };

function colours(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const pixels = pixmap.getPixels().slice();
  const stride = pixmap.getStride();
  doc.destroy();
  return {
    at: (x: number, y: number) => Array.from(pixels.subarray(y * stride + x * 3, y * stride + x * 3 + 3)),
    /** Whether every pixel in the box is this colour. */
    all: (x0: number, y0: number, x1: number, y1: number, rgb: number[]) => {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * stride + x * 3;
          if (rgb.some((c, k) => Math.abs(pixels[i + k]! - c) > 8)) return false;
        }
      }
      return true;
    },
  };
}

test("covers text and a coloured area, says it isn't removed, and sends nothing", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "edit-pdf", `${SECRET}.pdf`, [PAGE]);
  const tool = page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Whiteout" });

  // Over "Page 1" (its baseline is 20 points from the bottom).
  await tool.click();
  await expect(page.getByText("It isn't removed from the file.")).toBeVisible();
  const from = await pointOnScreen(page, 0, 200, 355, PAGE.width);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60 * from.scale, from.y + 20 * from.scale);
  await page.mouse.move(from.x + 120 * from.scale, from.y + 40 * from.scale);
  await page.mouse.up();
  await expect(editorPage(page, 0).getByRole("button", { name: "Whiteout" })).toHaveAttribute("aria-pressed", "true");

  // In blue, over part of the red quarter, placed with a click (120 × 80 round it).
  await tool.click();
  await page.getByLabel("Cover colour").fill("#0000ff");
  const click = await pointOnScreen(page, 0, 100, 100, PAGE.width);
  await page.mouse.click(click.x, click.y);
  await expect(editorPage(page, 0).locator('[data-kind="whiteout"]')).toHaveCount(2);

  const result = await saveEdits(page);
  const page0 = colours(result.bytes);
  expect(page0.all(202, 357, 318, 393, [255, 255, 255])).toBe(true);
  expect(page0.all(42, 62, 158, 138, [0, 0, 255])).toBe(true);
  // Red still shows outside the blue.
  expect(page0.at(20, 20)).toEqual([255, 0, 0]);
  // Hidden, not removed: as the editor says, the text is still in the file.
  expect(textLines(result.bytes, 0).map((line) => line.text)).toContain("Page 1");
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});
