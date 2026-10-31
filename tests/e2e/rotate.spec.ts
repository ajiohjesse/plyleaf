// Rotate PDF: turn pages one at a time or by selection, see it on the board, and download the turned file.
// Every test that handles files also checks egress (D-020).
import { expect, test } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { asPayload, pdfFile } from "../helpers/files";
import { boardPages, boardRendered, download, numbered, openTool, pageButton, readPages } from "../helpers/organize";

const SECRET = "rotate-canary-r2t";

test("turns single pages and selected pages, and saves the rotation, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page, "rotate-pdf");
  const action = page.getByRole("button", { name: "Rotate PDF" });
  // Page 3 already has its own /Rotate 90; turning adds to it.
  const pages = [...numbered(2), { ...numbered(3)[2]!, rotate: 90 as const }, ...numbered(4).slice(3)];
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, pages)));
  await boardRendered(page, 4);
  await expect(action).toBeDisabled();

  await page.getByRole("button", { name: "Turn page 1 right" }).click();
  await expect(page.getByText("Page 1 turned right.")).toBeAttached();
  await page.getByRole("button", { name: "Turn page 2 left" }).click();
  await expect(page.getByText("2 pages turned")).toBeVisible();
  // The board shows it: page 1's box is now wider than tall.
  const box = (await boardPages(page).first().locator("button > span").first().boundingBox())!;
  expect(box.width).toBeGreaterThan(box.height);

  // Select 3 and 4 and turn them together.
  await pageButton(page, 3).click();
  await pageButton(page, 4).click();
  await page.getByRole("button", { name: "Right", exact: true }).click();
  await expect(page.getByText("Turned 2 selected pages right.")).toBeAttached();
  await expect(page.getByText("4 pages turned")).toBeVisible();

  await action.click();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-rotated.pdf`);
  expect(readPages(result.bytes)).toEqual([
    { width: 500, height: 300, rotate: 90 },
    { width: 500, height: 310, rotate: 270 },
    { width: 320, height: 500, rotate: 180 },
    { width: 500, height: 330, rotate: 90 },
  ]);

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("turns every page when none are selected, and resets", async ({ page }) => {
  await openTool(page, "rotate-pdf");
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("three.pdf", numbered(3))));
  await boardRendered(page, 3);
  await expect(page.getByText("Turn all pages")).toBeVisible();
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await expect(page.getByText("3 pages turned")).toBeVisible();
  await page.getByRole("button", { name: "Rotate PDF" }).click();
  expect(readPages((await download(page)).bytes).map((p) => p.rotate)).toEqual([180, 180, 180]);

  await page.getByRole("button", { name: "Back to your file" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("Every page is back the way it was.")).toBeAttached();
  await expect(page.getByRole("button", { name: "Rotate PDF" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset" })).toBeDisabled();
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Rotate PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/rotate-pdf$/);
  await expect(page).toHaveTitle("Rotate PDF pages free, no sign-up · Plyleaf");
});
