// Flatten PDF: form fields and annotations drawn into the page; links kept.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import { formsPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "flatten-canary-d2r";

test("flattens fields and annotations, without sending the file anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/flatten-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page
    .getByLabel("Choose a file")
    .setInputFiles(
      asPayload({ name: `${SECRET}-form.pdf`, mimeType: "application/pdf", bytes: Array.from(formsPdf()) }),
    );
  await expect(page.getByText("This PDF has 1 form field and 1 annotation")).toBeVisible();
  await page.getByRole("button", { name: "Flatten PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe(`${SECRET}-form-flattened.pdf`);
  const bytes = new Uint8Array(await readFile((await saved.path())!));
  const doc = new mupdf.PDFDocument(bytes);
  const flat = doc.loadPage(0);
  expect(flat.getAnnotations()).toHaveLength(0);
  expect(flat.getWidgets()).toHaveLength(0);
  expect(flat.getLinks()).toHaveLength(1);
  expect(await qpdfCheck(bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("says when there's nothing to flatten", async ({ page }) => {
  await page.goto("/flatten-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("plain.pdf")));
  await expect(page.getByText("plain.pdf has no form fields or annotations")).toBeVisible();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Flatten PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/flatten-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Flatten PDF" })).toBeVisible();
});
