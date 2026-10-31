// The page's one thumbnail cache, backed by the real engine. Every workspace shares it, so a page rendered in one
// view is ready in the next.
import { engine } from "~/engine/client";
import type { Bitmap } from "~/engine/types";
import { createThumbnailCache } from "./cache";

export { renderWidth } from "./cache";

export const thumbnails = createThumbnailCache<ImageBitmap>({
  render: (doc, page, width) => engine.render(doc, page, width),
  toImage: ({ pixels, width, height }: Bitmap) => createImageBitmap(new ImageData(pixels, width, height)),
  dispose: (image) => image.close(),
});
