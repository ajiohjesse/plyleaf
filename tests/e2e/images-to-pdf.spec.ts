// Images to PDF: images of every kind in (JPEG with EXIF orientation, PNG, lossy and lossless WebP, HEIC), one PDF
// out, with each page its image's size or fitted onto A4 with a margin. Also checks Merge takes images.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, dropFiles, pdfFile, type FileSpec } from "../helpers/files";
import { fixture, makeJpeg, makePng } from "../helpers/images";
import { A4 } from "../helpers/pdf";

const SECRET = "images-canary-p8w";

const fileList = (page: Page) => page.getByRole("list", { name: "Your files" }).getByRole("listitem");
const fileNames = (page: Page) => fileList(page).locator(".truncate");
const file = (name: string, mimeType: string, bytes: Uint8Array): FileSpec => ({
  name,
  mimeType,
  bytes: Array.from(bytes),
});

const images = [
  // Stored 400 × 200 but shown turned a quarter: a portrait page of 150 × 300 pt at 96 dpi.
  file(`${SECRET}-sideways.jpg`, "image/jpeg", makeJpeg(400, 200, { orientation: 6 })),
  file("logo.png", "image/png", makePng(64, 64)),
  file("iphone.heic", "image/heic", fixture("photo.heic")),
  file("photo.webp", "image/webp", fixture("photo.webp")),
  file("drawing.webp", "image/webp", fixture("drawing.webp")),
];

async function download(page: Page) {
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  return {
    name: saved.suggestedFilename(),
    doc: mupdf.Document.openDocument(await readFile((await saved.path())!), "application/pdf").asPDF()!,
  };
}

const sizes = (doc: mupdf.PDFDocument) =>
  Array.from({ length: doc.countPages() }, (_, i) => {
    const [x0, y0, x1, y1] = doc.loadPage(i).getBounds();
    return [Math.round(x1 - x0), Math.round(y1 - y0)];
  });

/** "red" or "white" at fractions of page `index`, rendered with MuPDF. */
function colourAt(doc: mupdf.PDFDocument, index: number, fx: number, fy: number) {
  const pixmap = doc.loadPage(index).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const x = Math.floor(fx * pixmap.getWidth());
  const y = Math.floor(fy * pixmap.getHeight());
  const i = y * pixmap.getStride() + x * 3;
  const [r, g, b] = pixmap.getPixels().slice(i, i + 3);
  pixmap.destroy();
  if (r! > 200 && g! < 70 && b! < 70) return "red";
  if (r! > 230 && g! > 230 && b! > 230) return "white";
  return `rgb(${r}, ${g}, ${b})`;
}

/** Each page's image XObject /Filter. */
const filters = (doc: mupdf.PDFDocument) =>
  Array.from({ length: doc.countPages() }, (_, i) => {
    let filter = "";
    const search = (resources: mupdf.PDFObject) =>
      resources.get("XObject").forEach((x) => {
        const object = x.resolve();
        if (object.get("Subtype").asName() === "Image") filter ||= object.get("Filter").toString();
        else search(object.get("Resources"));
      });
    search(doc.findPage(i).get("Resources"));
    return filter;
  });

