// Types shared by the engine worker and the main thread. Keep this file free of runtime imports so that pages can
// import it without pulling in the engine.

/** Largest bitmap side we render, in pixels. Bigger requests would need hundreds of MB of WASM memory. */
export const MAX_RENDER_SIDE = 8192;

/** Identifies a document the worker holds open. Only valid for the worker that issued it. */
export type DocId = string;

export type Rotation = 0 | 90 | 180 | 270;

export interface PageInfo {
  /** Size in PDF points (1/72 in) as displayed, i.e. after the page's own rotation. */
  width: number;
  height: number;
  /** The page's /Rotate value. */
  rotation: Rotation;
}

export interface DocInfo {
  id: DocId;
  /** What the file was. An image opens as a PDF with one page per frame (a multi-page TIFF has several). */
  source: "pdf" | "image";
  pageCount: number;
  pages: PageInfo[];
  /** MuPDF had to repair the file's structure to open it. The output of any operation is a clean file. */
  repaired: boolean;
}

/**
 * Part of a page to keep, as fractions (0 to 1) of the page as it's shown with its own rotation, measured from the
 * top-left corner.
 */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A page size to put a page on, in PDF points, with a margin on every side. The page is scaled to fit inside the
 * margins (up or down, keeping its shape) and centred.
 */
export interface Fit {
  width: number;
  height: number;
  margin: number;
}

/** One page of an assembled document: a page of an open document, or a new blank page. */
export type PageSpec =
  | {
      doc: DocId;
      page: number;
      /** Added to the page's own rotation (after cropping). */
      rotate?: Rotation;
      /** Sets the page's crop box, so only this part shows. */
      crop?: Crop;
      /** Puts the page (as it's shown, after crop and rotation) on a page of this size. Its annotations are left out. */
      fit?: Fit;
    }
  | { blank: { width: number; height: number } };

/** How to save a page as an image. */
export interface ImageOptions {
  /** Pixels per inch. */
  dpi: number;
  format: "jpeg" | "png";
  /** JPEG quality, 1–100. Defaults to 90. */
  quality?: number;
}

/** An image found in a page, ready to save. */
export interface ExtractedImage {
  /** Its object number, to skip it on later pages that use it again. */
  id: number;
  /** "jpeg": the PDF's own JPEG, byte for byte. "png": decoded, lossless, with any transparency. */
  format: "jpeg" | "png";
  width: number;
  height: number;
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * How hard Compress works. "low": lossless (shared objects merged, streams and fonts compressed, object streams).
 * "recommended": also images brought down to 150 dpi for their page, as JPEG quality 70. "extreme": 96 dpi, quality 45.
 */
export type CompressLevel = "low" | "recommended" | "extreme";

/** What to change in a copy of an open document before saving it (Optimize & secure tools). */
export interface TransformOptions {
  compress?: CompressLevel;
  /** Images become grey for real; everything else on the pages is greyed by a full-page Saturation blend. */
  grayscale?: boolean;
}

/** An RGBA bitmap, 4 bytes per pixel, not premultiplied. */
export interface Bitmap {
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

export type EngineErrorCode =
  /** The bytes aren't a PDF MuPDF can open, even with repair. */
  | "invalid-file"
  /** The bytes are an image this browser and MuPDF can't decode (damaged, or a format variant we can't read). */
  | "invalid-image"
  /** The PDF is encrypted with a user password. */
  | "password-required"
  /** The DocId isn't open in this worker (closed, or issued by a recycled worker). */
  | "unknown-document"
  /** An argument is out of range (page index, render size, blank page size). */
  | "invalid-argument"
  /** MuPDF couldn't allocate memory for this operation. The documents stay open and the engine stays usable. */
  | "out-of-memory"
  /** The worker died or its WASM aborted. It has been restarted, and the documents it held are gone. */
  | "engine-crashed"
  /** The engine couldn't be loaded (offline before it was cached, say). The next call tries again. */
  | "engine-unavailable"
  /** Anything else MuPDF threw. */
  | "engine-failure";
