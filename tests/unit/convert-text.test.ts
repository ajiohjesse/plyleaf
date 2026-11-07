import { expect, test } from "vitest";
import { joinPages, pagesWithoutText } from "~/convert/pdf-text";
import {
  decodeText,
  escapeHtml,
  expandTabs,
  formatOf,
  htmlTitle,
  isRemote,
  localPageSize,
  markdownTitle,
  markdownToHtml,
  needsFile,
  pageSize,
  referencedName,
  slug,
  textToHtml,
  withHeadingIds,
} from "~/convert/text";

test("tells the format from the file name", () => {
  expect(formatOf("index.html")).toBe("html");
  expect(formatOf("PAGE.HTM")).toBe("html");
  expect(formatOf("a.xhtml")).toBe("html");
  expect(formatOf("README.md")).toBe("markdown");
  expect(formatOf("notes.markdown")).toBe("markdown");
  expect(formatOf("notes.txt")).toBe("text");
  expect(formatOf("server.log")).toBe("text");
  expect(formatOf("no-extension")).toBe("text");
});

test("page sizes turn for landscape", () => {
  expect(pageSize({ size: "a4", landscape: false })).toEqual({ width: 595, height: 842 });
  expect(pageSize({ size: "letter", landscape: true })).toEqual({ width: 792, height: 612 });
});

test("expands tabs to the next stop", () => {
  expect(expandTabs("a\tb\n\tc\nab\tcd", 4)).toBe("a   b\n    c\nab  cd");
  expect(expandTabs("日本\tx", 4)).toBe("日本  x");
});

test("escapes text for HTML", () => {
  expect(escapeHtml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});

test("plain text goes in as text, with the chosen font and margins", () => {
  const html = textToHtml(
    "<b>\r\nline",
    { font: "mono", fontSize: 10 },
    { size: "a4", landscape: false, margin: "wide" },
    "T & C",
  );
  expect(html).toContain("<pre>&lt;b&gt;\nline</pre>");
  expect(html).toContain("font-family: monospace");
  expect(html).toContain("@page { margin: 72pt; }");
  expect(html).toContain("<title>T &amp; C</title>");
});

test("Markdown becomes HTML with GitHub's extras and heading anchors", async () => {
  const html = await markdownToHtml(
    "# Hello, World!\n\n~~old~~ text\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n## Hello, World!\n",
    { font: "sans", fontSize: 11 },
    { size: "letter", landscape: false, margin: "narrow" },
  );
  expect(html).toContain('<h1 id="hello-world">Hello, World!</h1>');
  expect(html).toContain('<h2 id="hello-world-1">Hello, World!</h2>');
  expect(html).toContain("<del>old</del>");
  expect(html).toContain("<table>");
  expect(html).toContain("@page { margin: 36pt; }");
});

test("heading anchors follow GitHub's rules", () => {
  expect(slug("Install & set up (v2)")).toBe("install--set-up-v2");
  expect(slug("Über uns")).toBe("über-uns");
  expect(withHeadingIds("<h3><code>run()</code> &amp; more</h3>")).toBe(
    '<h3 id="run--more"><code>run()</code> &amp; more</h3>',
  );
  expect(withHeadingIds("<h2>!!!</h2>")).toBe('<h2 id="section">!!!</h2>');
});

test("finds a title in Markdown and HTML", () => {
  expect(markdownTitle("intro\n\n# The *Big* Title #\n\n# Second")).toBe("The Big Title");
  expect(markdownTitle("## Only a subheading")).toBe("");
  expect(htmlTitle("<head><title>\n  Fish &amp; Chips </title></head>")).toBe("Fish & Chips");
  expect(htmlTitle("<p>none</p>")).toBe("");
});

test("sorts a page's references into files to add and ones that stay out", () => {
  expect(needsFile("data:image/png;base64,AAA")).toBe(false);
  expect(needsFile("img/logo.png")).toBe(true);
  expect(isRemote("https://cdn.example.com/a.css")).toBe(true);
  expect(isRemote("//cdn.example.com/a.css")).toBe(true);
  expect(isRemote("img/a.png")).toBe(false);
  expect(referencedName("img/Photo%201.PNG?v=2#x")).toBe("photo 1.png");
  expect(referencedName("..\\styles\\site.css")).toBe("site.css");
});

test("reads UTF-8, UTF-16 and older Windows text", () => {
  const utf8 = new TextEncoder().encode("﻿café ✓");
  expect(decodeText(utf8)).toBe("café ✓");
  const utf16 = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0xe9, 0x00]);
  expect(decodeText(utf16)).toBe("hé");
  expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x78, 0x94]))).toBe("café “x”");
});

test("joins pages' text, marked or not", () => {
  expect(joinPages(["One", "", "Three"], true)).toBe(
    "--- Page 1 ---\n\nOne\n\n--- Page 2 ---\n\n--- Page 3 ---\n\nThree\n",
  );
  expect(joinPages(["One", "", "Three"], false)).toBe("One\n\nThree\n");
  expect(joinPages(["", ""], false)).toBe("");
  expect(pagesWithoutText(["a", " \n", "b", ""])).toEqual([2, 4]);
});

test("starts on the local paper size", () => {
  expect(localPageSize("en-US")).toBe("letter");
  expect(localPageSize("fr-CA")).toBe("letter");
  expect(localPageSize("en-GB")).toBe("a4");
  expect(localPageSize("en")).toBe("a4");
  expect(localPageSize("es-USA")).toBe("a4");
});
