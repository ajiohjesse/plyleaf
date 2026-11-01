// Unlock PDF: a password you know removed; restrictions removed only after the rights check.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile, type FileSpec } from "../helpers/files";
import { A4, encryptedPdf, makePdf } from "../helpers/pdf";
import { qpdfCheck, qpdfEncryption } from "../helpers/qpdf";

const SECRET = "unlock-canary-m3x";
const PASSWORD = "plyleaf-open-9q";
const file = (name: string, bytes: Uint8Array): FileSpec => ({
  name,
  mimeType: "application/pdf",
  bytes: Array.from(bytes),
});

async function openTool(page: Page, spec: FileSpec) {
  await page.goto("/unlock-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(spec));
}

async function download(page: Page) {
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  return { name: saved.suggestedFilename(), bytes: new Uint8Array(await readFile((await saved.path())!)) };
}

test("removes a password once it's typed, without sending the file or password anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET, PASSWORD] });
  const locked = encryptedPdf(makePdf([A4, A4]), { user: PASSWORD, owner: "owner-x" });
  await openTool(page, file(`${SECRET}-statement.pdf`, locked));
  await expect(page.getByText("is protected with a password. Type it to open the file.")).toBeVisible();
  await page.getByLabel("Password to open").fill("guess");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("That password didn't open it.")).toBeVisible();
  await expect(page.getByLabel("Password to open")).toBeFocused();
  await page.getByLabel("Password to open").fill(PASSWORD);
  await page.getByLabel("Password to open").press("Enter");
  await expect(page.getByText("Opened with its password.")).toBeVisible();
  await page.getByRole("button", { name: "Remove password" }).click();
  const { name, bytes } = await download(page);
  expect(name).toBe(`${SECRET}-statement-unlocked.pdf`);
  expect(await qpdfEncryption(bytes)).toBe("none");
  expect(await qpdfCheck(bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("removes restrictions only after confirming the right to", async ({ page }) => {
  // Opens freely; printing allowed (bit 3), nothing else.
  const restricted = encryptedPdf(makePdf([A4]), { owner: "owner-x", permissions: -3904 | 4 });
  await openTool(page, file("handbook.pdf", restricted));
  await expect(page.getByText("handbook.pdf opens without a password, but it has restrictions.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Restrictions" })).toContainText("Copying text and images");
  await expect(page.getByRole("list", { name: "Restrictions" })).not.toContainText(/^Printing$/);
  const remove = page.getByRole("button", { name: "Remove restrictions" });
  await expect(remove).toBeDisabled();
  await page.getByLabel(/I own this PDF/).check();
  await remove.click();
  const { bytes } = await download(page);
  expect(await qpdfEncryption(bytes)).toBe("none");
});

test("says when there's nothing to unlock", async ({ page }) => {
  await openTool(page, pdfFile("plain.pdf"));
  await expect(page.getByText("plain.pdf isn't protected")).toBeVisible();
});

test("other tools say to unlock first", async ({ page }) => {
  await page.goto("/split-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page
    .getByLabel("Choose a file")
    .setInputFiles(asPayload(file("locked.pdf", encryptedPdf(makePdf([A4]), { user: "a", owner: "b" }))));
  await expect(page.getByRole("list", { name: "File messages" })).toContainText("Remove it with Unlock PDF first");
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Unlock PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/unlock-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Unlock PDF" })).toBeVisible();
});
