// Reorder pages: drag pages on the board (keyboard and pointer), move a selection to either end, reverse, reset.
// Every test that handles files also checks egress (D-020).
import { expect, test, type Page } from "@playwright/test";
import { pressUntilAnnounced } from "../helpers/drag";
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

const SECRET = "reorder-canary-o5n";
const order = async (page: Page) =>
  (await boardPages(page).evaluateAll((items) => items.map((item) => item.getAttribute("data-source")))).map(
    (source) => Number(source) + 1,
  );

test("drags pages into a new order with the keyboard and the pointer, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page, "reorder-pages");
  const action = page.getByRole("button", { name: "Reorder PDF" });
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile(`${SECRET}.pdf`, numbered(4))));
  await boardRendered(page, 4);
  await expect(action).toBeDisabled();

  // Keyboard: pick up page 4 and move it one place left (earlier, in any number of columns), announcing each step.
  const announced = (text: string) => expect(page.getByText(text)).toBeAttached();
  // The board goes mid-screen first, clear of the sticky action bar at the bottom.
  await boardPages(page)
    .first()
    .evaluate((item) => item.scrollIntoView({ block: "center" }));
  await page.getByRole("button", { name: "Drag Page 4" }).focus();
  await page.keyboard.press("Space");
  await announced("Picked up Page 4.");
  await pressUntilAnnounced(page, "ArrowLeft", "Over position 3 of 4.");
  await page.keyboard.press("Space");
  await announced("Dropped at position 3 of 4.");
  expect(await order(page)).toEqual([1, 2, 4, 3]);
  // Moved pages say where they came from.
  await expect(pageButton(page, 3)).toHaveAccessibleName("Page 3, page 4 of the original");
  await expect(page.getByText("Pages in a new order")).toBeVisible();

  // Pointer: drag the first page by its handle onto the last.
  await boardPages(page)
    .first()
    .evaluate((item) => item.scrollIntoView({ block: "center" }));
  const handle = page.getByRole("button", { name: "Drag Page 1" });
  const from = (await handle.boundingBox())!;
  // Aim at the last page's own handle, so the dragged page's centre lands on the last page's centre (a little past).
  const to = (await page.getByRole("button", { name: /^Drag Page 4/ }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2 + 20, to.y + to.height / 2, { steps: 12 });
  // Drop only once the drag has caught up with the pointer (WebKit can lag a move behind).
  await announced("Over position 4 of 4.");
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual([2, 4, 3, 1]);

  await action.click();
  const result = await download(page);
  expect(result.name).toBe(`${SECRET}-reordered.pdf`);
  expect(readPages(result.bytes).map((p) => p.width)).toEqual(widthsOf(2, 4, 3, 1));

  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("moves a selection to either end, reverses and resets", async ({ page }) => {
  await openTool(page, "reorder-pages");
  await page.getByLabel("Choose a file").setInputFiles(asPayload(pdfFile("five.pdf", numbered(5))));
  await boardRendered(page, 5);
  await expect(page.getByRole("button", { name: "Move to start" })).toBeDisabled();

  await pageButton(page, 4).click();
  await pageButton(page, 5).click();
  await page.getByRole("button", { name: "Move to start" }).click();
  await expect(page.getByText("Moved 2 selected pages to the start.")).toBeAttached();
  expect(await order(page)).toEqual([4, 5, 1, 2, 3]);
  // The selection follows the pages.
  await expect(pageButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Move to end" }).click();
  expect(await order(page)).toEqual([1, 2, 3, 4, 5]);
  await expect(page.getByRole("button", { name: "Reorder PDF" })).toBeDisabled();

  await page.getByRole("button", { name: "Reverse order" }).click();
  expect(await order(page)).toEqual([5, 4, 3, 2, 1]);
  await page.getByRole("button", { name: "Reorder PDF" }).click();
  expect(readPages((await download(page)).bytes).map((p) => p.width)).toEqual(widthsOf(5, 4, 3, 2, 1));
  await page.getByRole("button", { name: "Back to your file" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  expect(await order(page)).toEqual([1, 2, 3, 4, 5]);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Reorder pages/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/reorder-pages$/);
  await expect(page).toHaveTitle("Reorder PDF pages free, no sign-up · Plyleaf");
});
