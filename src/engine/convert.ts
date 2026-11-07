// Text conversions (D-043): HTML laid out into PDF pages by MuPDF's own HTML engine, and a PDF's text read back out.
// Nothing here needs more than the MuPDF the engine already loads.
import * as mupdf from "mupdf";
import { EngineError } from "./errors";
import type { HtmlPdfOptions, HtmlPdfResult } from "./types";

/** Most pages a conversion may make. A huge text file would otherwise fill the WASM heap with pages first. */
export const MAX_HTML_PAGES = 5000;
/** Largest page side in points: the PDF spec's limit. */
const MAX_SIDE = 14_400;

type LinkDest = ReturnType<mupdf.Document["resolveLinkDestination"]>;

interface FoundLink {
  bounds: mupdf.Rect;
  /** An address outside the document, or the place inside it a link goes to. */
  to: { uri: string } | { dest: LinkDest };
}

/** The links on a laid-out page, where they point. Links to anchors that weren't found are left out. */
function pageLinks(doc: mupdf.Document, page: mupdf.Page): FoundLink[] {
  const found: FoundLink[] = [];
  for (const link of page.getLinks()) {
    const uri = link.getURI();
    if (link.isExternal()) {
      // Only addresses a reader can open; "javascript:" and the like are dropped.
      if (/^(https?|mailto|tel|ftp):/i.test(uri)) found.push({ bounds: link.getBounds(), to: { uri } });
      continue;
    }
    if (doc.resolveLink(link) < 0) continue;
    // Scrolled to the target's top, at the reader's zoom ("XYZ" would come out with no zoom: "zoom=nan").
    found.push({ bounds: link.getBounds(), to: { dest: { ...doc.resolveLinkDestination(link), type: "FitH" } } });
  }
  return found;
}

/**
 * Lays out an HTML document (with its CSS) on pages of a size, as a PDF: its text stays text (selectable, searchable,
 * in fonts subset to the characters used) and its links keep working. Margins come from the HTML's `@page` rule.
 * Images must be inside the HTML already (as data: URLs); others are left out.
 */
export function htmlToPdf(html: string, options: HtmlPdfOptions): HtmlPdfResult {
  const { width, height, fontSize, title } = options;
  if (!(width >= 72 && width <= MAX_SIDE && height >= 72 && height <= MAX_SIDE)) {
    throw new EngineError("invalid-argument", `A page can't be ${width} × ${height} pt`);
  }
  if (!(fontSize >= 4 && fontSize <= 72)) throw new EngineError("invalid-argument", `No ${fontSize} pt text`);

  const source = mupdf.Document.openDocument(new TextEncoder().encode(html), "text/html");
  let out: mupdf.PDFDocument | null = null;
  try {
    source.layout(width, height, fontSize);
    const count = source.countPages();
    if (count > MAX_HTML_PAGES) {
      throw new EngineError("too-large", `This would make ${count} pages; the most is ${MAX_HTML_PAGES}`);
    }
    const buffer = new mupdf.Buffer();
    const links: FoundLink[][] = [];
    try {
      const writer = new mupdf.DocumentWriter(buffer, "pdf", "");
      try {
        for (let index = 0; index < count; index++) {
          const page = source.loadPage(index);
          try {
            const device = writer.beginPage(page.getBounds());
            page.run(device, mupdf.Matrix.identity);
            writer.endPage();
            links.push(pageLinks(source, page));
          } finally {
            page.destroy();
          }
        }
        writer.close();
      } finally {
        writer.destroy();
      }
      // Copy out of WASM memory: the view dies with the buffer (or when the heap grows).
      out = new mupdf.PDFDocument(buffer.asUint8Array().slice());
    } finally {
      buffer.destroy();
    }

    // The writer draws pages only; links go back on as link annotations.
    links.forEach((onPage, index) => {
      if (onPage.length === 0) return;
      const page = out!.loadPage(index);
      try {
        for (const { bounds, to } of onPage) {
          const uri = "uri" in to ? to.uri : out!.formatLinkURI(to.dest);
          page.createLink(bounds, uri);
        }
      } finally {
        page.destroy();
      }
    });

    if (title?.trim()) out.setMetaData("info:Title", title.trim());
    out.setMetaData("info:Producer", "Plyleaf");
    // The writer embeds whole fonts (a CJK one is megabytes); keep only the characters used.
    out.subsetFonts();
    const saved = out.saveToBuffer("garbage,compress");
    try {
      return { bytes: saved.asUint8Array().slice(), pageCount: count };
    } finally {
      saved.destroy();
    }
  } finally {
    out?.destroy();
    source.destroy();
  }
}

/** Each page's text in reading order, as MuPDF reads it: lines joined, paragraphs apart, trailing space trimmed. */
export function pdfText(pdf: mupdf.PDFDocument): string[] {
  const pages: string[] = [];
  for (let index = 0; index < pdf.countPages(); index++) {
    const page = pdf.loadPage(index);
    try {
      const text = page.toStructuredText("preserve-whitespace");
      try {
        pages.push(
          text
            .asText()
            // Trailing spaces of any kind, line by line.
            .replace(/[^\S\n]+$/gm, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
        );
      } finally {
        text.destroy();
      }
    } finally {
      page.destroy();
    }
  }
  return pages;
}
