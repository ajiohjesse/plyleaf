// Edit PDF: add text with the pointer and the keyboard, style it, move it, and download it written into the page.
import { expect, test } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { clickAt, editorPage, openInEditor, saveEdits, textLines } from "../helpers/editor";
import { qpdfCheck } from "../helpers/qpdf";
import { A4 } from "../helpers/pdf";

const SECRET = "edit-canary-p4q";

test("adds styled text where the page is clicked, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "edit-pdf", `${SECRET}.pdf`, [A4, A4]);
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();

  // Styled before placing, so the box's top-left is where the page is clicked.
  await page.getByRole("button", { name: "Add text" }).click();
  await page.getByLabel("Size").fill("24");
  await page.getByRole("button", { name: "Bold" }).click();
  await clickAt(page, 0, 300, 400, A4.width);
  const box = page.getByRole("textbox", { name: "Text" });
  await expect(box).toBeFocused();
  await box.fill("Hello Plyleaf");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Text: Hello Plyleaf" })).toHaveCSS("font-weight", "700");
  await expect(page.getByText("1 edit")).toBeVisible();

  const result = await saveEdits(page);
  expect(result.name).toBe(`${SECRET}-edited.pdf`);
  const line = textLines(result.bytes, 0).find((found) => found.text === "Hello Plyleaf")!;
  expect(line.font.name).toMatch(/Bold/);
  expect(line.font.size).toBeCloseTo(24, 0);
  // Where it was clicked: the box's top-left, give or take the glyphs' side bearings and a pixel of rounding.
  expect(Math.abs(line.bbox.x - 300)).toBeLessThan(4);
  expect(Math.abs(line.bbox.y - 400)).toBeLessThan(6);
  // The page's own text is still there, and nothing went on page 2.
  expect(textLines(result.bytes, 0).some((found) => found.text === "Page 1")).toBe(true);
  expect(textLines(result.bytes, 1).map((found) => found.text)).toEqual(["Page 2"]);
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("works from the keyboard: add, type, nudge, and back to editing", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "keys.pdf", [A4]);
  await page.getByRole("button", { name: "Add text" }).click();
  // Pressing the page from the keyboard puts the text in its middle.
  await page.getByRole("button", { name: "Add to page 1" }).press("Enter");
  await page.keyboard.type("Typed");
  await page.keyboard.press("Escape");
  const text = page.getByRole("button", { name: "Text: Typed" });
  await expect(text).toHaveAttribute("aria-pressed", "true");
  await text.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("ArrowDown");

  const first = await saveEdits(page);
  const line = textLines(first.bytes, 0).find((found) => found.text === "Typed")!;
  expect(Math.abs(line.bbox.x - (A4.width / 2 + 10))).toBeLessThan(3);

  // Back to editing, the text is still there to change.
  await page.getByRole("button", { name: "Back to editing" }).click();
  await page.getByRole("button", { name: "Text: Typed" }).press("Enter");
  await page.keyboard.press("End");
  await page.keyboard.type(" more");
  await page.keyboard.press("Escape");
  const second = await saveEdits(page);
  expect(textLines(second.bytes, 0).map((found) => found.text)).toContain("Typed more");
});

test("empty text goes away, and characters the fonts lack are flagged", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "empty.pdf", [A4]);
  await page.getByRole("button", { name: "Add text" }).click();
  await clickAt(page, 0, 100, 100, A4.width);
  await page.keyboard.press("Escape");
  await expect(editorPage(page, 0).locator("[data-item]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();

  await page.getByRole("button", { name: "Add text" }).click();
  await clickAt(page, 0, 100, 100, A4.width);
  await page.keyboard.type("Hi 中");
  await expect(page.getByText("中 can't be shown in the standard fonts")).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(editorPage(page, 0).locator("[data-item]")).toHaveCount(0);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Edit PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/edit-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Edit PDF" })).toBeVisible();
});
