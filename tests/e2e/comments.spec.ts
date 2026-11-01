// Annotate PDF: comments are sticky notes on the page, saved as note annotations readers open to show the text.
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { clickAt, editorPage, openInEditor, saveEdits } from "../helpers/editor";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "note-canary-q1j";
const PAGE = { width: 400, height: 400 };

function notes(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const found = doc
    .loadPage(0)
    .getAnnotations()
    .map((annot) => ({ type: annot.getType(), text: annot.getContents(), at: annot.getBounds().slice(0, 2) }));
  doc.destroy();
  return found;
}

test("adds a comment where the page is clicked, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "annotate-pdf", `${SECRET}.pdf`, [PAGE]);
  const toolbar = page.getByRole("toolbar", { name: "Editing tools" });
  await toolbar.getByRole("button", { name: "Add comment" }).click();
  await clickAt(page, 0, 300, 200, PAGE.width);
  const box = page.getByRole("textbox", { name: "Comment" });
  await expect(box).toBeFocused();
  await box.fill("Please check these figures.\nThanks!");
  await page.keyboard.press("Escape");
  const note = page.getByRole("button", { name: /^Comment: Please check these figures/ });
  await expect(note).toHaveAttribute("aria-pressed", "true");
  // Selected, its text shows beside it.
  await expect(page.getByText("Thanks!")).toBeVisible();

  const result = await saveEdits(page);
  const [saved] = notes(result.bytes);
  expect(saved!.type).toBe("Text");
  expect(saved!.text).toBe("Please check these figures.\nThanks!");
  // The press was the icon's middle (20 points square).
  expect(saved!.at[0]).toBeCloseTo(290, 0);
  expect(saved!.at[1]).toBeCloseTo(190, 0);
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("a comment can be changed later, and an empty one goes away", async ({ page }) => {
  await openInEditor(page, "annotate-pdf", "notes.pdf", [PAGE]);
  const toolbar = page.getByRole("toolbar", { name: "Editing tools" });
  await toolbar.getByRole("button", { name: "Add comment" }).click();
  await clickAt(page, 0, 100, 300, PAGE.width);
  await page.keyboard.press("Escape");
  await expect(editorPage(page, 0).locator("[data-item]")).toHaveCount(0);

  // From the keyboard: the middle of the page.
  await toolbar.getByRole("button", { name: "Add comment" }).click();
  await page.getByRole("button", { name: "Add to page 1" }).press("Enter");
  await page.keyboard.type("First");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Comment: First" }).press("Enter");
  await page.keyboard.press("End");
  await page.keyboard.type(" and second");
  await page.keyboard.press("Escape");
  const result = await saveEdits(page);
  expect(notes(result.bytes).map((note) => note.text)).toEqual(["First and second"]);
});
