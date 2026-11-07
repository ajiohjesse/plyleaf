// Text, Markdown and HTML to PDF: text in, real text out on pages, with nothing sent anywhere (and nothing fetched for
// an HTML page's remote pictures).
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload, dropFiles, type FileSpec } from "../helpers/files";
import { makePng } from "../helpers/images";
import { A4, LETTER } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "text-canary-k7w";
// A4 unless a test says otherwise.
test.use({ locale: "en-GB" });

const textFile = (name: string, text: string, mimeType = "text/plain"): FileSpec => ({
  name,
  mimeType,
  bytes: Array.from(new TextEncoder().encode(text)),
});

async function convertAndDownload(page: Page) {
  await page.getByRole("button", { name: "Convert to PDF" }).click();
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  const bytes = new Uint8Array(await readFile((await saved.path())!));
  return { name: saved.suggestedFilename(), bytes, doc: mupdf.Document.openDocument(bytes, "application/pdf") };
}

const allText = (doc: mupdf.Document) =>
  Array.from({ length: doc.countPages() }, (_, i) => doc.loadPage(i).toStructuredText("").asText()).join("\n");

test("turns a text file into a PDF of real text, without sending it anywhere", async ({ page, context, baseURL }) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/text-to-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  const lines = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}: the quick brown fox`).join("\n");
  await page.getByLabel("Choose files").setInputFiles(asPayload(textFile(`${SECRET}-notes.txt`, `Café € Ω\n${lines}`)));
  await expect(page.getByLabel(`text from ${SECRET}-notes.txt`)).toHaveValue(/^Café € Ω\nLine 1:/);
  await expect(page.getByRole("radio", { name: /Plain text/ })).toBeChecked();
  await expect(page.getByLabel("Page size")).toHaveValue("a4");

  const { name, bytes, doc } = await convertAndDownload(page);
  expect(name).toBe(`${SECRET}-notes.pdf`);
  await expect(page.getByText(`${doc.countPages()} pages`)).toBeVisible();
  expect(doc.countPages()).toBeGreaterThan(1);
  expect(doc.loadPage(0).getBounds()).toEqual([0, 0, A4.width, A4.height]);
  const text = allText(doc);
  expect(text).toContain("Café € Ω");
  expect(text).toContain("Line 150: the quick brown fox");
  expect(await qpdfCheck(bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("converts typed text, on the page size and orientation chosen", async ({ page }) => {
  await page.goto("/text-to-pdf");
  // Typed before the island hydrates, the text would be lost.
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Or type or paste text here").fill("Typed by hand.\n\n\tIndented with a tab.");
  await page.getByLabel("Page size").selectOption("letter");
  await page.getByLabel("Orientation").selectOption("landscape");
  await page.getByLabel("Font", { exact: true }).selectOption("serif");
  const { name, doc } = await convertAndDownload(page);
  expect(name).toBe("document.pdf");
  expect(doc.loadPage(0).getBounds()).toEqual([0, 0, LETTER.height, LETTER.width]);
  expect(allText(doc)).toContain("Typed by hand.");

  // Back to the text, which is as it was.
  await page.getByRole("button", { name: "Back to your text" }).click();
  await expect(page.getByLabel("Or type or paste text here")).toHaveValue(/^Typed by hand\./);
  await expect(page.getByRole("button", { name: "Convert to PDF" })).toBeFocused();
});

test.describe("in the US", () => {
  test.use({ locale: "en-US" });
  test("starts on US Letter", async ({ page }) => {
    await page.goto("/text-to-pdf");
    await expect(page.locator("label[data-listening]")).toHaveCount(1);
    await expect(page.getByLabel("Page size")).toHaveValue("letter");
  });
});

test("formats Markdown, with links that work and a title from its heading", async ({ page }) => {
  await page.goto("/markdown-to-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  const markdown = [
    "# Field guide",
    "",
    "Read the [setup](#setup) part first, or visit [the site](https://example.com/guide).",
    "",
    "| Bird | Seen |",
    "| ---- | ---- |",
    "| Wren | Yes |",
    "",
    "```",
    "code block",
    "```",
    "",
    "## Setup",
    "",
    "- **Bold** item",
    "- [ ] task",
  ].join("\n");
  await dropFiles(page, "body", [textFile("guide.md", markdown, "text/markdown")]);
  await expect(page.getByRole("radio", { name: /Markdown/ })).toBeChecked();
  const { name, doc } = await convertAndDownload(page);
  expect(name).toBe("guide.pdf");
  expect(doc.getMetaData("info:Title")).toBe("Field guide");
  const text = allText(doc);
  expect(text).toContain("Field guide");
  expect(text).toContain("Wren");
  expect(text).not.toMatch(/[#|*`]/);
  const uris = doc
    .loadPage(0)
    .getLinks()
    .map((link) => link.getURI());
  expect(uris).toContain("https://example.com/guide");
  expect(uris.some((uri) => uri.startsWith("#page=1"))).toBe(true);
});

