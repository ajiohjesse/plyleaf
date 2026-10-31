import { expect, test, type Page } from "@playwright/test";
import type { engine as Engine, EngineError } from "~/engine/client";
import { A4, LETTER, makePdf } from "../helpers/pdf";

declare global {
  interface Window {
    harness: { engine: typeof Engine; EngineError: typeof EngineError; preloadEngine: () => void };
  }
}

// The harness page is only built for local E2E runs, not deployed.
test.skip(!!process.env["BASE_URL"], "needs the test-harness build");

async function openHarness(page: Page) {
  const engineRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/(worker|ops|mupdf)[^/]*\.(js|wasm)$/.test(request.url())) engineRequests.push(request.url());
  });
  await page.goto("/test-harness/engine");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  return engineRequests;
}

test("loads nothing heavy until the engine is first used", async ({ page }) => {
  const engineRequests = await openHarness(page);
  await page.waitForLoadState("networkidle");
  expect(engineRequests).toEqual([]);

  await page.evaluate(() => window.harness.preloadEngine());
  await expect.poll(() => engineRequests.some((url) => url.endsWith(".wasm"))).toBe(true);
});

test("opens, renders and assembles PDFs in the worker", async ({ page }) => {
  await openHarness(page);
  const inputs = [makePdf([A4, { ...LETTER, rotate: 90 }]), makePdf([LETTER])].map((bytes) => Array.from(bytes));

  const result = await page.evaluate(
    async ([a, b]) => {
      const { engine } = window.harness;
      const docA = await engine.open(new Uint8Array(a));
      // Blobs (what file inputs and drops give us) work too.
      const docB = await engine.open(new Blob([new Uint8Array(b)], { type: "application/pdf" }));
      const thumb = await engine.render(docA.id, 0, 120);
      const topLeft = Array.from(thumb.pixels.slice(0, 4));
      const merged = await engine.assemble([
        { doc: docB.id, page: 0 },
        { doc: docA.id, page: 1, rotate: 90 },
        { blank: { width: 300, height: 300 } },
      ]);
      const header = new TextDecoder().decode(merged.slice(0, 5));
      const reopened = await engine.open(merged);
      const stats = engine.stats();
      for (const doc of [docA, docB, reopened]) await engine.close(doc.id);
      return { docA, thumb: { width: thumb.width, height: thumb.height, topLeft }, header, reopened, stats };
    },
    inputs as [number[], number[]],
  );

  expect(result.docA).toMatchObject({
    pageCount: 2,
    repaired: false,
    pages: [
      { width: 595, height: 842, rotation: 0 },
      { width: 792, height: 612, rotation: 90 },
    ],
  });
  expect(result.thumb).toEqual({ width: 120, height: 170, topLeft: [255, 0, 0, 255] });
  expect(result.header).toBe("%PDF-");
  expect(result.reopened.pages).toEqual([
    { width: 612, height: 792, rotation: 0 },
    { width: 612, height: 792, rotation: 180 },
    { width: 300, height: 300, rotation: 0 },
  ]);
  expect(result.stats).toMatchObject({ running: true, openDocuments: 3 });
});

test("reports typed errors", async ({ page }) => {
  await openHarness(page);
  const protectedPdf = Array.from(makePdf([A4], { save: "encrypt=aes-256,user-password=secret" }));

  const errors = await page.evaluate(async (encrypted) => {
    const { engine, EngineError } = window.harness;
    const describe = (error: unknown) =>
      error instanceof EngineError ? error.code : `not an EngineError: ${String(error)}`;
    return {
      notPdf: await engine.open(new Blob(["just text"])).catch(describe),
      encrypted: await engine.open(new Uint8Array(encrypted)).catch(describe),
      unknownDoc: await engine.render("d999", 0, 100).catch(describe),
    };
  }, protectedPdf);

  expect(errors).toEqual({ notPdf: "invalid-file", encrypted: "password-required", unknownDoc: "unknown-document" });
});
