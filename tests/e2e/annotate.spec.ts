// Annotate PDF: highlight, underline and strike out text, saved as standard PDF annotations.
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { clickAt, editorPage, openInEditor, pointOnScreen, saveEdits } from "../helpers/editor";
import { A4, textPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "annotate-canary-r7c";
const LINES = ["The quick brown fox", "jumps over the lazy dog", "Plyleaf marks text"];

/** Drags across page 0 from one point to another, in points. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const start = await pointOnScreen(page, 0, from[0], from[1], A4.width);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const step of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(
      start.x + (to[0] - from[0]) * start.scale * step,
      start.y + (to[1] - from[1]) * start.scale * step,
    );
  }
  await page.mouse.up();
}

function annotations(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const found = doc
    .loadPage(0)
    .getAnnotations()
    .map((annot) => ({ type: annot.getType(), color: annot.getColor(), quads: annot.getQuadPoints().length }));
  doc.destroy();
  return found;
}

test("highlights, underlines and strikes out text, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "annotate-pdf", `${SECRET}.pdf`, textPdf(LINES));
  // The highlighter is ready.
  await expect(page.getByRole("button", { name: "Highlight text" })).toHaveAttribute("aria-pressed", "true");

  // Across the first line (baseline 100).
  await drag(page, [70, 96], [190, 96]);
  await expect(page.getByRole("button", { name: /^Highlight: The quick brown fox/ })).toBeVisible();

  // One word, underlined, with a click.
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await clickAt(page, 0, 160, 116, A4.width);
  await expect(page.getByRole("button", { name: /^Underline: (lazy|the)$/ })).toBeVisible();

  // The second and third lines, struck out with one drag.
  await page.getByRole("button", { name: "Strike out", exact: true }).click();
  await drag(page, [70, 116], [150, 136]);
  await expect(page.getByRole("button", { name: /^Strike out: jumps over/ })).toBeVisible();

  const result = await saveEdits(page);
  expect(result.name).toBe(`${SECRET}-annotated.pdf`);
  const found = annotations(result.bytes);
  expect(found.map((a) => a.type)).toEqual(["Highlight", "Underline", "StrikeOut"]);
  expect(found[2]!.quads).toBe(2);
  expect(found[0]!.color.map((c) => Math.round(c * 255))).toEqual([255, 227, 51]);
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("says when there's no text, and changes or removes a mark", async ({ page }) => {
  await openInEditor(page, "annotate-pdf", "change.pdf", textPdf(LINES));
  await drag(page, [300, 400], [400, 450]);
  await expect(page.getByText("There's no text there to mark.")).toBeVisible();

  await clickAt(page, 0, 110, 96, A4.width);
  const mark = page.getByRole("button", { name: "Highlight: quick" });
  await expect(mark).toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await mark.click();
  await page.getByLabel("Colour").fill("#00ff00");
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await expect(page.getByRole("button", { name: "Underline: quick" })).toBeVisible();
  const first = await saveEdits(page);
  expect(annotations(first.bytes)).toEqual([{ type: "Underline", color: [0, 1, 0], quads: 1 }]);

  await page.getByRole("button", { name: "Back to editing" }).click();
  await page.getByRole("button", { name: "Underline: quick" }).focus();
  await page.keyboard.press("Delete");
  await expect(editorPage(page, 0).locator("[data-item]")).toHaveCount(0);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Annotate PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/annotate-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Annotate PDF" })).toBeVisible();
});
