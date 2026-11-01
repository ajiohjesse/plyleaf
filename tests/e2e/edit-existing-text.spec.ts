// Edit PDF: change a page's own text. The line's old words come out of the page and the new ones go in its place, in
// the same standard font, size and colour.
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { openInEditor, saveEdits, textLines } from "../helpers/editor";
import { A4 } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "retext-canary-m9f";

/** A page with a red Times-Bold title and a Helvetica line under it. */
function report() {
  const doc = new mupdf.PDFDocument();
  const fonts = {
    T: doc.addSimpleFont(new mupdf.Font("Times-Bold")),
    H: doc.addSimpleFont(new mupdf.Font("Helvetica")),
  };
  const contents = [
    "BT 1 0 0 rg /T 18 Tf 72 742 Td (Quarterly report) Tj ET",
    "BT 0 g /H 12 Tf 72 712 Td (Revenue grew by 12 percent) Tj ET",
  ].join("\n");
  doc.insertPage(-1, doc.addPage([0, 0, A4.width, A4.height], 0, { Font: fonts }, contents));
  const bytes = doc.saveToBuffer("").asUint8Array().slice();
  doc.destroy();
  return bytes;
}

test("changes a line of the page's text in its own font, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "edit-pdf", `${SECRET}.pdf`, report());
  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Edit text" }).click();
  await page.getByRole("button", { name: "Edit text: Revenue grew by 12 percent" }).click();
  const box = page.getByRole("textbox", { name: "Text" });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("Revenue grew by 12 percent");
  await box.fill("Revenue grew by 15 percent");
  await page.keyboard.press("Escape");

  const result = await saveEdits(page);
  const lines = textLines(result.bytes, 0);
  expect(lines.map((line) => line.text).sort()).toEqual(["Quarterly report", "Revenue grew by 15 percent"]);
  const changed = lines.find((line) => line.text.includes("15"))!;
  expect(changed.font.name).toMatch(/Helvetica|NimbusSans/);
  expect(changed.font.size).toBeCloseTo(12, 0);
  expect(changed.bbox.x).toBeCloseTo(72, 0);
  // The old words are gone from the file, not just covered.
  const doc = new mupdf.PDFDocument(result.bytes);
  expect(doc.loadPage(0).toStructuredText("").asText()).not.toContain("12 percent");
  doc.destroy();
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("a line opened but left as it was changes nothing; a bold red title stays bold and red", async ({ page }) => {
  await openInEditor(page, "edit-pdf", "title.pdf", report());
  const toolbar = page.getByRole("toolbar", { name: "Editing tools" });
  await toolbar.getByRole("button", { name: "Edit text" }).click();
  await page.getByRole("button", { name: "Edit text: Revenue grew by 12 percent" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();

  await toolbar.getByRole("button", { name: "Edit text" }).click();
  await page.getByRole("button", { name: "Edit text: Quarterly report" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Q3");
  await page.keyboard.press("Escape");
  const title = page.getByRole("button", { name: "Text: Quarterly report Q3" });
  await expect(title).toHaveCSS("font-weight", "700");
  await expect(title).toHaveCSS("color", "rgb(255, 0, 0)");

  const result = await saveEdits(page);
  const changed = textLines(result.bytes, 0).find((line) => line.text === "Quarterly report Q3")!;
  expect(changed.font.name).toMatch(/Bold/);
  expect(changed.font.size).toBeCloseTo(18, 0);
  const doc = new mupdf.PDFDocument(result.bytes);
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  // Somewhere in the new title's box is red.
  let red = false;
  for (let y = Math.round(changed.bbox.y); y < changed.bbox.y + changed.bbox.h && !red; y++) {
    for (let x = Math.round(changed.bbox.x); x < changed.bbox.x + changed.bbox.w; x++) {
      const i = y * pixmap.getStride() + x * 3;
      const [r, g, b] = pixmap.getPixels().subarray(i, i + 3);
      if (r! > 200 && g! < 60 && b! < 60) red = true;
    }
  }
  doc.destroy();
  expect(red).toBe(true);
});
