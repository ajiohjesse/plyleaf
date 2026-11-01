// Header & footer: text at the top and bottom of each page, with the page details filled in.
import { expect, test } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { textLines } from "../helpers/editor";
import { asPayload, pdfFile } from "../helpers/files";
import { download } from "../helpers/organize";
import { A4 } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "header-canary-a2k";

test("adds a header and footer with the file name and page numbers, without sending anything", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/header-footer");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, [A4, A4])));
  // Filled in to start with: the file's name top left, "Page 1 of 2" bottom right.
  await expect(page.getByLabel("Header left")).toHaveValue("{file}");
  await page.getByLabel("Header right").fill("Annual report");
  await page.getByLabel("Footer right").fill("");
  await page.getByLabel("Footer centre").fill("- {page} -");
  await expect(page.locator("[data-preview]")).toContainText("Annual report");
  await expect(page.getByText("3 lines on pages 1–2.")).toBeVisible();

  await page.getByRole("button", { name: "Add header & footer" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-header-footer.pdf`);
  for (const index of [0, 1]) {
    const lines = textLines(result.bytes, index);
    const find = (text: string) => lines.find((line) => line.text === text)!;
    const file = find(`${SECRET}.pdf`);
    const title = find("Annual report");
    const number = find(`- ${index + 1} -`);
    // Top left and top right, 24 points in; the number centred at the bottom.
    expect(Math.abs(file.bbox.x - 24)).toBeLessThan(2);
    expect(file.bbox.y).toBeLessThan(40);
    expect(Math.abs(title.bbox.x + title.bbox.w - (A4.width - 24))).toBeLessThan(2);
    expect(Math.abs(number.bbox.x + number.bbox.w / 2 - A4.width / 2)).toBeLessThan(2);
    expect(number.bbox.y).toBeGreaterThan(A4.height - 40);
  }
  expect(await qpdfCheck(result.bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Header & footer/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/header-footer$/);
  await expect(page.getByRole("heading", { level: 1, name: "Header & footer" })).toBeVisible();
});
