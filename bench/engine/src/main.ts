// Runs the spike suite for one engine (?engine=mupdf|pdfium|pdfjs|pdflib) and exposes the result on window.plyleafBench.
import type { BenchDoc, Engine } from "./engine";

const loaders: Record<string, () => Promise<{ engine: Engine }>> = {
  mupdf: () => import("./engines/mupdf"),
  pdfium: () => import("./engines/pdfium"),
  pdfjs: () => import("./engines/pdfjs"),
  pdflib: () => import("./engines/pdflib"),
};

const FIXTURES = ["text", "scanned", "mixed"] as const;
const THUMB_WIDTH = 200; // CSS px, the thumbnail strip size
const VIEW_SCALE = 1.5; // ~ a 900 px wide page on screen

// WASM linear memory only grows, so its final size is the engine's peak. Record every memory that gets instantiated.
const memories = new Set<WebAssembly.Memory>();
function collectMemories(...sources: unknown[]) {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const value of Object.values(source)) {
      if (value instanceof WebAssembly.Memory) memories.add(value);
      else if (value && typeof value === "object" && !(value instanceof WebAssembly.Module)) {
        for (const inner of Object.values(value)) if (inner instanceof WebAssembly.Memory) memories.add(inner);
      }
    }
  }
}
const { instantiate, instantiateStreaming } = WebAssembly;
WebAssembly.instantiate = (async (source: BufferSource | WebAssembly.Module, imports?: WebAssembly.Imports) => {
  const result = await instantiate(source as BufferSource, imports);
  const instance = result instanceof WebAssembly.Instance ? result : result.instance;
  collectMemories(instance.exports, imports);
  return result;
}) as typeof WebAssembly.instantiate;
WebAssembly.instantiateStreaming = async (source, imports) => {
  const result = await instantiateStreaming(source, imports);
  collectMemories(result.instance.exports, imports);
  return result;
};
const wasmHeapBytes = () => [...memories].reduce((sum, m) => sum + m.buffer.byteLength, 0);

async function measureMemory(): Promise<number | null> {
  const perf = performance as Performance & { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> };
  if (!crossOriginIsolated || !perf.measureUserAgentSpecificMemory) return null;
  try {
    return (await perf.measureUserAgentSpecificMemory()).bytes;
  } catch {
    return null; // Chromium only allows it in some modes; the WASM heap size is still recorded
  }
}

type Outcome<T> = { ms: number; value: T } | { error: string };

async function timed<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  const start = performance.now();
  try {
    const value = await fn();
    return { ms: performance.now() - start, value };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const strip = <T>(o: Outcome<T>) => ("ms" in o ? { ms: Math.round(o.ms * 10) / 10 } : o);

async function run(name: string) {
  const fixtures: Record<string, Uint8Array> = {};
  for (const f of FIXTURES) fixtures[f] = new Uint8Array(await (await fetch(`/fixtures/${f}.pdf`)).arrayBuffer());
  const canvas = document.createElement("canvas");
  document.body.append(canvas);

  // Snapshots of WASM heap and total page memory (Chromium only). The fixtures alone are in the baseline.
  const snapshot = async () => ({ wasm: wasmHeapBytes(), total: await measureMemory() });
  const memory: Record<string, { wasm: number; total: number | null }> = { baseline: await snapshot() };

  const initStart = performance.now();
  const init = await timed(async () => {
    const { engine } = await loaders[name]!();
    await engine.init();
    return engine;
  });
  const resources = performance
    .getEntriesByType("resource")
    .filter((r) => r.startTime >= initStart && !r.name.includes("/fixtures/"))
    .map((r) => new URL(r.name).pathname);
  if ("error" in init) return { engine: name, init };
  const engine = init.value;

  const files: Record<string, unknown> = {};
  let firstThumb: string | null = null;
  for (const f of FIXTURES) {
    const opened = await timed(() => engine.open(fixtures[f]!));
    if ("error" in opened) {
      files[f] = { open: opened };
      continue;
    }
    const doc: BenchDoc = opened.value;
    const entry: Record<string, unknown> = { pages: doc.pageCount, open: strip(opened) };
    if (doc.render) {
      const render = doc.render.bind(doc);
      const { width } = await doc.pageSize(0);
      entry["firstThumb"] = strip(await timed(() => render(0, THUMB_WIDTH / width, canvas)));
      if (f === "text") firstThumb = canvas.toDataURL("image/png");
      entry["firstView"] = strip(await timed(() => render(0, VIEW_SCALE, canvas)));
      entry["allThumbs"] = strip(
        await timed(async () => {
          for (let i = 0; i < doc.pageCount; i++) {
            const size = await doc.pageSize(i);
            await render(i, THUMB_WIDTH / size.width, canvas);
          }
        }),
      );
    }
    if (f === "mixed") memory["mixedOpen"] = await snapshot();
    doc.close();
    files[f] = entry;
  }

  const ops: Record<string, unknown> = {};
  const check = async (bytes: Uint8Array, expectedPages: number) => {
    const doc = await engine.open(bytes);
    const ok = doc.pageCount === expectedPages;
    doc.close();
    return { bytes: bytes.length, pagesOk: ok };
  };
  if (engine.merge) {
    const merge = engine.merge.bind(engine);
    const merged = await timed(() => merge(FIXTURES.map((f) => fixtures[f]!)));
    ops["merge"] = "error" in merged ? merged : { ...strip(merged), ...(await check(merged.value, 12 + 100 + 42)) };
  }
  if (engine.rotateAll) {
    const rotateAll = engine.rotateAll.bind(engine);
    const rotated = await timed(() => rotateAll(fixtures["mixed"]!));
    ops["rotateMixed"] = "error" in rotated ? rotated : { ...strip(rotated), ...(await check(rotated.value, 42)) };
  }

  return {
    engine: name,
    userAgent: navigator.userAgent,
    init: strip(init),
    resources,
    files,
    ops,
    memory: { ...memory, end: await snapshot() },
    firstThumb,
  };
}

const name = new URLSearchParams(location.search).get("engine") ?? "";
(window as unknown as { plyleafBench: Promise<unknown> }).plyleafBench = loaders[name]
  ? run(name)
  : Promise.resolve({ error: `unknown engine "${name}"` });
