import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("shows the promise and every section", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Plyleaf/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Every PDF tool\.\s*Actually\s*free\./);
    for (const name of [/workshop in one tab/, /Every tool, free/, /How it works/, /Free means free/, /Got a PDF/]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expect(page.getByRole("table", { name: /compared with typical online PDF tools/ })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText("AGPL-3.0");
  });

  test("filters the tool grid", async ({ page }) => {
    await page.goto("/");
    const search = page.getByRole("searchbox", { name: "Search tools" });
    await expect(page.getByRole("status")).toHaveText(/^\d+ tools, all free$/);

    await search.fill("password");
    await expect(page.getByRole("status")).toHaveText("2 tools found");
    const tools = page.locator("#tools li");
    await expect(tools).toHaveCount(2);
    await expect(tools.first()).toContainText("Protect PDF");

    await search.fill("zzzz");
    await expect(page.getByRole("status")).toHaveText(/No tool matches/);
    await expect(tools).toHaveCount(0);
  });

  test("only talks to its own origin", async ({ page, baseURL }) => {
    const origins = new Set<string>();
    page.on("request", (request) => origins.add(new URL(request.url()).origin));
    await page.goto("/", { waitUntil: "networkidle" });
    // Wait for the tool grid island to hydrate so its scripts are counted too.
    await expect(page.locator("astro-island")).not.toHaveAttribute("ssr");
    await page.locator("#tools").scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    expect([...origins]).toEqual([new URL(baseURL!).origin]);
  });

  test("has no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("unknown pages get a helpful 404", async ({ page }) => {
  const response = await page.goto("/not-a-real-tool");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
  await expect(page.getByRole("link", { name: /See all tools/ })).toHaveAttribute("href", "/#tools");
});
