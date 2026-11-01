// Bates numbering: a prefix and zero-padded number on every page, counted up, checked in the downloaded file.
import { expect, test } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { textLines } from "../helpers/editor";
import { asPayload, pdfFile } from "../helpers/files";
import { download } from "../helpers/organize";
import { A4 } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "bates-canary-w3e";

test("numbers every page with a prefix, padded, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/bates-numbering");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, [A4, A4, A4])));
  await page.getByLabel("Prefix").fill("ACME");
  await page.getByLabel("First number").fill("120");
  await page.getByLabel("Digits").fill("5");
  await expect(page.getByText("ACME00120 to ACME00122")).toBeVisible();
  await expect(page.locator("[data-preview]")).toContainText("ACME00120");

  await page.getByRole("button", { name: "Add Bates numbers" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  await expect(page.getByText("The next file starts at 123.")).toBeVisible();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-bates.pdf`);
  for (const index of [0, 1, 2]) {
    const label = textLines(result.bytes, index).find((line) => line.text.startsWith("ACME"))!;
    expect(label.text).toBe(`ACME0012${index}`);
    // Bottom right, 24 points in.
    expect(Math.abs(label.bbox.x + label.bbox.w - (A4.width - 24))).toBeLessThan(2);
    expect(label.bbox.y).toBeGreaterThan(A4.height - 40);
  }
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Bates numbering/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/bates-numbering$/);
  await expect(page.getByRole("heading", { level: 1, name: "Bates numbering" })).toBeVisible();
});
