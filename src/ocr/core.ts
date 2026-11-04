// Tesseract's worker script and WASM builds, as our own assets. Which build loads depends on what the browser's
// WebAssembly supports (relaxed SIMD is fastest); each is about 4 MB and is fetched only when OCR starts.
import coreRelaxedSimd from "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js?url";
import coreSimd from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import corePlain from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import workerScript from "tesseract.js/dist/worker.min.js?url";
import { relaxedSimd, simd } from "wasm-feature-detect";

/** Absolute URLs (Tesseract's worker resolves them against its own script otherwise). */
const absolute = (url: string) => new URL(url, location.href).href;

export async function tesseractPaths(): Promise<{ workerPath: string; corePath: string }> {
  const core = (await relaxedSimd()) ? coreRelaxedSimd : (await simd()) ? coreSimd : corePlain;
  return { workerPath: absolute(workerScript), corePath: absolute(core) };
}
