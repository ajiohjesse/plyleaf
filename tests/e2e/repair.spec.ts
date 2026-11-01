// Repair PDF: a cut-off file rebuilt into one that qpdf finds sound.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import { truncatedPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "repair-canary-b6v";

test("rebuilds a cut-off PDF, without sending it anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/repair-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page
    .getByLabel("Choose a file")
    .setInputFiles(
      asPayload({ name: `${SECRET}-download.pdf`, mimeType: "application/pdf", bytes: Array.from(truncatedPdf(3)) }),
    );
  await expect(page.getByText("was damaged. Plyleaf rebuilt its structure and found 3 pages.")).toBeVisible();
  await page.getByRole("button", { name: "Save repaired PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe(`${SECRET}-download-repaired.pdf`);
  const bytes = new Uint8Array(await readFile((await saved.path())!));
  expect(await qpdfCheck(bytes)).toBe(0);
  expect(mupdf.Document.openDocument(bytes, "application/pdf").countPages()).toBe(3);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("says when a file has no damage", async ({ page }) => {
  await page.goto("/repair-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("fine.pdf")));
  await expect(page.getByText("Plyleaf found no damage in fine.pdf's structure.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save a clean copy" })).toBeEnabled();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Repair PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/repair-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Repair PDF" })).toBeVisible();
});
