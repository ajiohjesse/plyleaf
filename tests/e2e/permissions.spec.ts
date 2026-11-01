// Edit permissions: what a PDF allows, checked with MuPDF and qpdf.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile, type FileSpec } from "../helpers/files";
import { A4, encryptedPdf, makePdf } from "../helpers/pdf";
import { qpdfCheck, qpdfEncryption } from "../helpers/qpdf";

const SECRET = "permissions-canary-u8f";

async function openTool(page: Page, spec: FileSpec) {
  await page.goto("/pdf-permissions");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(spec));
  await expect(page.getByRole("button", { name: "Apply permissions" })).toBeVisible();
}

async function apply(page: Page) {
  await page.getByRole("button", { name: "Apply permissions" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  return { name: saved.suggestedFilename(), bytes: new Uint8Array(await readFile((await saved.path())!)) };
}

test("stops copying and changing, keeps printing, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET, "boss-pw-77"] });
  await openTool(page, pdfFile(`${SECRET}-report.pdf`));
  for (const label of ["Copying text and images", "Changing the content", "Adding comments and filling in forms"]) {
    await page.getByLabel(label).uncheck();
  }
  await page.getByLabel("Permissions password").fill("boss-pw-77");
  await page.getByLabel("Type it again").fill("boss-pw-77");
  await expect(page.getByText("3 things not allowed.")).toBeVisible();
  const { name, bytes } = await apply(page);
  expect(name).toBe(`${SECRET}-report-permissions.pdf`);
  expect(await qpdfEncryption(bytes)).toBe("restrictions");
  expect(await qpdfCheck(bytes)).toBe(0);
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  expect(doc.needsPassword()).toBe(false);
  expect(doc.hasPermission("print")).toBe(true);
  expect(doc.hasPermission("copy")).toBe(false);
  expect(doc.hasPermission("edit")).toBe(false);
  expect(doc.authenticatePassword("boss-pw-77")).toBe(4);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("unticking printing turns off full-quality printing too", async ({ page }) => {
  await openTool(page, pdfFile("a.pdf"));
  await page.getByLabel("Printing", { exact: true }).uncheck();
  await expect(page.getByLabel("Printing at full quality")).not.toBeChecked();
  await expect(page.getByLabel("Printing at full quality")).toBeDisabled();
});

test("allowing what a file didn't needs the rights check", async ({ page }) => {
  const restricted = encryptedPdf(makePdf([A4]), { owner: "x", permissions: -3904 | 4 });
  await openTool(page, { name: "locked-down.pdf", mimeType: "application/pdf", bytes: Array.from(restricted) });
  await expect(page.getByLabel("Copying text and images")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Apply permissions" })).toBeEnabled();
  await page.getByLabel("Copying text and images").check();
  await expect(page.getByRole("button", { name: "Apply permissions" })).toBeDisabled();
  await page.getByLabel(/I own this PDF/).check();
  const { bytes } = await apply(page);
  expect(mupdf.Document.openDocument(bytes, "application/pdf").hasPermission("copy")).toBe(true);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Edit permissions/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/pdf-permissions$/);
  await expect(page.getByRole("heading", { level: 1, name: "Edit permissions" })).toBeVisible();
});
