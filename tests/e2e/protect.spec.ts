// Protect PDF: a password to open, AES-256, checked with qpdf.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import { qpdfCheck, qpdfEncryption, qpdfOpens } from "../helpers/qpdf";

const SECRET = "protect-canary-z7k";
// The password counts as a secret too: it must never show up in a request.
const PASSWORD = "plyleaf-pw-s3cr3t";

async function openTool(page: Page) {
  await page.goto("/protect-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}-contract.pdf`)));
  await expect(page.getByRole("button", { name: "Protect PDF" })).toBeEnabled();
}

test("encrypts with the password, without sending the file or password anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET, PASSWORD] });
  await openTool(page);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Type it again").fill(PASSWORD);
  await page.getByRole("button", { name: "Protect PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe(`${SECRET}-contract-protected.pdf`);
  const output = new Uint8Array(await readFile((await saved.path())!));
  expect(await qpdfEncryption(output, PASSWORD)).toBe("password");
  expect(await qpdfOpens(output, PASSWORD)).toBe(true);
  expect(await qpdfOpens(output, "guess")).toBe(false);
  expect(await qpdfCheck(output, PASSWORD)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("asks for a password typed the same twice, without commas", async ({ page }) => {
  await openTool(page);
  await page.getByRole("button", { name: "Protect PDF" }).click();
  await expect(page.getByText("Type a password.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("one,two");
  await expect(page.getByText("Passwords can't contain a comma.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("onetwo");
  await page.getByLabel("Type it again").fill("onethree");
  await expect(page.getByText("The passwords don't match.")).toBeVisible();
  await expect(page.getByLabel("Type it again")).toHaveAttribute("type", "password");
  await page.getByLabel("Show passwords").check();
  await expect(page.getByLabel("Type it again")).toHaveAttribute("type", "text");
  await page.getByLabel("Type it again").fill("onetwo");
  await expect(page.getByText("The passwords don't match.")).toHaveCount(0);
  await page.getByLabel("Type it again").press("Enter");
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeVisible();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Protect PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/protect-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Protect PDF" })).toBeVisible();
});
