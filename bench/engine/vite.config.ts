import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Cross-origin isolation lets Chromium report total memory (performance.measureUserAgentSpecificMemory).
const headers = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  logLevel: "warn",
  build: { target: "es2024", outDir: "dist", emptyOutDir: true },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["mupdf", "@embedpdf/pdfium"] },
  server: { headers },
  preview: { headers, port: 4400, strictPort: true },
});
