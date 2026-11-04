// Builds small PDFs for tests with MuPDF, so fixtures are licence-clean and visible in the code.
import * as mupdf from "mupdf";

export interface TestPage {
  width: number;
  height: number;
  /** /Rotate set on the page itself. */
  rotate?: 0 | 90 | 180 | 270;
}

/**
 * Each page is white with its top-left quadrant filled red and its number written in Helvetica, so a render shows
 * which way up the page is.
 */
export function makePdf(
  pages: TestPage[],
  options: { save?: string; inheritedRotate?: number } = {},
): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  pages.forEach(({ width, height, rotate = 0 }, i) => {
    const contents = [
      `1 0 0 rg 0 ${height / 2} ${width / 2} ${height / 2} re f`,
      `0 g BT /F1 12 Tf ${width / 2 + 10} 20 Td (Page ${i + 1}) Tj ET`,
    ].join("\n");
    doc.insertPage(-1, doc.addPage([0, 0, width, height], rotate, { Font: { F1: font } }, contents));
  });
  if (options.inheritedRotate !== undefined) {
    doc.getTrailer().get("Root").get("Pages").put("Rotate", options.inheritedRotate);
    // addPage always writes the page's own /Rotate, which would override the inherited one.
    for (let i = 0; i < pages.length; i++) doc.findPage(i).delete("Rotate");
  }
  const buffer = doc.saveToBuffer(options.save ?? "compress");
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}

export const A4 = { width: 595, height: 842 };
export const LETTER = { width: 612, height: 792 };

/** A one-page A4 PDF showing a big photo-like image stored losslessly (noisy gradients compress badly with Flate). */
export function photoPdf(width = 1600, height = 2200): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument();
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
  const pixels = pixmap.getPixels();
  let seed = 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const i = y * pixmap.getStride() + x * 3;
      pixels[i] = (x * 255) / width;
      pixels[i + 1] = (y * 255) / height;
      pixels[i + 2] = 128 + (seed % 32);
    }
  }
  const image = doc.addImage(new mupdf.Image(pixmap));
  doc.insertPage(
    -1,
    doc.addPage([0, 0, A4.width, A4.height], 0, { XObject: { I: image } }, "q 595 0 0 842 0 0 cm /I Do Q"),
  );
  const buffer = doc.saveToBuffer("compress");
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}

/** An AES-256 encrypted copy of `bytes`: with `user` it needs that password to open; `permissions` is the /P value. */
export function encryptedPdf(
  bytes: Uint8Array,
  { user = "", owner, permissions = -4 }: { user?: string; owner: string; permissions?: number },
): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument(bytes);
  const buffer = doc.saveToBuffer(
    `encrypt=aes-256,user-password=${user},owner-password=${owner},permissions=${permissions}`,
  );
  const encrypted = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return encrypted;
}

/**
 * A 300 × 300 pt page with a text form field "name" (its appearance a blue box at the bottom left), a red square
 * annotation (right of centre) and a link (bottom).
 */
export function formsPdf(): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument();
  doc.insertPage(-1, doc.addPage([0, 0, 300, 300], 0, {}, ""));
  const page = doc.loadPage(0);
  const square = page.createAnnotation("Square");
  // MuPDF places annotations from the top left; this one is symmetric, so the same in PDF coordinates.
  square.setRect([150, 100, 250, 200]);
  square.setColor([1, 0, 0]);
  square.setInteriorColor([1, 0, 0]);
  square.update();
  page.createLink([20, 20, 120, 40], "https://example.com/");
  const appearance = doc.addStream("0 0 1 rg 0 0 100 30 re f", {
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, 100, 30],
  });
  const pageObject = doc.findPage(0);
  const widget = doc.addObject({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Tx",
    T: "(name)",
    V: "(Ada)",
    Rect: [20, 100, 120, 130],
    F: 4,
    AP: { N: appearance },
    P: pageObject,
  });
  pageObject.get("Annots").push(widget);
  doc
    .getTrailer()
    .get("Root")
    .put("AcroForm", doc.addObject({ Fields: [widget] }));
  page.destroy();
  const buffer = doc.saveToBuffer("compress");
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}

/** Where `interactiveFormPdf`'s fields are, as (x0, y0, x1, y1) points from the top-left of its 400 × 400 page. */
export const FORM_FIELDS = {
  name: [20, 40, 220, 60],
  notes: [20, 80, 220, 140],
  agree: [20, 164, 36, 180],
  sizeS: [20, 204, 36, 220],
  sizeM: [50, 204, 66, 220],
  sizeL: [80, 204, 96, 220],
  country: [20, 240, 160, 260],
  colour: [200, 240, 300, 280],
  ref: [240, 40, 380, 60],
  sig: [200, 340, 380, 380],
} as const;

/**
 * A 400 × 400 pt page with one of each kind of form field (see FORM_FIELDS): text "name" (tooltip "Full name"),
 * multi-line "notes", check box "agree" (on state "Yes"), radio group "size" (S, M, L), combo box "country", list box
 * "colour" (export values r, g, b), read-only "ref" ("R-1") and signature "sig". Check boxes and radio buttons have
 * appearances (a filled square or dot when on), as forms made by real apps do.
 */