test("puts an HTML page's own pictures in, and leaves out ones on other sites without fetching them", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await page.goto("/html-to-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  const html = `<!doctype html><html><head><title>Menu</title><link rel="stylesheet" href="css/site.css">
    <script>document.title = "ran"</script></head><body><h1 class="big">Today's menu</h1>
    <img src="images/logo.png" alt="Logo"><img src="https://${SECRET}.example.com/remote.png"><p>Soup of the day</p></body></html>`;
  await page.getByLabel("Choose files").setInputFiles(asPayload(textFile(`${SECRET}-menu.html`, html, "text/html")));
  await expect(page.getByRole("radio", { name: /HTML/ })).toBeChecked();
  const files = page.getByRole("region", { name: "Pictures and stylesheets" });
  await expect(files.getByRole("listitem")).toHaveCount(3);
  await expect(files.locator("[data-status=missing]")).toHaveCount(2);
  await expect(files.locator("[data-status=remote]")).toContainText("On another site");

  await files.getByLabel("Add pictures and stylesheets").setInputFiles([
    { name: "logo.png", mimeType: "image/png", buffer: Buffer.from(makePng(120, 60)) },
    { name: "site.css", mimeType: "text/css", buffer: Buffer.from(".big { color: #c00000; }") },
  ]);
  await expect(files.locator("[data-status=added]")).toHaveCount(2);

  const { name, bytes, doc } = await convertAndDownload(page);
  expect(name).toBe(`${SECRET}-menu.pdf`);
  expect(doc.getMetaData("info:Title")).toBe("Menu");
  expect(allText(doc)).toContain("Soup of the day");
  const blocks = JSON.parse(doc.loadPage(0).toStructuredText("preserve-images").asJSON()).blocks as { type: string }[];
  // The added picture is in; the remote one isn't.
  expect(blocks.filter((block) => block.type === "image")).toHaveLength(1);
  // The added stylesheet coloured the heading red.
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const pixels = pixmap.getPixels();
  let red = 0;
  for (let i = 0; i + 2 < pixels.length; i += 3)
    if (pixels[i]! > 150 && pixels[i + 1]! < 60 && pixels[i + 2]! < 60) red++;
  expect(red).toBeGreaterThan(50);
  expect(await qpdfCheck(bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("turns away files that aren't text", async ({ page }) => {
  await page.goto("/html-to-pdf");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page.getByLabel("Choose files").setInputFiles({
    name: "already.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n\0\0binary"),
  });
  await expect(page.getByText("already.pdf is already a PDF. To get its text out, use PDF to text.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Convert to PDF" })).toBeDisabled();
});

for (const [slug, name] of [
  ["text-to-pdf", "Text to PDF"],
  ["markdown-to-pdf", "Markdown to PDF"],
  ["html-to-pdf", "HTML to PDF"],
] as const) {
  test(`${name} is linked from the home page`, async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: new RegExp(name) })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  });
}
