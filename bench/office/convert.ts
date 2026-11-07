// Office spike (M8): converts every fixture with each Node-runnable candidate and records timings.
// LibreOffice WASM runs here in Node (the same WASM build the browser would load; browser timing is in browser.ts).
//   node bench/office/convert.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as mupdf from "mupdf";

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, "fixtures");
const outRoot = join(here, "out");
const require = createRequire(join(here, "package.json"));
const results: Record<string, unknown>[] = [];

function pages(pdf: Uint8Array): number {
  return mupdf.Document.openDocument(pdf, "application/pdf").countPages();
}
function save(candidate: string, name: string, pdf: Uint8Array) {
  mkdirSync(join(outRoot, candidate), { recursive: true });
  writeFileSync(join(outRoot, candidate, `${name}.pdf`), pdf);
}
async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const v = await fn();
  return [v, Math.round(performance.now() - t)];
}

// ---------- LibreOffice WASM (@matbee/libreoffice-converter) ----------
{
  const { createConverter } = await import("@matbee/libreoffice-converter");
  const wasmLoader = require("@matbee/libreoffice-converter/wasm/loader");
  const wasmPath = dirname(require.resolve("@matbee/libreoffice-converter/wasm/loader"));
  const [lo, initMs] = await timed(() => createConverter({ wasmLoader, wasmPath }));
  results.push({ candidate: "libreoffice", step: "init", ms: initMs });
  const jobs: [string, string][] = [
    ["report.docx", "docx"],
    ["budget.xlsx", "xlsx"],
    ["deck.pptx", "pptx"],
    ["page.html", "html"],
  ];
  for (const [file, fmt] of jobs) {
    const input = readFileSync(join(fx, file));
    try {
      const [first, ms] = await timed(() => lo.convert(input, { outputFormat: "pdf", inputFormat: fmt as never }));
      const [, ms2] = await timed(() => lo.convert(input, { outputFormat: "pdf", inputFormat: fmt as never }));
      save("libreoffice", file, first.data);
      results.push({
        candidate: "libreoffice",
        file,
        ms,
        warmMs: ms2,
        pages: pages(first.data),
        bytes: first.data.length,
      });
    } catch (e) {
      results.push({ candidate: "libreoffice", file, error: String(e) });
    }
  }
  // ODF: round-trip each OOXML fixture to its ODF twin with LibreOffice, then convert that to PDF.
  for (const [file, fmt, odf] of [
    ["report.docx", "docx", "odt"],
    ["budget.xlsx", "xlsx", "ods"],
    ["deck.pptx", "pptx", "odp"],
  ] as const) {
    try {
      const twin = await lo.convert(readFileSync(join(fx, file)), { outputFormat: odf, inputFormat: fmt });
      const name = file.replace(/\.\w+$/, `.${odf}`);
      writeFileSync(join(fx, name), twin.data);
      const [pdf, ms] = await timed(() => lo.convert(twin.data, { outputFormat: "pdf", inputFormat: odf }));
      save("libreoffice", name, pdf.data);
      results.push({ candidate: "libreoffice", file: name, ms, pages: pages(pdf.data), bytes: pdf.data.length });
    } catch (e) {
      results.push({ candidate: "libreoffice", file: `${file}->${odf}`, error: String(e) });
    }
  }
  await lo.destroy();
}

// ---------- docx-to-pdf-wasm (Rust, DOCX only) ----------
{
  const { convertToPdf } = await import("docx-to-pdf-wasm");
  const wasmPath = require.resolve("docx-to-pdf-wasm/wasm");
  const [mod, initMs] = await timed(() => WebAssembly.compile(readFileSync(wasmPath)));
  results.push({ candidate: "docx-to-pdf-wasm", step: "init", ms: initMs });
  const input = readFileSync(join(fx, "report.docx"));
  try {
    const [pdf, ms] = await timed(() => convertToPdf(mod, input));
    const [, ms2] = await timed(() => convertToPdf(mod, input));
    save("docx-to-pdf-wasm", "report.docx", pdf);
    results.push({
      candidate: "docx-to-pdf-wasm",
      file: "report.docx",
      ms,
      warmMs: ms2,
      pages: pages(pdf),
      bytes: pdf.length,
    });
  } catch (e) {
    results.push({ candidate: "docx-to-pdf-wasm", file: "report.docx", error: String(e) });
  }
}

mkdirSync(join(here, "results"), { recursive: true });
writeFileSync(join(here, "results", "node.json"), JSON.stringify(results, null, 2));
console.table(results);
process.exit(0);
