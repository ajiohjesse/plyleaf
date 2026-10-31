// Prints Markdown tables (medians across runs) from a results file written by run.ts.
// Run: node bench/engine/report.ts bench/engine/results/<date>.json
import { readFile } from "node:fs/promises";

type Timing = { ms: number } | { error: string };
type Snapshot = { wasm: number; total: number | null };
type Result = {
  init: Timing;
  files: Record<string, Record<string, Timing | number>>;
  ops: Record<string, Timing & { bytes?: number; pagesOk?: boolean }>;
  memory?: Record<string, Snapshot>;
};
type Results = {
  runs: number;
  bundles: Record<string, { raw: number; gzip: number; brotli: number }>;
  results: Record<string, Record<string, Result[]>>;
};

const file = process.argv[2];
if (!file) throw new Error("usage: node bench/engine/report.ts <results.json>");
const data = JSON.parse(await readFile(file, "utf8")) as Results;
const engines = Object.keys(data.bundles);
const browsers = Object.keys(data.results);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};
const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
const fmtMs = (ms: number) =>
  Number.isNaN(ms) ? "–" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;

function cell(runs: Result[], pick: (r: Result) => Timing | undefined): string {
  const timings = runs.map(pick);
  if (timings.every((t) => t === undefined)) return "n/a";
  const failed = timings.find((t) => t && "error" in t);
  if (failed && "error" in failed) return `fails: ${failed.error.slice(0, 40)}`;
  return fmtMs(median(timings.map((t) => (t && "ms" in t ? t.ms : NaN))));
}

function table(header: string[], rows: string[][]) {
  console.log(`| ${header.join(" | ")} |`);
  console.log(`|${header.map(() => "---").join("|")}|`);
  for (const row of rows) console.log(`| ${row.join(" | ")} |`);
  console.log();
}

console.log(`### Download size (what each engine fetches before its first operation)\n`);
table(
  ["Engine", "Raw", "gzip", "Brotli"],
  engines.map((e) => {
    const b = data.bundles[e]!;
    return [e, `${mb(b.raw)} MB`, `${mb(b.gzip)} MB`, `${mb(b.brotli)} MB`];
  }),
);

const rows: [string, (r: Result) => Timing | undefined][] = [
  ["Init (download from localhost + compile)", (r) => r.init],
  ["Open text (12 p)", (r) => r.files["text"]?.["open"] as Timing],
  ["Open scan (100 p, 28 MB)", (r) => r.files["scanned"]?.["open"] as Timing],
  ["Open mixed (42 p, 52 MB)", (r) => r.files["mixed"]?.["open"] as Timing],
  ["First thumbnail, text", (r) => r.files["text"]?.["firstThumb"] as Timing],
  ["First page at 150 %, scan", (r) => r.files["scanned"]?.["firstView"] as Timing],
  ["All thumbnails, text (12)", (r) => r.files["text"]?.["allThumbs"] as Timing],
  ["All thumbnails, scan (100)", (r) => r.files["scanned"]?.["allThumbs"] as Timing],
  ["All thumbnails, mixed (42)", (r) => r.files["mixed"]?.["allThumbs"] as Timing],
  ["Merge all three + save (154 p)", (r) => r.ops["merge"]],
  ["Rotate all of mixed + save", (r) => r.ops["rotateMixed"]],
];
for (const browser of browsers) {
  console.log(`### ${browser} (median of ${data.runs})\n`);
  table(
    ["Operation", ...engines],
    rows.map(([label, pick]) => [label, ...engines.map((e) => cell(data.results[browser]?.[e] ?? [], pick))]),
  );
}

const chromium = data.results["chromium"];
if (chromium) {
  console.log(`### Memory in Chromium (median, above the baseline that already holds the 80 MB of fixtures)\n`);
  const mem = (e: string, phase: string, key: keyof Snapshot) => {
    const runs = chromium[e] ?? [];
    const values = runs.map((r) => {
      const base = r.memory?.["baseline"]?.[key] ?? 0;
      const at = r.memory?.[phase]?.[key];
      return at == null ? NaN : at - base;
    });
    const m = median(values);
    return Number.isNaN(m) ? "–" : `${mb(m)} MB`;
  };
  table(
    ["Engine", "WASM heap, mixed open", "WASM heap, peak", "Page total, mixed open", "Page total, end"],
    engines.map((e) => [
      e,
      mem(e, "mixedOpen", "wasm"),
      mem(e, "end", "wasm"),
      mem(e, "mixedOpen", "total"),
      mem(e, "end", "total"),
    ]),
  );
}
