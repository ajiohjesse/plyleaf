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
  /** How it's encrypted, as MuPDF describes it ("Standard V5 R6 256-bit AES"), or null when it isn't. */
  encryption: string | null;
  /** What its permissions allow (everything, for a file that isn't encrypted or was opened with its owner password). */
  permissions: Permission[];
  /** The password that opened it: the user's (to open) or the owner's (to change permissions); null if none was needed. */
  unlockedWith: "user" | "owner" | null;
  /** Annotations on its pages (comments, highlights, drawings, stamps), not counting links and form fields. */
  annotations: number;
  /** Form fields (widgets) on its pages. */
  formFields: number;
  /** Its document information (title, author…), the fields it has. */
  metadata: Metadata;
}

/** Document information fields, as PDF names them. */
export type MetadataField =
  "Title" | "Author" | "Subject" | "Keywords" | "Creator" | "Producer" | "CreationDate" | "ModDate";

export const METADATA_FIELDS: readonly MetadataField[] = [
  "Title",
  "Author",
  "Subject",
  "Keywords",
  "Creator",
  "Producer",
  "CreationDate",
  "ModDate",
];

export type Metadata = Partial<Record<MetadataField, string>>;

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

/** What a PDF's permissions can allow, as MuPDF names them. */
export type Permission = "print" | "copy" | "edit" | "annotate" | "form" | "accessibility" | "assemble" | "print-hq";

export const PERMISSIONS: readonly Permission[] = [
  "print",
  "print-hq",
  "copy",
  "edit",
  "annotate",
  "form",
  "assemble",
  "accessibility",
];

/**
 * Encryption for the saved copy. "aes-256": a password to open it (optional: without one it opens freely but keeps
 * the permissions) and an owner password to change permissions (a random one if not given). "none": no encryption.
 * Passwords can't contain commas (MuPDF's save options are comma-separated).
 */
export type Security =
  | {
      encrypt: "aes-256";
      userPassword?: string;
      /** Instead of userPassword: the password that opened the document stays its password to open. */
      keepUserPassword?: boolean;
      ownerPassword?: string;
      permissions?: readonly Permission[];
    }
  | { encrypt: "none" };

/** Space between the baselines of a text mark's lines, in units of its size. */
export const LINE_HEIGHT = 1.2;

/** A colour as red, green and blue, each from 0 to 1. */
export type Rgb = readonly [number, number, number];

/** The standard PDF fonts text can be added in. They cover Latin, Greek and Cyrillic (see ~/editor/fonts). */
export type StandardFont = "helvetica" | "times" | "courier";

/**
 * Something drawn onto a page, in PDF points measured from the top-left corner of the page as it's shown (after its
 * own rotation and crop). Marks become part of the page's content, drawn over what's there in the order given.
 */
export type Mark = TextMark | ImageMark | ShapeMark;

export interface TextMark {
  type: "text";
  /** Lines are separated by "
", each 1.2 × size below the last. */
  text: string;
  /** Where the first line starts (or centres, or ends: see align)… */
  x: number;
  /** …and its baseline. */
  y: number;
  font: StandardFont;
  bold?: boolean;
  italic?: boolean;
  /** In points. */
  size: number;
  color: Rgb;
  /** Which end of each line x is: its start (the default), its middle or its end. */
  align?: "left" | "center" | "right";
  /** Degrees anticlockwise, about (x, y). */
  rotate?: number;
  /** 0 to 1; 1 (the default) is opaque. */
  opacity?: number;
}

/** An image, stretched to fill a box. */
export interface ImageMark {
  type: "image";
  /** Index into Edits.images. */
  image: number;
  /** The box's top-left corner and size, before any rotation. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees anticlockwise, about the box's centre. */
  rotate?: number;
  opacity?: number;
}

export type ShapeKind = "rectangle" | "ellipse" | "line" | "arrow";

/** A rectangle, an ellipse filling a box, a line, or a line with an arrowhead at its end. */
export interface ShapeMark {
  type: "shape";
  shape: ShapeKind;
  /** A rectangle's or ellipse's top-left corner; where a line starts. */
  x: number;
  y: number;
  /** A rectangle's or ellipse's size (positive); for a line, how far its end is from its start (either sign). */
  width: number;
  height: number;
  /** The outline's colour (a line's colour), or null for none. */
  stroke: Rgb | null;
  /** The inside's colour, or null for none. Lines have no inside. */
  fill: Rgb | null;
  /** The outline's width, in points. */
  lineWidth: number;
  opacity?: number;
}

/**
 * A four-cornered area of a page, in points from the shown page's top-left: upper-left, upper-right, lower-left and
 * lower-right corners as x, y pairs (the order PDF quad points use).
 */
export type Quad = [number, number, number, number, number, number, number, number];

/** Text on a page between two points, in reading order: where it is, line by line, and what it says. */
export interface TextSelection {
  quads: Quad[];
  text: string;
}

/** Text marked up with a standard PDF annotation, which readers list as a comment and can change or remove. */
export interface MarkupAnnotation {
  type: "highlight" | "underline" | "strikeout";
  quads: Quad[];
  color: Rgb;
}

/** Freehand drawing: strokes through points (shown-page points), each a line through its points. */
export interface InkAnnotation {
  type: "ink";
  strokes: { x: number; y: number }[][];
  color: Rgb;
  /** In points. */
  width: number;
  opacity?: number;
}

/** A comment: a note icon with its top-left at (x, y) that opens to show the text. */
export interface NoteAnnotation {
  type: "note";
  x: number;
  y: number;
  text: string;
  color: Rgb;
}

/**
 * A rubber stamp: a standard PDF stamp name ("Approved", "Draft"…, shown in capitals) or words of the user's own, in a
 * box. Readers draw it from the appearance MuPDF makes, which is always STAMP_RATIO as tall as it is wide.
 */
export interface StampAnnotation {
  type: "stamp";
  x: number;
  y: number;
  width: number;
  name: string;
  color: Rgb;
}

export type Annotation = MarkupAnnotation | InkAnnotation | NoteAnnotation | StampAnnotation;

/** A stamp's height for its width. */
export const STAMP_RATIO = 5 / 19;

/** A note annotation's icon is this many points square. */
export const NOTE_SIZE = 20;

/** Marks to draw on pages and annotations to add to them, by page index. */
export interface Edits {
  pages: { page: number; marks: Mark[]; annotations?: Annotation[] }[];
  /** JPEG or PNG files that image marks draw. An image used by many marks is stored once in the PDF. */
  images?: Uint8Array[];
}

/** What to change in a copy of an open document before saving it (Optimize & secure tools). */
export interface TransformOptions {
  /** Drawn onto the pages first, so the other options apply to them too. */
  edits?: Edits;
  /** Defaults to keeping the document's own encryption. */
  security?: Security;
  compress?: CompressLevel;
  /** Images become grey for real; everything else on the pages is greyed by a full-page Saturation blend. */
  grayscale?: boolean;
  /**
   * Draws form fields ("forms") or form fields and annotations ("all") into the page content, so they can't be
   * changed and look the same everywhere. Links stay links.
   */
  flatten?: "forms" | "all";
  /**
   * Document information. `set`: fields to change (an empty string removes one); the XMP copy is dropped so readers
   * don't show the old values. "remove": no document information, XMP or applications' private data at all.
   */
  metadata?: { set: Metadata } | "remove";
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
  /** The password given doesn't open the PDF. */
  | "wrong-password"
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
