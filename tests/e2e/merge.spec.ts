// Merge PDF: the landing page, putting files in order (buttons, keyboard drag, pointer drag), merging and the result.
// Runs against the production build or a deployed site; every test that handles files also checks egress (D-020).
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, dropFiles, pdfFile } from "../helpers/files";
import { A4, LETTER } from "../helpers/pdf";

const LANDSCAPE = { width: 842, height: 595 };
// A name that can't turn up in a request by chance (see egress.spec.ts).
const SECRET = "merge-canary-k3v";

const fileList = (page: Page) => page.getByRole("list", { name: "Your files" }).getByRole("listitem");
const fileNames = (page: Page) => fileList(page).locator(".truncate");

async function openMerge(page: Page) {
  await page.goto("/merge-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
}

/** Opens the downloaded file with MuPDF and lists its page sizes, in order. */
async function pageSizes(path: string) {
  const doc = mupdf.Document.openDocument(await readFile(path), "application/pdf");
  const sizes = Array.from({ length: doc.countPages() }, (_, i) => {
    const [x0, y0, x1, y1] = doc.loadPage(i).getBounds();
    return { width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
  });
  doc.destroy();
  return sizes;
}

test("merges PDFs in the order chosen and downloads one file, without sending the files anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openMerge(page);
  await page
    .getByLabel("Choose files")
    .setInputFiles([pdfFile(`${SECRET}-a.pdf`, [A4, A4]), pdfFile(`${SECRET}-b.pdf`, [LETTER])].map(asPayload));
  await dropFiles(page, "main", [pdfFile("cover.pdf", [LANDSCAPE])]);
  await expect(fileList(page)).toHaveCount(3);
  await expect(page.getByText("3 files · 4 pages, in this order")).toBeVisible();
  // Each file shows its first page.
  await expect(fileList(page).locator('canvas[data-state="ready"]')).toHaveCount(3);

  // The cover goes first: up twice, from the keyboard. Focus stays on the button even once it can't go further.
  // (Safari doesn't focus buttons on click, so a click alone wouldn't show this.)
  const coverUp = page.getByRole("button", { name: "Move cover.pdf up" });
  await coverUp.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(fileNames(page)).toHaveText(["cover.pdf", `${SECRET}-a.pdf`, `${SECRET}-b.pdf`]);
  await expect(coverUp).toBeFocused();
  await expect(coverUp).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(fileNames(page).first()).toHaveText("cover.pdf");
  await expect(page.getByText("cover.pdf is now file 1 of 3.")).toBeAttached();

  await page.getByRole("button", { name: "Merge PDFs" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  await expect(page.getByText("cover-merged.pdf")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("cover-merged.pdf");
  expect(await pageSizes((await download.path())!)).toEqual([LANDSCAPE, A4, A4, LETTER]);

  // Back to the files, still open and in order, and merge again after removing one.
  await page.getByRole("button", { name: "Back to your files" }).click();
  await expect(page.getByRole("button", { name: "Merge PDFs" })).toBeFocused();
  await page.getByRole("button", { name: `Remove ${SECRET}-a.pdf` }).click();
  await expect(fileNames(page)).toHaveText(["cover.pdf", `${SECRET}-b.pdf`]);
  await page.getByRole("button", { name: "Merge PDFs" }).click();
  const [second] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(await pageSizes((await second.path())!)).toEqual([LANDSCAPE, LETTER]);

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("reorders files by dragging, with the keyboard or the pointer", async ({ page }) => {
  await openMerge(page);
  await page
    .getByLabel("Choose files")
    .setInputFiles([pdfFile("one.pdf"), pdfFile("two.pdf"), pdfFile("three.pdf")].map(asPayload));
  await expect(fileList(page).locator('canvas[data-state="ready"]')).toHaveCount(3);

  // Keyboard: pick up "three", move it up twice, drop it. Each step is announced; wait for it before the next.
  const announced = (text: string) => expect(page.getByText(text)).toBeAttached();
  await page.getByRole("button", { name: "Drag three.pdf" }).focus();
  await page.keyboard.press("Space");
  await announced("Picked up three.pdf, file 3 of 3.");
  await page.keyboard.press("ArrowUp");
  await announced("three.pdf is over position 2 of 3.");
  await page.keyboard.press("ArrowUp");
  await announced("three.pdf is over position 1 of 3.");
  await page.keyboard.press("Space");
  await announced("three.pdf dropped at position 1 of 3.");
  await expect(fileNames(page)).toHaveText(["three.pdf", "one.pdf", "two.pdf"]);

  // Pointer: drag "three" by its handle down onto the last row.
  const handle = page.getByRole("button", { name: "Drag three.pdf" });
  const from = (await handle.boundingBox())!;
  const to = (await fileList(page).last().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Several steps, so the drag starts (it needs a few pixels of movement) and follows the pointer.
  await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.75, { steps: 12 });
  await page.mouse.up();
  await expect(fileNames(page)).toHaveText(["one.pdf", "two.pdf", "three.pdf"]);
});

test("waits for a second PDF, and loads no engine before a file arrives", async ({ page }) => {
  const engineRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.wasm$|\/worker-[^/]*\.js$/.test(new URL(request.url()).pathname)) engineRequests.push(request.url());
  });
  await openMerge(page);
  await expect(page.getByRole("heading", { level: 1, name: "Merge PDF" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(engineRequests).toEqual([]);

  await page.getByLabel("Choose files").setInputFiles(asPayload(pdfFile("only.pdf")));
  await expect(fileList(page)).toHaveCount(1);
  await expect(page.getByText("Add at least one more PDF to merge.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Merge PDFs" })).toBeDisabled();
  // Not a PDF: said so, and nothing else changes.
  await page
    .getByLabel("Choose files")
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("list", { name: "File messages" })).toContainText("notes.txt isn't a PDF.");
  await expect(fileList(page)).toHaveCount(1);
});

test("is linked from the home page tool grid", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Merge PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/merge-pdf$/);
  await expect(page).toHaveTitle("Merge PDF files free, no sign-up · Plyleaf");
});
