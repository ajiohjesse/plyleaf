// Duplicate pages: copy single pages and a selection, remove copies, and download.
// Every test that handles files also checks egress (D-020).
import { expect, test, type Page } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import {
  boardPages,
  boardRendered,
  download,
  numbered,
  openTool,
  pageButton,
  readPages,
  widthsOf,
} from "../helpers/organize";

const SECRET = "duplicate-canary-c9e";
const order = async (page: Page) =>
  (await boardPages(page).evaluateAll((items) => items.map((item) => item.getAttribute("data-source")))).map(
    (source) => Number(source) + 1,
  );

test("copies pages right after themselves, without sending the file anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page, "duplicate-pages");
  const action = page.getByRole("button", { name: "Duplicate pages" });
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, numbered(3))));
  await boardRendered(page, 3);
  await expect(action).toBeDisabled();

  await page.getByRole("button", { name: "Duplicate page 2" }).click();
  await expect(page.getByText("Copied page 2. The copy is page 3.")).toBeAttached();
  expect(await order(page)).toEqual([1, 2, 2, 3]);

  // Select pages 1 and 4 (the original page 3) and copy both.
  await pageButton(page, 1).click();
  await pageButton(page, 4).click();
  await page.getByRole("button", { name: "Duplicate selected" }).click();
  expect(await order(page)).toEqual([1, 1, 2, 2, 3, 3]);
  await expect(page.getByText("3 copies added · 6 pages")).toBeVisible();

  await action.click();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-duplicated.pdf`);
  expect(readPages(result.bytes).map((p) => p.width)).toEqual(widthsOf(1, 1, 2, 2, 3, 3));

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("removes copies one at a time or all at once", async ({ page }) => {
  await openTool(page, "duplicate-pages");
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("two.pdf", numbered(2))));
  await boardRendered(page, 2);
  // Only copies can be removed.
  await expect(page.getByRole("button", { name: /^Remove page/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Duplicate page 1" }).click();
  await page.getByRole("button", { name: "Duplicate page 1" }).click();
  expect(await order(page)).toEqual([1, 1, 1, 2]);
  await page.getByRole("button", { name: "Remove page 2, a copy" }).click();
  expect(await order(page)).toEqual([1, 1, 2]);
  await page.getByRole("button", { name: "Remove all copies" }).click();
  await expect(page.getByText("Removed every copy.")).toBeAttached();
  expect(await order(page)).toEqual([1, 2]);
  await expect(page.getByRole("button", { name: "Duplicate pages" })).toBeDisabled();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Duplicate pages/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/duplicate-pages$/);
  await expect(page).toHaveTitle("Duplicate PDF pages free, no sign-up · Plyleaf");
});
