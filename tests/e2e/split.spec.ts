// Split PDF: the landing page, splitting by ranges and every N pages, the zip and single-PDF results, and errors.
// Runs against the production build or a deployed site; every test that handles files also checks egress (D-020).
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, dropFiles, pdfFile } from "../helpers/files";

// A name that can't turn up in a request by chance (see egress.spec.ts).
const SECRET = "split-canary-q8w";
/** Ten pages, each a different width, so a part's pages can be told apart by size. */
const TEN = Array.from({ length: 10 }, (_, i) => ({ width: 300 + i * 10, height: 500 }));
const widthsOf = (...pages: number[]) => pages.map((page) => 300 + (page - 1) * 10);

async function openSplit(page: Page) {
  await page.goto("/split-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
}

function pageWidths(bytes: Uint8Array) {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const widths = Array.from({ length: doc.countPages() }, (_, i) => {
    const [x0, , x1] = doc.loadPage(i).getBounds();
    return Math.round(x1 - x0);
  });
  doc.destroy();
  return widths;
}

async function download(page: Page) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  return { name: file.suggestedFilename(), bytes: new Uint8Array(await readFile((await file.path())!)) };
}

test("splits by page ranges into a zip of PDFs, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openSplit(page);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, TEN)));
  await expect(page.getByText("10 pages ·")).toBeVisible();
  // It suggests halves, and shows the files that makes.
  const ranges = page.getByLabel("Pages for each file");
  await expect(ranges).toHaveValue("1-5, 6-10");
  const preview = page.getByRole("list", { name: "Files you'll get" }).getByRole("listitem");
  await expect(preview).toHaveText(["1 · pages 1–5, 5 pages", "2 · pages 6–10, 5 pages"]);

  await ranges.fill("1-3, 5, 8-");
  await expect(preview).toHaveText(["1 · pages 1–3, 3 pages", "2 · page 5, 1 page", "3 · pages 8–10, 3 pages"]);
  await expect(page.getByText("3 PDFs, downloaded as one zip")).toBeVisible();
  await page.getByRole("button", { name: "Split PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  await expect(page.getByText("3 PDFs in one zip file")).toBeVisible();
  const zip = await download(page);
  expect(zip.name).toBe(`${SECRET}-split.zip`);
  const parts = unzipSync(zip.bytes);
  expect(Object.keys(parts)).toEqual([`${SECRET}-pages-1-3.pdf`, `${SECRET}-page-5.pdf`, `${SECRET}-pages-8-10.pdf`]);
  expect(Object.values(parts).map(pageWidths)).toEqual([widthsOf(1, 2, 3), widthsOf(5), widthsOf(8, 9, 10)]);

  // Back to the file, still open, and split again: one range is one PDF, no zip.
  await page.getByRole("button", { name: "Back to your file" }).click();
  await expect(page.getByRole("button", { name: "Split PDF" })).toBeFocused();
  await ranges.fill("4-6");
  await expect(page.getByText("1 PDF", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Split PDF" }).click();
  const single = await download(page);
  expect(single.name).toBe(`${SECRET}-pages-4-6.pdf`);
  expect(pageWidths(single.bytes)).toEqual(widthsOf(4, 5, 6));

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("splits every N pages, the last part taking what's left", async ({ page }) => {
  await openSplit(page);
  await dropFiles(page, "main", [pdfFile("book.pdf", TEN)]);
  await page.getByRole("radio", { name: /Every N pages/ }).check();
  const size = page.getByLabel("Pages per file");
  await expect(size).toHaveValue("1");
  await expect(page.getByText("You'll get 10 files:")).toBeVisible();
  await expect(page.getByText("and 2 more")).toBeVisible();
  await size.fill("4");
  const preview = page.getByRole("list", { name: "Files you'll get" }).getByRole("listitem");
  await expect(preview).toHaveText(["1 · pages 1–4, 4 pages", "2 · pages 5–8, 4 pages", "3 · pages 9–10, 2 pages"]);
  await page.getByRole("button", { name: "Split PDF" }).click();
  const parts = unzipSync((await download(page)).bytes);
  expect(Object.keys(parts)).toEqual(["book-pages-1-4.pdf", "book-pages-5-8.pdf", "book-pages-9-10.pdf"]);
  expect(Object.values(parts).map(pageWidths)).toEqual([widthsOf(1, 2, 3, 4), widthsOf(5, 6, 7, 8), widthsOf(9, 10)]);
});

test("says what's wrong with the pages, and won't split until it's fixed", async ({ page }) => {
  await openSplit(page);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("short.pdf", TEN.slice(0, 4))));
  const ranges = page.getByLabel("Pages for each file");
  const button = page.getByRole("button", { name: "Split PDF" });
  await ranges.fill("1-2, 7");
  await expect(ranges).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("This file has 4 pages, so there's no page 7.")).toBeVisible();
  await expect(button).toBeDisabled();
  await ranges.fill("3-1");
  await expect(page.getByText("“3-1” goes backwards. Try 1-3.")).toBeVisible();
  await ranges.fill("1-2, 3-");
  await expect(button).toBeEnabled();

  await page.getByRole("radio", { name: /Every N pages/ }).check();
  await page.getByLabel("Pages per file").fill("4");
  await expect(page.getByText("That would be the whole file. Choose fewer than 4 pages.")).toBeVisible();
  await expect(button).toBeDisabled();

  // A one-page file has nothing to split; a different file swaps in.
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("one.pdf")));
  await expect(page.getByText("This file has only one page, so there's nothing to split.")).toBeVisible();
  await expect(page.getByText("one.pdf")).toBeVisible();
  await expect(page.getByText("short.pdf")).toHaveCount(0);
  // Not a PDF: said so.
  await page
    .getByLabel("Choose a file")
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("list", { name: "File messages" })).toContainText("notes.txt isn't a PDF.");
});

test("loads no engine before a file arrives", async ({ page }) => {
  const engineRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.wasm$|\/worker-[^/]*\.js$/.test(new URL(request.url()).pathname)) engineRequests.push(request.url());
  });
  // Loaded directly: arriving by a click would leave the pointer over the drop zone, and hovering it preloads the
  // engine on purpose.
  await openSplit(page);
  await expect(page.getByRole("heading", { level: 1, name: "Split PDF" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(engineRequests).toEqual([]);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Split PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/split-pdf$/);
  await expect(page).toHaveTitle("Split PDF files free, no sign-up · Plyleaf");
});
