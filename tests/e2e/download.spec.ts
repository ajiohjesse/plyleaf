import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import "../helpers/harness";
import { A4, LETTER, makePdf } from "../helpers/pdf";

// The harness page is only built for local E2E runs, not deployed.
test.skip(!!process.env["BASE_URL"], "needs the test-harness build");

const pdf = (name: string, pages = [A4]) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(makePdf(pages)),
});

async function openHarness(page: Page) {
  await page.goto("/test-harness/download");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
}

const fileList = (page: Page) => page.getByRole("list", { name: "Your files" }).getByRole("listitem");
const notices = (page: Page) => page.getByRole("list", { name: "File messages" }).getByRole("listitem");

test("combines the open files and downloads the result under a sensible name", async ({ page }) => {
  await openHarness(page);
  await page.getByLabel("Choose files").setInputFiles([pdf("Q3 report.pdf", [A4, LETTER]), pdf("appendix.pdf")]);
  await expect(fileList(page)).toHaveCount(2);
  await expect(fileList(page).last()).toContainText("1 page");

  await page.getByRole("button", { name: "Combine into one PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeVisible();
  await expect(page.getByText("Q3 report-combined.pdf")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  // WebKit on Linux swaps spaces in a download's name for underscores (it keeps them on Windows and macOS).
  expect(download.suggestedFilename()).toMatch(/^Q3[ _]report-combined\.pdf$/);
  const bytes = await readFile((await download.path())!);
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  expect(doc.countPages()).toBe(3);
  doc.destroy();

  // Back to the files, which are still open.
  await page.getByRole("button", { name: "Back to files" }).click();
  await expect(fileList(page)).toHaveCount(2);
});

test("saves where the user picks, in browsers that can ask", async ({ page }) => {
  // Stand in for the native dialog (Chromium's showSaveFilePicker), so every browser can run this path.
  await page.addInitScript(() => {
    const saved: { name: string; size: number }[] = [];
    Object.assign(window, {
      savedFiles: saved,
      showSaveFilePicker: async ({ suggestedName }: { suggestedName: string }) => ({
        createWritable: async () => ({
          write: async (data: Blob) => void saved.push({ name: suggestedName, size: data.size }),
          close: async () => {},
        }),
      }),
    });
  });
  await openHarness(page);
  await page.getByLabel("Choose files").setInputFiles([pdf("letter.pdf")]);
  await page.getByRole("button", { name: "Combine into one PDF" }).click();
  await page.getByRole("button", { name: "Save as…" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved letter-copy.pdf.");
  const saved = await page.evaluate(() => (window as unknown as { savedFiles: { name: string }[] }).savedFiles);
  expect(saved).toMatchObject([{ name: "letter-copy.pdf" }]);
});

test("only offers Save as where the browser supports it", async ({ page, browserName }) => {
  await openHarness(page);
  await page.getByLabel("Choose files").setInputFiles([pdf("letter.pdf")]);
  await page.getByRole("button", { name: "Combine into one PDF" }).click();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible();
  const supported = await page.evaluate(() => "showSaveFilePicker" in window);
  await expect(page.getByRole("button", { name: "Save as…" })).toHaveCount(supported ? 1 : 0);
  if (browserName !== "chromium") expect(supported).toBe(false);
});

test("warns when the files add up to a lot, but still takes them", async ({ page }) => {
  await openHarness(page);
  // The harness warns above 20 KB.
  const big = pdf(
    "big.pdf",
    Array.from({ length: 200 }, () => A4),
  );
  expect(big.buffer.length).toBeGreaterThan(20_000);
  await page.getByLabel("Choose files").setInputFiles([big]);
  await expect(notices(page)).toHaveText([/^Together your files are \d+ KB\. That's a lot for a browser/]);
  await expect(notices(page).first()).toHaveAttribute("data-tone", "warning");
  await expect(fileList(page)).toHaveText([/big\.pdf\s*200 pages/]);
});

test("says so when the engine can't load, and works once it can", async ({ page }) => {
  await page.route(/\.wasm$/, (route) => route.abort("internetdisconnected"));
  await openHarness(page);
  await page.getByLabel("Choose files").setInputFiles([pdf("a.pdf"), pdf("b.pdf")]);
  // Said once, not once per file.
  await expect(notices(page)).toHaveText([
    "Plyleaf couldn't load its PDF engine. Check your internet connection and try again (it's only needed once).",
  ]);
  await expect(fileList(page)).toHaveCount(0);

  await page.unroute(/\.wasm$/);
  await page.getByLabel("Choose files").setInputFiles([pdf("a.pdf")]);
  await expect(fileList(page)).toHaveText([/a\.pdf\s*1 page/]);
  await expect(notices(page)).toHaveCount(0);
});

test("says so when the engine worker itself can't load, and starts a new one next time", async ({ page }) => {
  await page.route(/\/worker-[^/]*\.js$/, (route) => route.abort("internetdisconnected"));
  await openHarness(page);
  await page.getByLabel("Choose files").setInputFiles([pdf("a.pdf")]);
  await expect(notices(page)).toHaveText([/^Plyleaf couldn't load its PDF engine\./]);
  expect(await page.evaluate(() => window.harness.engine.stats().running)).toBe(false);

  await page.unroute(/\/worker-[^/]*\.js$/);
  await page.getByLabel("Choose files").setInputFiles([pdf("a.pdf")]);
  await expect(fileList(page)).toHaveText([/a\.pdf\s*1 page/]);
});
