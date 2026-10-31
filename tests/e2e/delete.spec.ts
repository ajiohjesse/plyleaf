// Delete pages: mark pages on the board and download the rest. Every test that handles files also checks egress (D-020).
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import { boardRendered, download, numbered, openTool, pageButton, readPages, widthsOf } from "../helpers/organize";

const SECRET = "delete-canary-m7d";

test("deletes the marked pages and keeps the rest in order, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page, "delete-pages");
  const action = page.getByRole("button", { name: /^Delete/ });
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, numbered(6))));
  await boardRendered(page, 6);
  await expect(page.getByText("Select the pages to delete.")).toBeVisible();
  await expect(action).toBeDisabled();

  await pageButton(page, 2).click();
  await pageButton(page, 4).click();
  await pageButton(page, 5).click({ modifiers: ["Shift"] });
  await expect(page.getByText("3 pages to delete · 3 pages left")).toBeVisible();
  await expect(action).toHaveText("Delete 3 pages");
  await action.click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-edited.pdf`);
  expect(readPages(result.bytes).map((p) => p.width)).toEqual(widthsOf(1, 3, 6));
  // The deleted pages' text isn't anywhere in the new file.
  const doc = mupdf.Document.openDocument(result.bytes, "application/pdf");
  const text = Array.from({ length: doc.countPages() }, (_, i) =>
    doc.loadPage(i).toStructuredText("preserve-whitespace").asText(),
  ).join(" ");
  doc.destroy();
  expect(text).toContain("Page 3");
  expect(text).not.toContain("Page 2");
  expect(text).not.toContain("Page 5");

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("won't delete every page", async ({ page }) => {
  await openTool(page, "delete-pages");
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("three.pdf", numbered(3))));
  await boardRendered(page, 3);
  await page.getByRole("button", { name: "Select all" }).click();
  await expect(page.getByText("Keep at least one page.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Delete/ })).toBeDisabled();
  await pageButton(page, 1).click();
  await expect(page.getByText("2 pages to delete · 1 page left")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Delete/ })).toBeEnabled();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Delete pages/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/delete-pages$/);
  await expect(page).toHaveTitle("Delete pages from a PDF free, no sign-up · Plyleaf");
});
