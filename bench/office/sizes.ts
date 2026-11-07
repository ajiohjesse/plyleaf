// Office spike (M8): what each candidate downloads before its first conversion, raw / gzip -9 / Brotli 11.
//   node bench/office/sizes.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "package.json"));
const nm = (p: string) => join(here, "node_modules", p);
const sets: Record<string, string[]> = {
  libreoffice: ["soffice.wasm", "soffice.data", "soffice.js", "soffice.worker.js"]
    .map((f) => nm(`@matbee/libreoffice-converter/wasm/${f}`))
    .concat(
      nm("@matbee/libreoffice-converter/dist/browser.worker.global.js"),
      nm("@matbee/libreoffice-converter/dist/browser.js"),
    ),
  "docx-to-pdf-wasm": [require.resolve("docx-to-pdf-wasm/wasm"), nm("docx-to-pdf-wasm/build/convert.js")],
  "docx-preview": [
    nm("docx-preview/dist/docx-preview.js"),
    nm(".pnpm/jszip@3.10.2/node_modules/jszip/dist/jszip.min.js"),
  ],
};
const rows: Record<string, unknown>[] = [];
for (const [name, files] of Object.entries(sets)) {
  let raw = 0,
    gz = 0,
    br = 0,
    largest = 0;
  for (const f of files) {
    const b = readFileSync(f);
    raw += b.length;
    largest = Math.max(largest, b.length);
    gz += gzipSync(b, { level: 9 }).length;
    br += brotliCompressSync(b, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: b.length },
    }).length;
  }
  const mb = (n: number) => +(n / 1048576).toFixed(1);
  rows.push({
    candidate: name,
    rawMB: mb(raw),
    gzipMB: mb(gz),
    brotliMB: mb(br),
    largestFileMB: mb(largest),
    at10MbitS: Math.round((br * 8) / 10e6),
  });
}
writeFileSync(join(here, "results", "sizes.json"), JSON.stringify(rows, null, 2));
console.table(rows);
