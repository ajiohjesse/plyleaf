// The editor's undo and redo: toolbar buttons and keyboard shortcuts, one step per gesture.
import { expect, test } from "@playwright/test";
import { clickAt, editorPage, openInEditor, saveEdits, textLines } from "../helpers/editor";
import { A4 } from "../helpers/pdf";

async function addText(page: import("@playwright/test").Page, x: number, y: number, text: string) {
  await page.getByRole("button", { name: "Add text" }).click();
  await clickAt(page, 0, x, y, A4.width);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

test("undoes and redoes adding, moving and typing, from the toolbar and the keyboard", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "undo.pdf", [A4]);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  const items = editorPage(page, 0).locator("[data-item]");
  await expect(undo).toHaveAttribute("aria-disabled", "true");
  await expect(redo).toHaveAttribute("aria-disabled", "true");

  await addText(page, 100, 100, "One");
  await addText(page, 100, 300, "Two");
  const two = page.getByRole("button", { name: "Text: Two" });
  const before = (await two.boundingBox())!;
  await two.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await two.boundingBox())!.x).toBeGreaterThan(before.x);

  // The move, then adding "Two" (all its typing one step).
  await undo.click();
  await expect.poll(async () => (await two.boundingBox())!.x).toBeCloseTo(before.x, 0);
  await undo.click();
  await expect(items).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Text: One" })).toBeVisible();
  await redo.click();
  await expect(items).toHaveCount(2);

  // Shortcuts, from anywhere but a text field.
  await page.getByRole("button", { name: "Select" }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(items).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(items).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+y");
  await expect.poll(async () => (await two.boundingBox())!.x).toBeGreaterThan(before.x);
  await expect(redo).toHaveAttribute("aria-disabled", "true");
  // Focus stays on the button when it runs out.
  await redo.focus();
  await page.keyboard.press("Enter");
  await expect(redo).toBeFocused();

  // Changing text is one step; undo brings back what it said.
  await page.getByRole("button", { name: "Text: One" }).press("Enter");
  await page.keyboard.press("End");
  await page.keyboard.type(" more");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Text: One more" })).toBeVisible();
  await undo.click();
  await expect(page.getByRole("button", { name: "Text: One" })).toBeVisible();

  // A new change drops what could be redone.
  await addText(page, 100, 500, "Three");
  await expect(redo).toHaveAttribute("aria-disabled", "true");
  const result = await saveEdits(page);
  expect(
    textLines(result.bytes, 0)
      .map((line) => line.text)
      .filter((text) => text !== "Page 1")
      .sort(),
  ).toEqual(["One", "Three", "Two"]);
});
