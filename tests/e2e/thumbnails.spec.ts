import { expect, test, type Page } from "@playwright/test";
import "../helpers/harness";
import { A4, LETTER, makePdf, type TestPage } from "../helpers/pdf";

// The harness page is only built for local E2E runs, not deployed.
test.skip(!!process.env["BASE_URL"], "needs the test-harness build");

async function openPdf(page: Page, name: string, pages: TestPage[]) {
  await page.goto("/test-harness/thumbnails");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page
    .getByLabel("Choose files")
    .setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(makePdf(pages)) });
  return page.getByRole("list", { name: `Pages of ${name}` }).getByRole("listitem");
}

/** The colour at a point of a page's thumbnail, as fractions of its width and height. */
function pixelAt(page: Page, index: number, x: number, y: number) {
  return page.evaluate(
    (at) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        `li[data-page="${at.index}"] canvas[data-state="ready"]`,
      )!;
      const data = canvas
        .getContext("2d")!
        .getImageData(Math.floor(canvas.width * at.x), Math.floor(canvas.height * at.y), 1, 1).data;
      return Array.from(data);
    },
    { index, x, y },
  );
}

/** Waits until no renders are queued or running, then says how many have finished in all. */
async function settledRenders(page: Page) {
  const busy = () =>
    page.evaluate(() => {
      const { queued, rendering } = window.harness.thumbnails.stats();
      return queued + rendering;
    });
  await expect.poll(busy).toBe(0);
  return page.evaluate(() => window.harness.thumbnails.stats().rendered);
}

const RED = [255, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

test("shows each page the right way up and the right shape", async ({ page }) => {
  const pages = await openPdf(page, "mixed.pdf", [A4, { ...LETTER, rotate: 90 }, { width: 300, height: 900 }]);
  await expect(pages).toHaveText(["Page 1", "Page 2", "Page 3"]);
  await expect(page.locator('canvas[data-state="ready"]')).toHaveCount(3);

  // Each test page has its top-left quadrant filled red; turned 90° clockwise, that's the top right.
  expect(await pixelAt(page, 0, 0.25, 0.25)).toEqual(RED);
  expect(await pixelAt(page, 0, 0.75, 0.25)).toEqual(WHITE);
  expect(await pixelAt(page, 1, 0.75, 0.25)).toEqual(RED);
  expect(await pixelAt(page, 1, 0.25, 0.25)).toEqual(WHITE);

  const shape = (index: number) =>
    page.locator(`li[data-page="${index}"] canvas`).evaluate((canvas) => {
      const box = canvas.getBoundingClientRect();
      return box.width / box.height;
    });
  expect(await shape(0)).toBeCloseTo(595 / 842, 1);
  expect(await shape(1)).toBeCloseTo(792 / 612, 1);
  expect(await shape(2)).toBeCloseTo(300 / 900, 1);
});

test("renders only the pages near the viewport of a 600-page document", async ({ page }) => {
  const pages = await openPdf(
    page,
    "long.pdf",
    Array.from({ length: 600 }, () => A4),
  );
  // Every page is in the list, so screen readers and find-in-page see them all.
  await expect(pages).toHaveCount(600);
  await expect(page.locator('li[data-page="0"] canvas[data-state="ready"]')).toBeVisible();
  const renderedAtTop = await settledRenders(page);
  const canvasesAtTop = await page.locator("canvas").count();
  expect(canvasesAtTop).toBeGreaterThan(0);
  expect(canvasesAtTop).toBeLessThan(100);
  expect(renderedAtTop).toBe(canvasesAtTop);

  // Jump to the end: the last page renders, the first page's canvas goes, and pages skipped over never render.
  await page.locator('li[data-page="599"]').scrollIntoViewIfNeeded();
  await expect(page.locator('li[data-page="599"] canvas[data-state="ready"]')).toBeVisible();
  await expect(page.locator('li[data-page="0"] canvas')).toHaveCount(0);
  const renderedAtEnd = await settledRenders(page);
  expect(await page.locator("canvas").count()).toBeLessThan(100);
  expect(renderedAtEnd).toBeLessThan(200);
  await expect(page.locator('li[data-page="300"] canvas')).toHaveCount(0);

  // Scrolling back reuses the cached images instead of rendering again.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('li[data-page="0"] canvas[data-state="ready"]')).toBeVisible();
  await expect(page.locator('canvas[data-state="ready"]')).toHaveCount(canvasesAtTop);
  expect(await settledRenders(page)).toBe(renderedAtEnd);
});

test("drops a document's thumbnails when it's removed", async ({ page }) => {
  const pages = await openPdf(page, "short.pdf", [A4, A4]);
  await expect(pages).toHaveCount(2);
  await expect(page.locator('canvas[data-state="ready"]')).toHaveCount(2);
  expect(await page.evaluate(() => window.harness.thumbnails.stats().images)).toBe(2);

  await page.getByRole("button", { name: "Remove short.pdf" }).click();
  await expect(pages).toHaveCount(0);
  expect(await page.evaluate(() => window.harness.thumbnails.stats())).toMatchObject({ images: 0, bytes: 0 });
  expect(await page.evaluate(() => window.harness.engine.stats().openDocuments)).toBe(0);
});
