// Text to PDF (D-043): plain text, Markdown and HTML become one HTML document with our page and reading styles, which
// the engine lays out with MuPDF. Pure, apart from Markdown's parser, which loads only when it's needed.

export type TextFormat = "html" | "markdown" | "text";

export const PAGE_SIZES = {
  a4: { name: "A4", width: 595, height: 842 },
  letter: { name: "US Letter", width: 612, height: 792 },
} as const;
export type PageSizeId = keyof typeof PAGE_SIZES;

/** The paper people print on where `locale` is: US Letter in the US and Canada, A4 elsewhere. */
export const localPageSize = (locale: string): PageSizeId => (/-(US|CA)$/i.test(locale) ? "letter" : "a4");

/** Margins in points. */
export const MARGINS = { narrow: 36, normal: 54, wide: 72 } as const;
export type MarginId = keyof typeof MARGINS;

export type FontId = "sans" | "serif" | "mono";
export const FONT_FAMILIES: Record<FontId, string> = {
  sans: "sans-serif",
  serif: "serif",
  mono: "monospace",
};

/** Text sizes offered for plain text and Markdown, in points. HTML sets its own, from a 12 pt base. */
export const FONT_SIZES = [10, 11, 12, 14, 16] as const;
export const HTML_FONT_SIZE = 12;

export interface Layout {
  size: PageSizeId;
  landscape: boolean;
  margin: MarginId;
}

/** The page size in points, turned for landscape. */
export function pageSize({ size, landscape }: Pick<Layout, "size" | "landscape">) {
  const { width, height } = PAGE_SIZES[size];
  return landscape ? { width: height, height: width } : { width, height };
}

/** The format a file's name says it's in; anything else counts as plain text. */
export function formatOf(name: string): TextFormat {
  if (/\.(x?html?|xht)$/i.test(name)) return "html";
  if (/\.(md|markdown|mdown|mkd|mkdn)$/i.test(name)) return "markdown";
  return "text";
}

/** File types the text tools take, for a file picker's accept attribute. */
export const TEXT_ACCEPT = ".txt,.text,.log,.csv,.md,.markdown,.mdown,.mkd,.html,.htm,.xhtml,text/*";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ESCAPES[char]!);

/** Tabs out to the next stop every `width` columns, since the layout engine shows a tab as one space. */
export function expandTabs(text: string, width = 4): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.includes("\t")) return line;
      let out = "";
      for (const char of line) out += char === "\t" ? " ".repeat(width - (Array.from(out).length % width)) : char;
      return out;
    })
    .join("\n");
}

/** The page rule: margins on every page. Put last, so it wins over a page's own. */
export const pageCss = (margin: MarginId) => `@page { margin: ${MARGINS[margin]}pt; }`;

/** How Markdown reads: plain, print-like styles that MuPDF's CSS supports. */
export const READING_CSS = `
body { margin: 0; line-height: 1.45; }
h1, h2, h3, h4, h5, h6 { line-height: 1.2; margin: 1.2em 0 0.5em; page-break-after: avoid; }
h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1.1em; }
h5, h6 { font-size: 1em; }
p, ul, ol, dl, table, pre, blockquote { margin: 0 0 0.8em; }
ul, ol { padding-left: 1.6em; }
li { margin: 0.15em 0; }
/* The fonts have no circle or square bullet, so every level gets a disc. */
ul { list-style-type: disc; }
a { color: #3b2db8; }
code { font-family: monospace; font-size: 0.9em; background-color: #f1eff8; }
pre { font-family: monospace; font-size: 0.85em; line-height: 1.35; white-space: pre-wrap; background-color: #f1eff8; padding: 0.6em 0.8em; }
pre code { background-color: transparent; font-size: 1em; }
blockquote { margin-left: 0; padding-left: 0.9em; border-left: 3pt solid #c9c4e3; color: #4a4760; }
table { border-collapse: collapse; }
th, td { border: 0.75pt solid #b9b5cc; padding: 0.25em 0.5em; text-align: left; vertical-align: top; }
th { background-color: #f1eff8; font-weight: bold; }
hr { border: 0; border-top: 0.75pt solid #b9b5cc; margin: 1.2em 0; }
img { max-width: 100%; }
`;

function document(body: string, css: string, title: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}

export interface TextStyle {
  font: FontId;
  fontSize: number;
}

/** Plain text as it was typed: every line and space kept, long lines wrapped. */
export function textToHtml(text: string, style: TextStyle, layout: Layout, title = ""): string {
  const css = `body { margin: 0; font-family: ${FONT_FAMILIES[style.font]}; line-height: 1.35; }
pre { margin: 0; white-space: pre-wrap; font-family: ${FONT_FAMILIES[style.font]}; }
${pageCss(layout.margin)}`;
  const normalised = expandTabs(text.replace(/\r\n?/g, "\n"));
  return document(`<pre>${escapeHtml(normalised)}</pre>`, css, title);
}

/** Markdown (CommonMark with GitHub's tables, task lists and strikethrough) in the reading styles. */
export async function markdownToHtml(markdown: string, style: TextStyle, layout: Layout, title = ""): Promise<string> {
  const { marked } = await import("marked");
  const parsed = await marked.parse(expandTabs(markdown.replace(/\r\n?/g, "\n")), { gfm: true, async: true });
  const body = withHeadingIds(parsed);
  const css = `${READING_CSS}\nbody { font-family: ${FONT_FAMILIES[style.font]}; }\n${pageCss(layout.margin)}`;
  return document(body, css, title);
}

/** A heading's anchor as GitHub makes it: "Hello, World!" → "hello-world". */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/**
 * Gives each heading in generated HTML an id from its text, the way GitHub does ("#install", "#install-1" for the
 * second), so links like [see below](#install) go somewhere.
 */
export function withHeadingIds(html: string): string {
  const used = new Map<string, number>();
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
    const text = inner
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const base = slug(text) || "section";
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen}`;
    return `<h${level} id="${escapeHtml(id)}">${inner}</h${level}>`;
  });
}

/** The first top-level Markdown heading ("# Title"), as a title for the PDF. */
export function markdownTitle(markdown: string): string {
  const heading = /^ {0,3}#[ \t]+(.+?)[ \t#]*$/m.exec(markdown);
  return heading ? heading[1]!.replace(/[*_`]/g, "").trim() : "";
}

/** An HTML document's <title>, if it has one. */
export function htmlTitle(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!title) return "";
  return title[1]!
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a name in a page (an image's src, a stylesheet's href) is a file the user has to add, not one inside it. */
export const needsFile = (url: string) => !/^(data|blob|about|javascript):/i.test(url.trim()) && url.trim() !== "";

/** The file name a reference ends in ("img/photo%201.png?v=2" → "photo 1.png"), lowercased for matching. */
export function referencedName(url: string): string {
  const path = url.trim().replace(/[?#].*$/, "");
  const last = path.split(/[\\/]/).pop() ?? "";
  try {
    return decodeURIComponent(last).toLowerCase();
  } catch {
    return last.toLowerCase();
  }
}

/** Whether a reference points to another site (it can't be fetched: nothing leaves the device). */
export const isRemote = (url: string) => /^([a-z][a-z0-9+.-]*:)?\/\//i.test(url.trim());

/**
 * A text file's characters: UTF-8 (the usual), UTF-16 with a byte-order mark (Windows Notepad's "Unicode"), or, for
 * bytes that aren't valid UTF-8, Windows-1252 (older Windows files).
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    // Drops a UTF-8 byte-order mark.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
