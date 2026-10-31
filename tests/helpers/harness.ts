// The shape of `window.harness` on the test-harness pages (src/pages/test-harness).
import type { engine as Engine, EngineError } from "~/engine/client";
import type { thumbnails } from "~/thumbnails/thumbnails";

declare global {
  interface Window {
    harness: {
      engine: typeof Engine;
      EngineError: typeof EngineError;
      preloadEngine: () => void;
      thumbnails: typeof thumbnails;
    };
  }
}
