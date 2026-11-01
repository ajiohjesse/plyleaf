// Watermark: words or a picture over every page, see-through and turned, checked in the downloaded file.
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { textLines } from "../helpers/editor";
import { asPayload, pdfFile } from "../helpers/files";
import { makePng } from "../helpers/images";
import { download } from "../helpers/organize";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "watermark-canary-u4p";
// White pages (apart from makePdf's red top-left quarter).
const PAGE = { width: 400, height: 400 };

function colourAt(bytes: Uint8Array, index: number, x: number, y: number) {
  const doc = new mupdf.PDFDocument(bytes);
  const pixmap = doc.loadPage(index).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const i = y * pixmap.getStride() + x * 3;
  const rgb = Array.from(pixmap.getPixels().subarray(i, i + 3));
  doc.destroy();
  return rgb;
}

test("puts see-through words across every page, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/watermark-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, [PAGE, PAGE])));
  await page.getByLabel("Words", { exact: true }).fill("SAMPLE");
  await page.getByLabel("Angle").selectOption({ label: "Level" });
  await page.getByLabel("See-through").selectOption({ label: "50% strong" });
  await expect(page.locator("[data-preview]")).toContainText("SAMPLE");

  await page.getByRole("button", { name: "Add watermark" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-watermarked.pdf`);
  for (const index of [0, 1]) {
    const word = textLines(result.bytes, index).find((line) => line.text === "SAMPLE")!;
    // Level, centred on the page.
    expect(word.bbox.w).toBeGreaterThan(word.bbox.h);
    expect(Math.abs(word.bbox.x + word.bbox.w / 2 - 200)).toBeLessThan(3);
    expect(Math.abs(word.bbox.y + word.bbox.h / 2 - 200)).toBeLessThan(10);
  }
  // Half-strength red over white is pink: the page shows through.
  let pink = false;
  for (let x = 140; x < 260 && !pink; x++) {
    const [r, g, b] = colourAt(result.bytes, 0, x, 200);
    if (r! > 230 && g! > 100 && g! < 160 && b! > 100 && b! < 170) pink = true;
  }
  expect(pink).toBe(true);
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("a picture watermark, turned, from the second page", async ({ page }) => {
  await page.goto("/watermark-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("logo.pdf", [PAGE, PAGE, PAGE])));
  await page.getByRole("radio", { name: /Picture/ }).check();
  await expect(page.getByRole("button", { name: "Add watermark" })).toBeDisabled();
  await page
    .getByLabel("Picture", { exact: true })
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(makePng(100, 100)) });
  await page.getByLabel("See-through").selectOption({ label: "Solid" });
  await page.getByLabel("From page").fill("2");
  await expect(page.locator("[data-preview] img")).toHaveCount(1);
  await page.getByRole("button", { name: "Add watermark" }).click();
  const result = await download(page);
  const doc = new mupdf.PDFDocument(result.bytes);
  const saved = new TextDecoder("latin1").decode(doc.saveToBuffer("").asUint8Array());
  doc.destroy();
  // One image object, used on pages 2 and 3.
  expect(saved.match(/\/Subtype\s*\/Image/g)).toHaveLength(1);
  // Half the page wide (200 points) round the middle, turned 45°: the middle shows the picture, page 1 doesn't.
  expect(colourAt(result.bytes, 0, 200, 200)).toEqual([255, 255, 255]);
  expect(colourAt(result.bytes, 1, 200, 200)).not.toEqual([255, 255, 255]);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /^Watermark/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/watermark-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Watermark" })).toBeVisible();
});
