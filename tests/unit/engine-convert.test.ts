import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { htmlToPdf, MAX_HTML_PAGES, pdfText } from "~/engine/convert";
import { EngineError } from "~/engine/errors";
import { openPdf } from "~/engine/ops";
import { markdownToHtml, textToHtml, type Layout } from "~/convert/text";
import { A4, LETTER, textPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";
import { readWithPdfjs } from "../helpers/viewers";

const opened: mupdf.PDFDocument[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});
const open = (bytes: Uint8Array) => {
  const doc = openPdf(bytes);
  opened.push(doc);
  return doc;
};

const layout: Layout = { size: "a4", landscape: false, margin: "normal" };
const a4 = { ...A4, fontSize: 12 };

test("lays HTML out on pages of the size asked for, as real text", async () => {
  const result = htmlToPdf("<h1>Quarterly report</h1><p>Revenue grew in every region.</p>", { ...a4, title: "Q3" });
  expect(result.pageCount).toBe(1);
  const doc = open(result.bytes);
  expect(doc.countPages()).toBe(1);
  expect(doc.loadPage(0).getBounds()).toEqual([0, 0, A4.width, A4.height]);
  expect(doc.getMetaData("info:Title")).toBe("Q3");
  expect(pdfText(doc)).toEqual(["Quarterly report\n\nRevenue grew in every region."]);
  expect((await readWithPdfjs(result.bytes))[0]!.text).toContain("Revenue grew in every region.");
  expect(await qpdfCheck(result.bytes)).toBe(0);
});

test("long documents flow onto more pages, and landscape turns the page", () => {
  const html = "<p>A paragraph of filler text for the page.</p>".repeat(200);
  const portrait = htmlToPdf(html, a4);
  expect(portrait.pageCount).toBeGreaterThan(3);
  const landscape = htmlToPdf(html, { width: LETTER.height, height: LETTER.width, fontSize: 12 });
  expect(open(landscape.bytes).loadPage(0).getBounds()).toEqual([0, 0, LETTER.height, LETTER.width]);
  expect(landscape.pageCount).toBeGreaterThan(portrait.pageCount);
});

test("uses the margins from the page rule", () => {
  const html = (margin: number) => `<style>@page { margin: ${margin}pt } body { margin: 0 }</style><p>Corner</p>`;
  for (const margin of [36, 72]) {
    const doc = open(htmlToPdf(html(margin), a4).bytes);
    const text = doc.loadPage(0).toStructuredText("");
    const [block] = JSON.parse(text.asJSON()).blocks as { bbox: { x: number; y: number } }[];
    expect(Math.round(block!.bbox.x)).toBe(margin);
    text.destroy();
  }
});

test("keeps links: web addresses, and links inside the document to where they point", () => {
  const html = `<p><a href="https://example.com/a">Site</a> <a href="#end">To the end</a>
    <a href="javascript:alert(1)">Script</a> <a href="#nowhere">Gone</a></p>
    <p style="page-break-before: always">${"<br>".repeat(80)}</p><h2 id="end">End</h2>`;
  const result = htmlToPdf(html, a4);
  const doc = open(result.bytes);
  const uris = doc
    .loadPage(0)
    .getLinks()
    .map((link) => link.getURI());
  expect(uris).toHaveLength(2);
  expect(uris).toContain("https://example.com/a");
  const inside = uris.find((uri) => uri.startsWith("#"))!;
  expect(doc.resolveLink(inside)).toBe(result.pageCount - 1);
});

test("embeds only the characters used, even for Chinese, Japanese and Korean text", () => {
  const result = htmlToPdf("<p>日本語 한국어 中文 Ελληνικά Привет café</p>", a4);
  // The fallback CJK font alone is megabytes whole.
  expect(result.bytes.length).toBeLessThan(150_000);
  expect(pdfText(open(result.bytes))).toEqual(["日本語 한국어 中文 Ελληνικά Привет café"]);
});

test("plain text keeps its lines and spacing, and long lines wrap", () => {
  const text = "Name\tAge\nAda\t36\n\n    indented\n" + "word ".repeat(100);
  const html = textToHtml(text, { font: "mono", fontSize: 10 }, layout);
  const [page] = pdfText(open(htmlToPdf(html, { ...A4, fontSize: 10 }).bytes));
  // Text extraction may merge a run of spaces drawn between words; the layout keeps them.
  expect(page!.split("\n").slice(0, 5)).toEqual([
    "Name    Age",
    expect.stringMatching(/^Ada +36$/),
    "",
    "    indented",
    expect.stringMatching(/^word word/),
  ]);
  expect(page!.split("\n").length).toBeGreaterThan(5);
});

test("text that looks like HTML stays text", () => {
  const html = textToHtml("<b>not bold</b> & <script>x</script>", { font: "sans", fontSize: 12 }, layout);
  expect(pdfText(open(htmlToPdf(html, a4).bytes))).toEqual(["<b>not bold</b> & <script>x</script>"]);
});

test("Markdown comes out formatted, with working links to its headings", async () => {
  const markdown =
    "# Guide\n\nSee [install](#install).\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n## Install\n\n- one\n- two\n";
  const html = await markdownToHtml(markdown, { font: "serif", fontSize: 11 }, layout, "Guide");
  const result = htmlToPdf(html, { ...A4, fontSize: 11, title: "Guide" });
  const doc = open(result.bytes);
  const text = pdfText(doc)[0]!;
  expect(text).toContain("Guide");
  expect(text).not.toContain("#");
  expect(text).not.toContain("|");
  expect(text).toMatch(/•\s+one/);
  const [link] = doc.loadPage(0).getLinks();
  expect(link!.getURI()).toMatch(/^#page=1/);
});

test("refuses page sizes and text sizes out of range, and output with too many pages", () => {
  const code = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return error instanceof EngineError ? error.code : String(error);
    }
    return "no error";
  };
  expect(code(() => htmlToPdf("<p>x</p>", { width: 10, height: 842, fontSize: 12 }))).toBe("invalid-argument");
  expect(code(() => htmlToPdf("<p>x</p>", { ...A4, fontSize: 200 }))).toBe("invalid-argument");
  const lots = "<p style='page-break-after: always'>x</p>".repeat(MAX_HTML_PAGES + 5);
  expect(code(() => htmlToPdf(lots, a4))).toBe("too-large");
});

test("reads each page's text in order, empty for a page without any", () => {
  const doc = open(textPdf(["First line", "Second line"]));
  // Each line here is a text object of its own, so MuPDF reads them as two paragraphs.
  expect(pdfText(doc)).toEqual(["First line\n\nSecond line"]);
  const blank = new mupdf.PDFDocument();
  blank.insertPage(-1, blank.addPage([0, 0, 100, 100], 0, {}, ""));
  opened.push(blank);
  expect(pdfText(blank)).toEqual([""]);
});