test("turns images of every kind into one PDF, without sending them anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/jpg-to-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose files").setInputFiles(images.map(asPayload));
  await expect(fileList(page)).toHaveCount(5);
  await expect(page.getByText("5 images · 5 pages, in this order")).toBeVisible();
  await expect(fileList(page).locator('canvas[data-state="ready"]')).toHaveCount(5);
  await expect(fileList(page).first()).toContainText("Image ·");

  // Each page its image's size.
  await page.getByRole("button", { name: "Convert to PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const own = await download(page);
  expect(own.name).toBe(`${SECRET}-sideways-images.pdf`);
  expect(sizes(own.doc)).toEqual([
    [150, 300],
    [48, 48],
    [240, 180],
    [240, 180],
    [240, 180],
  ]);
  // The right way up (EXIF orientation applied), and the HEIC decoded.
  expect(colourAt(own.doc, 0, 0.75, 0.25)).toBe("red");
  expect(colourAt(own.doc, 0, 0.25, 0.25)).toBe("white");
  expect(colourAt(own.doc, 2, 0.25, 0.25)).toBe("red");
  expect(colourAt(own.doc, 2, 0.75, 0.75)).toBe("white");
  expect(colourAt(own.doc, 3, 0.25, 0.25)).toBe("red");
  // The JPEG is carried over; a lossy WebP and the HEIC become JPEG; the PNG and a lossless WebP stay lossless.
  expect(filters(own.doc)).toEqual(["/DCTDecode", "/FlateDecode", "/DCTDecode", "/DCTDecode", "/FlateDecode"]);

  // Fitted onto A4 with a large margin, each page turned to match its image.
  await page.getByRole("button", { name: "Back to your images" }).click();
  await expect(page.getByRole("button", { name: "Convert to PDF" })).toBeFocused();
  await page.getByText("A4", { exact: true }).click();
  await page.getByLabel("Margin").selectOption("large");
  await page.getByRole("button", { name: "Convert to PDF" }).click();
  const fitted = await download(page);
  expect(sizes(fitted.doc)).toEqual([
    [595, 842],
    [595, 842],
    [842, 595],
    [842, 595],
    [842, 595],
  ]);
  // The margin stays white; the sideways photo's red corner is still top right.
  expect(colourAt(fitted.doc, 0, 0.5, 0.02)).toBe("white");
  expect(colourAt(fitted.doc, 0, 0.7, 0.3)).toBe("red");

  // All portrait.
  await page.getByRole("button", { name: "Back to your images" }).click();
  await page.getByLabel("Orientation").selectOption("portrait");
  await page.getByRole("button", { name: "Convert to PDF" }).click();
  expect(sizes((await download(page)).doc).every(([w, h]) => w === 595 && h === 842)).toBe(true);

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("takes images only, and keeps them in the order chosen", async ({ page }) => {
  await page.goto("/jpg-to-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await dropFiles(page, "main", [images[1]!, pdfFile("report.pdf"), images[3]!]);
  await expect(page.getByRole("list", { name: "File messages" })).toContainText("report.pdf isn't an image.");
  await expect(fileNames(page)).toHaveText(["logo.png", "photo.webp"]);
  await page.getByRole("button", { name: "Move photo.webp up" }).click();
  await expect(fileNames(page)).toHaveText(["photo.webp", "logo.png"]);
  await page.getByRole("button", { name: "Convert to PDF" }).click();
  const { name, doc } = await download(page);
  expect(name).toBe("photo-images.pdf");
  expect(sizes(doc)).toEqual([
    [240, 180],
    [48, 48],
  ]);
});

test("says so when an image can't be read", async ({ page }) => {
  await page.goto("/jpg-to-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  const broken = file("broken.jpg", "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4]));
  await page.getByLabel("Choose files").setInputFiles([asPayload(broken)]);
  await expect(page.getByRole("list", { name: "File messages" })).toContainText(
    "broken.jpg couldn't be opened. It may be damaged, or a kind of image this browser can't read.",
  );
});

test("Merge takes images alongside PDFs", async ({ page }) => {
  await page.goto("/merge-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await expect(page.getByText("Drop PDFs or images here")).toBeVisible();
  await page.getByLabel("Choose files").setInputFiles([pdfFile("report.pdf", [A4]), images[2]!].map(asPayload));
  await expect(page.getByText("2 files · 2 pages, in this order")).toBeVisible();
  await page.getByRole("button", { name: "Merge PDFs" }).click();
  const { doc } = await download(page);
  expect(sizes(doc)).toEqual([
    [595, 842],
    [240, 180],
  ]);
  expect(colourAt(doc, 1, 0.25, 0.25)).toBe("red");
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Images to PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/jpg-to-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Images to PDF" })).toBeVisible();
});