export function interactiveFormPdf(): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  const contents = `0 g BT /F1 10 Tf 20 370 Td (Application form) Tj ET`;
  doc.insertPage(-1, doc.addPage([0, 0, 400, 400], 0, { Font: { F1: font } }, contents));
  const page = doc.findPage(0);
  const annots = doc.newArray();
  page.put("Annots", annots);
  const fields = doc.newArray();
  // From top-left boxes to PDF rectangles.
  const rect = ([x0, y0, x1, y1]: readonly [number, number, number, number]) => [x0, 400 - y1, x1, 400 - y0];
  const form = (content: string, size: number) =>
    doc.addStream(content, { Type: "XObject", Subtype: "Form", BBox: [0, 0, size, size] });
  const widget = (box: readonly [number, number, number, number], dict: Record<string, unknown>) => {
    const object = doc.addObject({ Type: "Annot", Subtype: "Widget", F: 4, P: page, Rect: rect(box), ...dict });
    annots.push(object);
    return object;
  };
  const text = { FT: "Tx", DA: "(/Helv 0 Tf 0 g)" };
  fields.push(widget(FORM_FIELDS.name, { ...text, T: "(name)", TU: "(Full name)" }));
  fields.push(widget(FORM_FIELDS.notes, { ...text, T: "(notes)", Ff: 4096, DA: "(/Helv 10 Tf 0 g)" }));
  fields.push(widget(FORM_FIELDS.ref, { ...text, T: "(ref)", V: "(R-1)", Ff: 1 }));
  fields.push(
    widget(FORM_FIELDS.agree, {
      FT: "Btn",
      T: "(agree)",
      V: doc.newName("Off"),
      AS: doc.newName("Off"),
      AP: { N: { Yes: form("0 g 3 3 10 10 re f", 16), Off: form("", 16) } },
    }),
  );
  const radio = doc.addObject({ FT: "Btn", T: "(size)", Ff: 49152, V: doc.newName("Off"), Kids: [] });
  const dot = "0 g 8 4 m 10.2 4 12 5.8 12 8 c 12 10.2 10.2 12 8 12 c 5.8 12 4 10.2 4 8 c 4 5.8 5.8 4 8 4 c f";
  for (const state of ["S", "M", "L"] as const) {
    const kid = widget(FORM_FIELDS[`size${state}`], {
      Parent: radio,
      AS: doc.newName("Off"),
      AP: { N: { [state]: form(dot, 16), Off: form("", 16) } },
    });
    radio.get("Kids").push(kid);
  }
  fields.push(radio);
  fields.push(
    widget(FORM_FIELDS.country, {
      FT: "Ch",
      T: "(country)",
      Ff: 131072,
      Opt: ["(Ghana)", "(Nigeria)", "(Kenya)"],
      DA: "(/Helv 0 Tf 0 g)",
    }),
  );
  fields.push(
    widget(FORM_FIELDS.colour, {
      FT: "Ch",
      T: "(colour)",
      Opt: [
        ["(r)", "(Red)"],
        ["(g)", "(Green)"],
        ["(b)", "(Blue)"],
      ],
      DA: "(/Helv 10 Tf 0 g)",
    }),
  );
  fields.push(widget(FORM_FIELDS.sig, { FT: "Sig", T: "(sig)" }));
  doc
    .getTrailer()
    .get("Root")
    .put("AcroForm", doc.addObject({ Fields: fields, DR: { Font: { Helv: font } }, DA: "(/Helv 0 Tf 0 g)" }));
  const buffer = doc.saveToBuffer("compress");
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}

/** A PDF cut off before its cross-reference table and trailer, as a broken download would be. */
export function truncatedPdf(pageCount = 3): Uint8Array<ArrayBuffer> {
  const bytes = makePdf(
    Array.from({ length: pageCount }, () => A4),
    { save: "" },
  );
  const text = new TextDecoder("latin1").decode(bytes);
  return bytes.slice(0, text.lastIndexOf("xref"));
}

/** A PDF with document information, an XMP copy of it and an application's private data. */
export function metadataPdf(): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument(makePdf([A4, A4]));
  doc.setMetaData("info:Title", "Quarterly secrets");
  doc.setMetaData("info:Author", "Jane Example");
  doc.setMetaData("info:Creator", "Writer 9");
  doc.setMetaData("info:CreationDate", "D:20250102030405Z");
  const root = doc.getTrailer().get("Root");
  root.put(
    "Metadata",
    doc.addStream("<x:xmpmeta><dc:title>Quarterly secrets</dc:title></x:xmpmeta>", {
      Type: "Metadata",
      Subtype: "XML",
    }),
  );
  root.put("PieceInfo", doc.addObject({ Writer: { Private: "(Jane's draft)" } }));
  const buffer = doc.saveToBuffer("");
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}

/** An A4 page of lines of 12 pt Helvetica from 72 points in, with baselines 100, 120, 140… points from the top. */
export function textPdf(lines: string[]): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);
  const contents = lines
    .map((line, i) => `BT /F1 12 Tf 72 ${A4.height - 100 - i * 20} Td (${escape(line)}) Tj ET`)
    .join("\n");
  doc.insertPage(-1, doc.addPage([0, 0, A4.width, A4.height], 0, { Font: { F1: font } }, contents));
  const buffer = doc.saveToBuffer("compress");
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}
