// Office spike (M8): runs the candidates in real browsers.
// - LibreOffice WASM: cold start (empty cache, fresh context) and per-file conversion time, in Chromium, Firefox, WebKit.
// - docx-preview + print: renders report.docx to HTML, then prints it to PDF (Chromium's page.pdf stands in for the
//   user choosing "Save as PDF" in the print dialog).
// Serves bench/office over HTTP with COOP/COEP, which LibreOffice's threads (SharedArrayBuffer) need.
//   node bench/office/browser.ts [runs] [browsers, comma-separated] [out name]
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit, type BrowserType } from "@playwright/test";
import * as mupdf from "mupdf";

const here = dirname(fileURLToPath(import.meta.url));
const runs = Number(process.argv[2] ?? 2);
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".cjs": "text/javascript",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".docx": "application/octet-stream",
  ".xlsx": "application/octet-stream",
  ".pptx": "application/octet-stream",
};
const server = createServer((req, res) => {
  const path = normalize(join(here, decodeURIComponent(new URL(req.url!, "http://x").pathname)));
  if (!path.startsWith(here) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": types[extname(path)] ?? "application/octet-stream",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cache-Control": "no-store",
  });
  createReadStream(path).pipe(res);
});
await new Promise<void>((r) => server.listen(4399, r));
const base = "http://localhost:4399";

const results: Record<string, unknown>[] = [];
const all: Record<string, BrowserType> = { chromium, firefox, webkit };
const browsers: Record<string, BrowserType> = Object.fromEntries(
  (process.argv[3] ?? "chromium,firefox,webkit").split(",").map((b) => [b, all[b]!] as const),
);
const outName = process.argv[4] ?? "browser";

for (const [name, type] of Object.entries(browsers)) {
  const browser = await type.launch();
  for (let run = 0; run < runs; run++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(name, "pageerror", e.message));
    try {
      await page.goto(`${base}/pages/lo.html`);
      const r = await Promise.race([
        page.evaluate(() => (window as any).runLo()),
        new Promise<never>((_, no) => setTimeout(() => no(new Error("timed out after 240 s")), 240_000)),
      ]);
      results.push({ browser: name, run, ...r });
      console.log(name, run, JSON.stringify(r));
    } catch (e) {
      results.push({ browser: name, run, error: String(e).slice(0, 300) });
      console.log(name, run, "ERROR", String(e).slice(0, 300));
    }
    await ctx.close();
  }
  await browser.close();
}

// docx-preview + print (Chromium only: page.pdf)
if (outName === "browser") {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}/pages/preview.html`);
  const t = await page.evaluate(() => (window as any).render());
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  mkdirSync(join(here, "out", "docx-preview"), { recursive: true });
  writeFileSync(join(here, "out", "docx-preview", "report.docx.pdf"), pdf);
  const pages = mupdf.Document.openDocument(pdf, "application/pdf").countPages();
  results.push({ browser: "chromium", candidate: "docx-preview", renderMs: t, pages });
  console.log("docx-preview", t, "ms,", pages, "pages");
  await browser.close();
}

writeFileSync(join(here, "results", `${outName}.json`), JSON.stringify(results, null, 2));
server.close();
