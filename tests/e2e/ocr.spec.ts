// OCR PDF: a scanned page read in the browser (Tesseract's WASM and English reading data from our own origin) and
// given invisible text where its words are, so the download can be searched; pages that have text are left alone.
import { expect, test } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { textLines } from "../helpers/editor";
import { download } from "../helpers/organize";
import { scannedPdf, textPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "ocr-canary-w2r";
const LINES = ["Invoice number 4821", "Payment is due within thirty days"];

async function open(page: import("@playwright/test").Page, name: string, bytes: Uint8Array) {
  await page.goto("/ocr-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page
    .getByLabel("Choose a file")
    .setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
}

test("a scan becomes searchable where its words are, with nothing sent but our own files", async ({
  page,
  context,
  baseURL,
}) => {
  // Reading takes a few seconds; the first time also loads 4 MB of WASM and 3 MB of English.
  test.setTimeout(120_000);
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  // A scan with no text, then the same lines as real text (to compare where the words land).
  await open(page, `${SECRET}.pdf`, scannedPdf(LINES));
  await expect(page.getByText("1 page to read.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /English/ })).toBeChecked();
  await page.getByRole("button", { name: "Make it searchable" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/words? read on 1 page, now searchable/)).toBeVisible();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-ocr.pdf`);
  expect(await qpdfCheck(result.bytes)).toBe(0);

  const lines = textLines(result.bytes, 0);
  expect(lines.map((line) => line.text.trim())).toEqual(LINES);
  // The words sit where the picture shows them: 72 points in, the first baseline 100 points down.
  const [first] = lines;
  expect(first!.bbox.x).toBeGreaterThan(68);
  expect(first!.bbox.x).toBeLessThan(76);
  expect(first!.bbox.y).toBeGreaterThan(84);
  expect(first!.bbox.y + first!.bbox.h).toBeLessThan(108);

  // Tesseract's worker, its WASM and the reading data all came from here, with nothing sent.
  const urls = egress.requests.map((request) => request.url());
  expect(urls.some((url) => /tesseract-core-.*lstm\.wasm\..*\.js$/.test(url))).toBe(true);
  expect(urls.some((url) => url.endsWith("/ocr/tessdata/4.0.0_best_int/eng.traineddata.gz"))).toBe(true);
  expect(egress.problems()).toEqual([]);
});

test("pages with text are left alone unless asked; languages can be chosen, up to three", async ({ page }) => {
  await open(page, "typed.pdf", textPdf(["Already searchable"]));
  await expect(page.getByText(/Every page already has text you can search/)).toBeVisible();
  const start = page.getByRole("button", { name: "Make it searchable" });
  await expect(start).toBeDisabled();
  await page.getByLabel(/Also read pages that have text/).check();
  await expect(page.getByText("1 page to read.")).toBeVisible();
  await expect(start).toBeEnabled();

  await page.getByRole("checkbox", { name: /French/ }).check();
  await page.getByRole("checkbox", { name: /German/ }).check();
  await expect(page.getByRole("checkbox", { name: /Spanish/ })).toBeDisabled();
  await page.getByRole("checkbox", { name: /English/ }).uncheck();
  await expect(page.getByRole("checkbox", { name: /Spanish/ })).toBeEnabled();
  await page.getByRole("checkbox", { name: /French/ }).uncheck();
  await page.getByRole("checkbox", { name: /German/ }).uncheck();
  await expect(page.getByText("Choose the language the document is in.")).toBeVisible();
  await expect(start).toBeDisabled();
});
