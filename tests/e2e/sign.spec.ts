// Sign PDF: signatures and initials drawn, typed or uploaded, saved on this device (and forgotten), put on pages and
// into signature fields.
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { clickAt, editorPage, openInEditor, saveEdits } from "../helpers/editor";
import { FORM_FIELDS, interactiveFormPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "sign-canary-z7m";
const PAGE = { width: 400, height: 400 };

/** Each pixel of page 1 of a PDF as [r, g, b], rendered at 72 dpi (a pixel a point). */
function render(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes);
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const [pixels, stride] = [pixmap.getPixels().slice(), pixmap.getStride()];
  doc.destroy();
  return (x: number, y: number) => {
    const i = Math.round(y) * stride + Math.round(x) * 3;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
  };
}
const isDark = ([r, g, b]: number[]) => r! < 110 && g! < 110 && b! < 140;
const isRed = ([r, g, b]: number[]) => r! > 200 && g! < 80 && b! < 80;

/** How many dark pixels there are in a box of points (x0, y0, x1, y1). */
function darkIn(at: ReturnType<typeof render>, [x0, y0, x1, y1]: readonly number[]) {
  let count = 0;
  for (let y = y0!; y < y1!; y++) for (let x = x0!; x < x1!; x++) if (isDark(at(x, y))) count++;
  return count;
}

async function drawOnPad(page: Page) {
  const box = (await page.locator("[data-signature-pad]").boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 110);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 30, { steps: 8 });
  await page.mouse.move(box.x + 190, box.y + 120, { steps: 8 });
  await page.mouse.move(box.x + 260, box.y + 50, { steps: 8 });
  await page.mouse.up();
}

