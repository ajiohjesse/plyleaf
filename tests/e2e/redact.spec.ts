// Redact PDF: areas marked by searching, by pattern, by clicking a word and by dragging, then taken out of the file for
// good (checked by reading the downloaded file's text and bytes back), with the document's properties removed too.
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { editorPage, openInEditor, pointOnScreen, saveEdits } from "../helpers/editor";
import { A4, textPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "redact-canary-q4n";
// textPdf: 12 pt Helvetica from 72 points in, baselines 100, 120, 140… points from the top.
const LINES = [
  "Patient: Ada Lovelace",
  "Email: ada@example.com",
  "Phone: +44 20 7946 0958",
  "Reference: K9-ALPHA",
  "Ward: North",
  "This sentence is public.",
];

function secretsPdf() {
  const doc = new mupdf.PDFDocument(textPdf(LINES));
  doc.setMetaData("info:Title", "Ada Lovelace medical record");
  doc.setMetaData("info:Author", "Dr Who");
  const bytes = doc.saveToBuffer("compress").asUint8Array().slice();
  doc.destroy();
  return bytes;
}

/** The file's text as MuPDF reads it, its bytes with every stream decompressed, and its title. */
function readBack(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const text = doc.loadPage(0).toStructuredText("preserve-whitespace").asText();
  const raw = new TextDecoder("latin1").decode(doc.saveToBuffer("decompress").asUint8Array());
  const title = doc.getMetaData("info:Title");
  doc.destroy();
  return { text, raw, title };
}

const marks = (page: import("@playwright/test").Page) => editorPage(page, 0).locator('[data-kind="redact"]');

test("finds, clicks and draws redactions, then removes them from the file for good, sending nothing", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "redact-pdf", `${SECRET}.pdf`, secretsPdf());
  const toolbar = page.getByRole("toolbar", { name: "Editing tools" });
  await expect(toolbar.getByRole("button", { name: "Redact" })).toHaveAttribute("aria-pressed", "true");

  // Words, found and marked (the text and the title have them).
  await page.getByLabel("Words to redact").fill("ada lovelace");
  await page.getByRole("button", { name: "Mark all" }).click();
  await expect(page.getByText("Marked 1 match on 1 page.")).toBeVisible();
  await expect(marks(page)).toHaveCount(1);
  await expect(marks(page).first()).toHaveAccessibleName("Redaction: Ada Lovelace");

  // Patterns.
  await page.getByRole("button", { name: "Email addresses" }).click();
  await page.getByRole("button", { name: "Phone numbers" }).click();
  await expect(marks(page)).toHaveCount(3);
  // A second search for the same thing doesn't mark it twice.
  await page.getByRole("button", { name: "Email addresses" }).click();
  await expect(page.getByText("All 1 match found are already marked.")).toBeVisible();
  await expect(marks(page)).toHaveCount(3);

  // A click on a word: "K9-ALPHA" (the line at 160 is "Reference: K9-ALPHA").
  const word = await pointOnScreen(page, 0, 160, 156, A4.width);
  await page.mouse.click(word.x, word.y);
  await expect(marks(page)).toHaveCount(4);
  await expect(marks(page).last()).toHaveAccessibleName("Redaction: K9-ALPHA");

  // A drag over "North" (the line at 180 is "Ward: North").
  const from = await pointOnScreen(page, 0, 107, 168, A4.width);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30 * from.scale, from.y + 8 * from.scale);
  await page.mouse.move(from.x + 60 * from.scale, from.y + 16 * from.scale);
  await page.mouse.up();
  await expect(marks(page)).toHaveCount(5);

  await expect(page.getByText("5 areas to redact for good")).toBeVisible();
  await expect(page.getByLabel(/Also remove the document's properties/)).toBeChecked();
  const result = await saveEdits(page);
  expect(result.name).toBe(`${SECRET}-redacted.pdf`);
  expect(await qpdfCheck(result.bytes)).toBe(0);

  const { text, raw, title } = readBack(result.bytes);
  for (const secret of ["Lovelace", "ada@example.com", "7946", "K9-ALPHA", "North", "Dr Who"]) {
    expect(text).not.toContain(secret);
    expect(raw).not.toContain(secret);
  }
  expect(title ?? "").toBe("");
  for (const kept of ["Patient:", "Email:", "Phone:", "Reference:", "Ward:", "This sentence is public."]) {
    expect(text).toContain(kept);
  }
  // Black where the name was.
  const doc = new mupdf.PDFDocument(result.bytes);
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const i = 96 * pixmap.getStride() + 140 * 3;
  expect(Array.from(pixmap.getPixels().subarray(i, i + 3))).toEqual([0, 0, 0]);
  doc.destroy();

  expect(egress.problems()).toEqual([]);
});

test("a mark deleted or undone keeps what's under it; nothing found says so", async ({ page }) => {
  await openInEditor(page, "redact-pdf", "record.pdf", secretsPdf());
  await page.getByLabel("Words to redact").fill("no such words");
  await page.getByRole("button", { name: "Mark all" }).click();
  await expect(page.getByText(/^Nothing found\./)).toBeVisible();

  await page.getByLabel("Words to redact").fill("public");
  await page.getByRole("button", { name: "Mark all" }).click();
  await page.getByRole("button", { name: "Email addresses" }).click();
  await expect(marks(page)).toHaveCount(2);
  // Undo takes the last search's marks back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(marks(page)).toHaveCount(1);
  // Selected and deleted, the other goes too.
  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Select" }).click();
  await marks(page).first().click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(marks(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();

  // Untick removing the properties and they stay.
  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Redact" }).click();
  await page.getByLabel("Words to redact").fill("North");
  await page.getByRole("button", { name: "Mark all" }).click();
  await page.getByLabel(/Also remove the document's properties/).uncheck();
  const result = await saveEdits(page);
  const { text, title } = readBack(result.bytes);
  expect(text).not.toContain("North");
  expect(text).toContain("This sentence is public.");
  expect(title).toBe("Ada Lovelace medical record");
});
