// Copies OCR PDF's reading data (Tesseract's "best_int" models, one @tesseract.js-data package per language) into
// public/, where the site serves it from a path that names its version, so browsers can cache it for good. Run before
// `astro dev` and `astro build`; the copies aren't committed.
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const MODEL = "4.0.0_best_int";
const root = new URL("../", import.meta.url);
const out = new URL(`public/ocr/tessdata/${MODEL}/`, root);

const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8")) as {
  dependencies: Record<string, string>;
};
const languages = Object.keys(pkg.dependencies)
  .filter((name) => name.startsWith("@tesseract.js-data/"))
  .map((name) => name.slice("@tesseract.js-data/".length));

await mkdir(out, { recursive: true });
let copied = 0;
for (const code of languages) {
  const file = `${code}.traineddata.gz`;
  const from = new URL(`node_modules/@tesseract.js-data/${code}/${MODEL}/${file}`, root);
  const to = new URL(file, out);
  const [source, target] = await Promise.all([stat(from), stat(to).catch(() => null)]);
  if (target?.size === source.size) continue;
  await copyFile(from, to);
  copied++;
}
console.log(`OCR reading data: ${languages.length} languages in ${fileURLToPath(out)} (${copied} copied)`);
