// Insert blank page: add blanks after a page, before or after a selection, remove them, and download.
// Every test that handles files also checks egress (D-020).
import { expect, test } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import { boardPages, boardRendered, download, numbered, openTool, pageButton, readPages } from "../helpers/organize";

const SECRET = "insert-canary-b6k";
const sources = (page: import("@playwright/test").Page) =>
  boardPages(page).evaluateAll((items) => items.map((item) => item.getAttribute("data-source")));

test("adds blank pages the size of their neighbours, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page, "insert-blank-page");
  const action = page.getByRole("button", { name: "Insert blank pages" });
  // Page 2 is landscape.
  const pages = [
    { width: 300, height: 500 },
    { width: 600, height: 400 },
    { width: 320, height: 500 },
  ];
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, pages)));
  await boardRendered(page, 3);
  await expect(action).toBeDisabled();

  await page.getByRole("button", { name: "Add a blank page after page 2" }).click();
  await expect(page.getByText("Added a blank page after page 2.")).toBeAttached();
  expect(await sources(page)).toEqual(["0", "1", "blank", "2"]);
  await expect(pageButton(page, 3)).toHaveAccessibleName("Page 3, blank");

  // Select page 1 and add a blank before it.
  await pageButton(page, 1).click();
  await page.getByRole("button", { name: "Before selected" }).click();
  expect(await sources(page)).toEqual(["blank", "0", "1", "blank", "2"]);
  await expect(page.getByText("2 blank pages added")).toBeVisible();

  await action.click();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-with-blanks.pdf`);
  expect(readPages(result.bytes).map(({ width, height }) => [width, height])).toEqual([
    [300, 500],
    [300, 500],
    [600, 400],
    [600, 400],
    [320, 500],
  ]);

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("removes blank pages one at a time or all at once", async ({ page }) => {
  await openTool(page, "insert-blank-page");
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("two.pdf", numbered(2))));
  await boardRendered(page, 2);
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "After selected" }).click();
  expect(await sources(page)).toEqual(["0", "blank", "1", "blank"]);
  await page.getByRole("button", { name: "Remove blank page 2" }).click();
  expect(await sources(page)).toEqual(["0", "1", "blank"]);
  await page.getByRole("button", { name: "Remove all blanks" }).click();
  await expect(page.getByText("Removed every blank page.")).toBeAttached();
  expect(await sources(page)).toEqual(["0", "1"]);
  await expect(page.getByRole("button", { name: "Insert blank pages" })).toBeDisabled();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Insert blank page/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/insert-blank-page$/);
  await expect(page).toHaveTitle("Insert blank pages into a PDF free, no sign-up · Plyleaf");
});