test("a drawn signature goes on the page, is kept on this device, and can be forgotten, without sending anything", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openInEditor(page, "sign-pdf", `${SECRET}.pdf`, [PAGE]);
  const toolbar = page.getByRole("toolbar", { name: "Editing tools" });
  await expect(toolbar.getByRole("button", { name: "Sign" })).toHaveAttribute("aria-pressed", "true");
  const use = page.getByRole("button", { name: "Use this signature" });
  await expect(use).toBeDisabled();
  await drawOnPad(page);
  await expect(page.getByLabel(/Save it on this device/)).toBeChecked();
  await use.click();
  await expect(page.getByRole("button", { name: "Signature 1, saved on this device" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Centred on the click, 36 points tall.
  await clickAt(page, 0, 300, 300, PAGE.width);
  const signature = page.getByRole("button", { name: "Signature", exact: true });
  await expect(signature).toBeFocused();
  const box = (await signature.boundingBox())!;
  const pageBox = (await editorPage(page, 0).boundingBox())!;
  expect((box.height * PAGE.width) / pageBox.width).toBeCloseTo(36, 0);

  const result = await saveEdits(page);
  const at = render(result.bytes);
  expect(darkIn(at, [230, 282, 370, 318])).toBeGreaterThan(40);
  // Nothing below it but the page's own number, at the bottom.
  expect(darkIn(at, [0, 330, 400, 370])).toBe(0);
  expect(await qpdfCheck(result.bytes)).toBe(0);

  // Next time it's there to use straight away…
  await openInEditor(page, "sign-pdf", `${SECRET}.pdf`, [PAGE]);
  const saved = page.getByRole("button", { name: "Signature 1, saved on this device" });
  await expect(saved).toBeVisible();
  await expect(use).toHaveCount(0);
  await clickAt(page, 0, 100, 300, PAGE.width);
  await expect(page.getByRole("button", { name: "Signature", exact: true })).toBeVisible();

  // …until it's forgotten.
  await toolbar.getByRole("button", { name: "Sign" }).click();
  await page.getByRole("button", { name: "Forget signature 1" }).click();
  await expect(saved).toHaveCount(0);
  await openInEditor(page, "sign-pdf", `${SECRET}.pdf`, [PAGE]);
  await expect(use).toBeVisible();
  await expect(page.getByRole("button", { name: /^Signature 1/ })).toHaveCount(0);

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("a typed signature goes into a form's signature field, and initials beside it", async ({ page }) => {
  await openInEditor(page, "sign-pdf", "form.pdf", interactiveFormPdf());
  const toolbar = page.getByRole("toolbar", { name: "Editing tools" });
  await toolbar.getByRole("button", { name: "Select" }).click();
  await page.getByRole("button", { name: /^Sign here/ }).click();
  // No signature yet: the Sign tool opens to make one, and it goes in the field.
  await expect(toolbar.getByRole("button", { name: "Sign" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Type", exact: true }).click();
  await page.getByLabel("Your name").fill("Ama Mensah");
  await page.getByRole("button", { name: "Style: Caveat" }).click();
  await page.getByLabel(/Save it on this device/).uncheck();
  await page.getByRole("button", { name: "Use this signature" }).click();
  await expect(page.getByRole("button", { name: "Signature", exact: true })).toBeFocused();
  // Signed: the field no longer asks for it.
  await expect(page.getByRole("button", { name: /^Sign here/ })).toHaveCount(0);

  await toolbar.getByRole("button", { name: "Add initials" }).click();
  await page.getByRole("button", { name: "Type", exact: true }).click();
  await page.getByLabel("Your initials").fill("AM");
  await page.getByRole("button", { name: "Use these initials" }).click();
  await expect(page.getByRole("button", { name: /^Initials 1/ })).toHaveAttribute("aria-pressed", "true");
  await clickAt(page, 0, 300, 300, 400);
  await expect(page.getByRole("button", { name: "Initials", exact: true })).toBeFocused();

  const result = await saveEdits(page);
  const at = render(result.bytes);
  // Written inside the signature field's box, nowhere else near it.
  const [x0, y0, x1, y1] = FORM_FIELDS.sig;
  expect(darkIn(at, [x0, y0, x1, y1])).toBeGreaterThan(50);
  expect(darkIn(at, [x0, y1 + 1, x1, 400])).toBe(0);
  expect(darkIn(at, [280, 285, 320, 315])).toBeGreaterThan(20);
  expect(await qpdfCheck(result.bytes)).toBe(0);
});

/** A photo of a signature: two dark marks on white paper, with paper between them. */
function photographedSignature() {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 300, 120], false);
  pixmap.clear(250);
  const pixels = pixmap.getPixels();
  for (let y = 45; y < 75; y++) {
    for (const x0 of [20, 250]) {
      for (let x = x0; x < x0 + 30; x++) pixels.set([20, 20, 30], y * pixmap.getStride() + x * 3);
    }
  }
  const png = new Uint8Array(pixmap.asPNG());
  pixmap.destroy();
  return png;
}

test("an uploaded photo of a signature loses its paper", async ({ page }) => {
  await openInEditor(page, "sign-pdf", "photo.pdf", [PAGE]);
  await page.getByRole("button", { name: "Upload a picture" }).click();
  await page
    .getByLabel("Photo or scan of your signature")
    .setInputFiles({ name: "signature.png", mimeType: "image/png", buffer: Buffer.from(photographedSignature()) });
  await expect(page.getByLabel(/Take out the paper/)).toBeChecked();
  await page.getByRole("button", { name: "Use this signature" }).click();
  await expect(page.getByRole("button", { name: /^Signature 1/ })).toHaveAttribute("aria-pressed", "true");
  // On the page's red corner: the paper between the marks lets the red show through.
  await clickAt(page, 0, 100, 100, PAGE.width);
  await expect(page.getByRole("button", { name: "Signature", exact: true })).toBeFocused();
  const result = await saveEdits(page);
  const at = render(result.bytes);
  // 268 × 38 px of ink and margin, put 180 points wide from x = 10: the marks are at the ends.
  expect(isRed(at(100, 100))).toBe(true);
  expect(isDark(at(23, 100))).toBe(true);
  expect(isDark(at(177, 100))).toBe(true);
});
