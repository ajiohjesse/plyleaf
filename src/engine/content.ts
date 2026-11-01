// Low-level helpers for adding to a page's content: its own resources dictionary, and new content drawn after what's
// there with the page's graphics state restored first.
import type * as mupdf from "mupdf";

/**
 * The page's own resources dictionary. Resources inherited from the page tree are copied onto the page, so what's
 * added goes on this page only.
 */
export function ownResources(pdf: mupdf.PDFDocument, page: mupdf.PDFObject): mupdf.PDFObject {
  let resources = page.get("Resources");
  if (!resources.isDictionary()) {
    resources = pdf.newDictionary();
    const inherited = page.getInheritable("Resources");
    if (inherited.isDictionary()) inherited.forEach((value, key) => resources.put(key, value));
    page.put("Resources", resources);
  }
  return resources;
}

/** `dict[key]`, a dictionary, created if it isn't there. */
export function subDictionary(pdf: mupdf.PDFDocument, dict: mupdf.PDFObject, key: string): mupdf.PDFObject {
  let sub = dict.get(key);
  if (!sub.isDictionary()) {
    sub = pdf.newDictionary();
    dict.put(key, sub);
  }
  return sub;
}

/** A key `dict` doesn't have yet: `prefix`, or `prefix2`, `prefix3`… */
export function freeName(dict: mupdf.PDFObject, prefix: string): string {
  if (dict.get(prefix).isNull()) return prefix;
  for (let n = 2; ; n++) if (dict.get(`${prefix}${n}`).isNull()) return `${prefix}${n}`;
}

/**
 * Wraps the page's content in q/Q, so whatever state it leaves (a transform, a clip, a colour) doesn't reach what's
 * added, then draws `after` on top.
 */
export function drawOnTop(pdf: mupdf.PDFDocument, page: mupdf.PDFObject, after: string) {
  const contents = page.get("Contents");
  const streams = contents.isArray()
    ? Array.from({ length: contents.length }, (_, i) => contents.get(i))
    : contents.isNull()
      ? []
      : [contents];
  const wrapped = pdf.newArray();
  wrapped.push(pdf.addStream("q\n", {}));
  for (const stream of streams) wrapped.push(stream);
  wrapped.push(pdf.addStream(`\nQ ${after}\n`, {}));
  page.put("Contents", wrapped);
}
