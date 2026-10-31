// Extract pages: select pages on the board (click, shift-click, typed ranges, all/none) and download only those.
// Every test that handles files also checks egress (D-020).
import { expect, test } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import { boardRendered, download, numbered, openTool, pageButton, readPages, widthsOf } from "../helpers/organize";

const SECRET = "extract-canary-z4p";

test("extracts the selected pages in their original order, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page, "extract-pages");
  const action = page.getByRole("button", { name: /^Extract/ });
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, numbered(8))));
  await boardRendered(page, 8);
  await expect(page.getByText("Select the pages to keep.")).toBeVisible();
  await expect(action).toBeDisabled();

  // Click 6, then 2; shift-click 4 selects 2 to 4.
  await pageButton(page, 6).click();
  await pageButton(page, 2).click();
  await pageButton(page, 4).click({ modifiers: ["Shift"] });
  for (const n of [2, 3, 4, 6]) await expect(pageButton(page, n)).toHaveAttribute("aria-pressed", "true");
  await expect(pageButton(page, 1)).toHaveAttribute("aria-pressed", "false");
  // Clicking a selected page again deselects it.
  await pageButton(page, 3).click();
  await expect(pageButton(page, 3)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("3 of 8 pages selected")).toBeVisible();

  await action.click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const first = await download(page);
  expect(first.name).toBe(`${SECRET}-extracted.pdf`);
  expect(readPages(first.bytes).map((p) => p.width)).toEqual(widthsOf(2, 4, 6));

  // Back keeps the selection; typed ranges replace it.
  await page.getByRole("button", { name: "Back to your file" }).click();
  await expect(action).toBeFocused();
  await expect(pageButton(page, 6)).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Select pages").fill("7-, 1");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.getByText("3 of 8 pages selected")).toBeVisible();
  await expect(action).toHaveText("Extract 3 pages");
  await action.click();
  expect(readPages((await download(page)).bytes).map((p) => p.width)).toEqual(widthsOf(1, 7, 8));

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("selects all or none, and explains typed pages it can't select", async ({ page }) => {
  await openTool(page, "extract-pages");
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("five.pdf", numbered(5))));
  await boardRendered(page, 5);
  await page.getByRole("button", { name: "Select all" }).click();
  await expect(page.getByText("5 of 5 pages selected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Select all" })).toBeDisabled();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("button", { name: /^Extract/ })).toBeDisabled();

  const typed = page.getByLabel("Select pages");
  await typed.fill("2-9");
  await typed.press("Enter");
  await expect(page.getByText("This file has 5 pages, so there's no page 9.")).toBeVisible();
  await expect(typed).toHaveAttribute("aria-invalid", "true");
  await typed.fill("2-3");
  await typed.press("Enter");
  await expect(typed).not.toHaveAttribute("aria-invalid");
  await expect(page.getByText("2 of 5 pages selected")).toBeVisible();

  // A different file swaps in with a fresh board.
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("three.pdf", numbered(3))));
  await boardRendered(page, 3);
  await expect(page.getByText("Select the pages to keep.")).toBeVisible();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Extract pages/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/extract-pages$/);
  await expect(page).toHaveTitle("Extract pages from a PDF free, no sign-up · Plyleaf");
});
