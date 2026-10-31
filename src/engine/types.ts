// Types shared by the engine worker and the main thread. Keep this file free of runtime imports so that pages can
// import it without pulling in the engine.

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

/** One page of an assembled document: a page of an open document, or a new blank page. */
export type PageSpec =
  | {
      doc: DocId;
      page: number;
      /** Added to the page's own rotation (after cropping). */
      rotate?: Rotation;
      /** Sets the page's crop box, so only this part shows. */
      crop?: Crop;
    }
  | { blank: { width: number; height: number } };

/** An RGBA bitmap, 4 bytes per pixel, not premultiplied. */
export interface Bitmap {
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

export type EngineErrorCode =
  /** The bytes aren't a PDF MuPDF can open, even with repair. */
  | "invalid-file"
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
