// Edit PDF: rubber stamps (standard ones and your own words), saved as stamp annotations.
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { clickAt, editorPage, openInEditor, saveEdits } from "../helpers/editor";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "stamp-canary-y6t";
const PAGE = { width: 400, height: 400 };

function stamps(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const found = doc
    .loadPage(0)
    .getAnnotations()
    .map((annot) => {
      const [x0, y0, x1, y1] = annot.getBounds();
      return { type: annot.getType(), name: annot.getIcon(), box: [x0, y0, x1 - x0, y1 - y0] };
    });
  doc.destroy();
  return found;
}

test("stamps the page with a standard stamp and words of your own, without sending anything", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "edit-pdf", `${SECRET}.pdf`, [PAGE]);
  const toolbar = page.getByRole("toolbar", { name: "Editing tools" });
  await toolbar.getByRole("button", { name: "Add stamp" }).click();
  await page.getByRole("button", { name: "DRAFT", exact: true }).click();
  // 160 points wide, round the click.
  await clickAt(page, 0, 300, 250, PAGE.width);
  const draft = page.getByRole("button", { name: "Stamp: DRAFT" });
  await expect(draft).toBeFocused();
  // Bigger from the keyboard: 160 × 1.1 = 176 wide, from the same top-left.
  await page.keyboard.press("+");

  // Another, in words of your own.
  await toolbar.getByRole("button", { name: "Add stamp" }).click();
  await page.getByRole("button", { name: "Your own words" }).click();
  await page.getByLabel("Words", { exact: true }).fill("PAID");
  await clickAt(page, 0, 120, 340, PAGE.width);
  await expect(page.getByRole("button", { name: "Stamp: PAID" })).toBeVisible();

  const result = await saveEdits(page);
  const found = stamps(result.bytes);
  expect(found.map(({ type, name }) => [type, name])).toEqual([
    ["Stamp", "Draft"],
    ["Stamp", "PAID"],
  ]);
  // Where they were placed, within a point or so of where the clicks landed on screen.
  const expected = [
    [220, 229, 176, 46],
    [40, 319, 160, 42],
  ];
  found.forEach((stamp, i) =>
    stamp.box.forEach((n, k) => expect(Math.abs(n - expected[i]![k]!)).toBeLessThanOrEqual(2)),
  );
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("a stamp can be restyled, and empty words aren't stamped", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "stamps.pdf", [PAGE]);
  const toolbar = page.getByRole("toolbar", { name: "Editing tools" });
  await toolbar.getByRole("button", { name: "Add stamp" }).click();
  await page.getByRole("button", { name: "Your own words" }).click();
  await clickAt(page, 0, 200, 200, PAGE.width);
  await expect(page.getByText("Type the words for your stamp first.")).toBeVisible();
  await expect(editorPage(page, 0).locator("[data-item]")).toHaveCount(0);

  await page.getByRole("button", { name: "APPROVED", exact: true }).click();
  await clickAt(page, 0, 200, 200, PAGE.width);
  // Placed and selected: the options now change it.
  await page.getByRole("button", { name: "CONFIDENTIAL", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stamp: CONFIDENTIAL" })).toBeVisible();
  const result = await saveEdits(page);
  expect(stamps(result.bytes).map((stamp) => stamp.name)).toEqual(["Confidential"]);
});
