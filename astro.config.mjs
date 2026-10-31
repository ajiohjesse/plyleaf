// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://plyleaf.com",
  output: "static",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // The engine worker code-splits MuPDF out of its entry (see src/engine/worker.ts), which needs ES module workers.
    worker: { format: "es" },
    // MuPDF finds its .wasm next to its own module; pre-bundling would move the module and break that in dev.
    optimizeDeps: { exclude: ["mupdf"] },
  },
});
