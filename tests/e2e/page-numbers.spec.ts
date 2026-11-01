// Page numbers: numbered from a page on, in a format and position, checked in the downloaded file.
import { expect, test } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { textLines } from "../helpers/editor";
import { asPayload, pdfFile } from "../helpers/files";
import { download } from "../helpers/organize";
import { A4 } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "numbers-canary-b8s";

test("numbers pages from the second on, without sending the file anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/add-page-numbers");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, [A4, A4, A4])));
  await page.getByLabel("Format").selectOption({ label: "Page 1 of 9" });
  await page.getByLabel("From page").fill("2");
  await page.getByRole("radio", { name: "Top right" }).check();
  // The preview shows the first numbered page with its number.
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(page.locator("[data-preview]")).toContainText("Page 1 of 2");
  await expect(page.getByText("Pages 2–3 numbered from 1.")).toBeVisible();

  await page.getByRole("button", { name: "Add page numbers" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-numbered.pdf`);
  const numbers = (index: number) => textLines(result.bytes, index).filter((line) => line.text.startsWith("Page "));
  // makePdf's own "Page N" labels are near the bottom; the numbers are at the top right.
  const top = (index: number) => numbers(index).filter((line) => line.bbox.y < 100);
  expect(top(0)).toEqual([]);
  expect(top(1).map((line) => line.text)).toEqual(["Page 1 of 2"]);
  expect(top(2).map((line) => line.text)).toEqual(["Page 2 of 2"]);
  const [label] = top(1);
  // Right-aligned 28 points in from the edge.
  expect(Math.abs(label!.bbox.x + label!.bbox.w - (A4.width - 28))).toBeLessThan(2);
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("numbers can be words of your own, and need {page}", async ({ page }) => {
  await page.goto("/add-page-numbers");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("own.pdf", [A4, A4])));
  await page.getByLabel("Format").selectOption({ label: "Your own words…" });
  await page.getByLabel("Words").fill("Sheet");
  await expect(page.getByRole("button", { name: "Add page numbers" })).toBeDisabled();
  await page.getByLabel("Words").fill("Sheet {page}");
  await page.getByLabel("First number").fill("5");
  await page.getByRole("button", { name: "Add page numbers" }).click();
  const result = await download(page);
  expect(textLines(result.bytes, 1).map((line) => line.text)).toContain("Sheet 6");
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Page numbers/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/add-page-numbers$/);
  await expect(page.getByRole("heading", { level: 1, name: "Page numbers" })).toBeVisible();
});
