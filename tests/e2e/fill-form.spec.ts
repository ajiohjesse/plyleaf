// Fill PDF form: a form's own fields filled in (and flattened), and typing, ticking and dating a form that has none.
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { clickAt, editorPage, openInEditor, saveEdits, textLines } from "../helpers/editor";
import { interactiveFormPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "form-canary-p3q";

/** Each widget's field name and value in a saved PDF. */
function fieldValues(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const values = Object.fromEntries(
    doc
      .loadPage(0)
      .getWidgets()
      .map((widget) => [widget.getName(), widget.getValue()]),
  );
  doc.destroy();
  return values;
}

/** How dark (0 white – 255 black) page 1 of a PDF is at (x, y) points, from a grey render. */
function inkOf(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, false);
  const [pixels, stride] = [pixmap.getPixels().slice(), pixmap.getStride()];
  doc.destroy();
  return (x: number, y: number) => 255 - pixels[Math.round(y) * stride + Math.round(x)]!;
}

test("fills in every kind of field and saves the answers in them, without sending anything", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "fill-pdf-form", `${SECRET}.pdf`, interactiveFormPdf());
  await expect(page.getByText("Fill in the form, or add something to the pages, then download.")).toBeVisible();

  await page.getByRole("textbox", { name: "Full name" }).fill("Ama Mensah");
  await page.getByRole("textbox", { name: "notes" }).fill("Allergic to nothing\nVegetarian");
  await page.getByRole("checkbox", { name: "agree" }).check();
  await page.getByRole("radio", { name: "size: M" }).check();
  await page.getByRole("combobox", { name: "country" }).selectOption("Kenya");
  await page.getByRole("listbox", { name: "colour" }).selectOption("g");
  // The read-only field can't be filled in.
  await expect(page.getByRole("textbox", { name: "ref" })).toHaveCount(0);
  await expect(page.getByText("6 fields filled in")).toBeVisible();

  const result = await saveEdits(page);
  expect(result.name).toBe(`${SECRET}-filled.pdf`);
  expect(fieldValues(result.bytes)).toMatchObject({
    name: "Ama Mensah",
    notes: "Allergic to nothing\nVegetarian",
    agree: "Yes",
    size: "M",
    country: "Kenya",
    colour: "g",
    ref: "R-1",
  });
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("flattening makes the answers part of the page", async ({ page }) => {
  await openInEditor(page, "fill-pdf-form", "form.pdf", interactiveFormPdf());
  await page.getByRole("textbox", { name: "Full name" }).fill("Kofi Boateng");
  await page.getByRole("checkbox", { name: "agree" }).check();
  await page.getByRole("checkbox", { name: /^Flatten/ }).check();
  const result = await saveEdits(page);
  const doc = new mupdf.PDFDocument(result.bytes);
  expect(doc.loadPage(0).getWidgets()).toHaveLength(0);
  doc.destroy();
  expect(textLines(result.bytes, 0).map((line) => line.text)).toContain("Kofi Boateng");
  // The check box's square, drawn in.
  expect(inkOf(result.bytes)(28, 172)).toBeGreaterThan(200);
  expect(await qpdfCheck(result.bytes)).toBe(0);
});

test("a form with no fields opens ready to type, tick and date", async ({ page }) => {
  const PAGE = { width: 400, height: 400 };
  await openInEditor(page, "fill-pdf-form", "printed-form.pdf", [PAGE]);
  await expect(page.getByText("This PDF has no fields to fill in")).toBeVisible();
  const toolbar = page.getByRole("toolbar", { name: "Editing tools" });
  await expect(toolbar.getByRole("button", { name: "Add text" })).toHaveAttribute("aria-pressed", "true");

  await clickAt(page, 0, 250, 60, PAGE.width);
  await page.keyboard.type("Jane Doe");
  await page.keyboard.press("Escape");

  // Two boxes ticked: the tool stays on.
  await toolbar.getByRole("button", { name: "Add tick" }).click();
  await page.getByRole("button", { name: "Cross" }).click();
  await clickAt(page, 0, 300, 300, PAGE.width);
  await page.getByRole("button", { name: "Check mark" }).click();
  await clickAt(page, 0, 340, 300, PAGE.width);
  await expect(editorPage(page, 0).getByRole("button", { name: "Cross" })).toHaveCount(1);
  await expect(editorPage(page, 0).getByRole("button", { name: "Check mark" })).toHaveCount(1);

  await toolbar.getByRole("button", { name: "Add date" }).click();
  const iso = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  await page.getByRole("button", { name: iso }).click();
  await clickAt(page, 0, 250, 100, PAGE.width);

  const result = await saveEdits(page);
  const lines = textLines(result.bytes, 0).map((line) => line.text);
  expect(lines).toContain("Jane Doe");
  expect(lines).toContain(iso);
  const inkAt = inkOf(result.bytes);
  // A 14-point cross centred on (300, 300): its middle is inked, the corner of its square isn't.
  expect(inkAt(300, 300)).toBeGreaterThan(150);
  expect(inkAt(300, 294)).toBeLessThan(60);
  // The check mark is inked inside its square, and nowhere between the two.
  let inked = 0;
  for (let y = 293; y < 307; y++) for (let x = 333; x < 347; x++) if (inkAt(x, y) > 128) inked++;
  expect(inked).toBeGreaterThan(15);
  expect(inkAt(320, 300)).toBe(0);
  expect(await qpdfCheck(result.bytes)).toBe(0);
});
