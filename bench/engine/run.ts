// Builds the spike page, serves it with Vite preview and runs every engine in Chromium, Firefox and WebKit.
// Each run uses a fresh browser context (empty HTTP cache), so init includes downloading and compiling the engine.
// Run: node bench/engine/make-fixtures.ts (once), then node bench/engine/run.ts [runs=3] [browsers=chromium,firefox,webkit]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { chromium, firefox, webkit, type BrowserType } from "@playwright/test";
import { build, preview } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const configFile = `${here}vite.config.ts`;
const ENGINES = ["mupdf", "pdfium", "pdfjs", "pdflib"];
const runs = Number(process.argv[2] ?? 3);
const browserNames = (process.argv[3] ?? "chromium,firefox,webkit").split(",");
const browserTypes: Record<string, BrowserType> = { chromium, firefox, webkit };

type Result = Record<string, unknown> & { engine: string; resources?: string[]; firstThumb?: string | null };

await build({ configFile });
const server = await preview({ configFile });
const base = "http://localhost:4400";

const all: Record<string, Record<string, Result[]>> = {};
for (const browserName of browserNames) {
  // The full Chromium build (not the headless shell) exposes performance.measureUserAgentSpecificMemory.
  const browser = await browserTypes[browserName]!.launch(browserName === "chromium" ? { channel: "chromium" } : {});
  all[browserName] = {};
  for (const engine of ENGINES) {
    const results: Result[] = [];
    for (let i = 0; i < runs; i++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(15 * 60_000);
      await page.goto(`${base}/?engine=${engine}`);
      const result = (await page.evaluate(
        () => (window as unknown as { plyleafBench: Promise<unknown> }).plyleafBench,
      )) as Result;
      console.log(browserName, engine, `run ${i + 1}/${runs}`, JSON.stringify(result.init));
      results.push(result);
      await context.close();
    }
    all[browserName][engine] = results;
  }
  await browser.close();
}
await server.close();

// Bytes each engine downloads before it can do anything, from the files it actually requested during init.
const bundles: Record<string, { files: string[]; raw: number; gzip: number; brotli: number }> = {};
for (const engine of ENGINES) {
  const first = all[browserNames[0]!]?.[engine]?.[0];
  const files = [...new Set(first?.resources ?? [])];
  const totals = { files, raw: 0, gzip: 0, brotli: 0 };
  for (const file of files) {
    const bytes = await readFile(`${here}dist${file}`);
    totals.raw += bytes.length;
    totals.gzip += gzipSync(bytes, { level: 9 }).length;
    totals.brotli += brotliCompressSync(bytes).length;
  }
  bundles[engine] = totals;
}

// Thumbnails are saved once for a visual check, not kept in the JSON.
const outDir = `${here}results/`;
await mkdir(`${outDir}thumbs`, { recursive: true });
for (const [browserName, engines] of Object.entries(all)) {
  for (const [engine, results] of Object.entries(engines)) {
    const thumb = results[0]?.firstThumb;
    if (thumb)
      await writeFile(`${outDir}thumbs/${browserName}-${engine}.png`, Buffer.from(thumb.split(",")[1]!, "base64"));
    for (const r of results) delete r.firstThumb;
  }
}
const stamp = new Date().toISOString().slice(0, 10);
await writeFile(`${outDir}${stamp}.json`, JSON.stringify({ runs, bundles, results: all }, null, 2));
console.log(`Wrote ${outDir}${stamp}.json`);
