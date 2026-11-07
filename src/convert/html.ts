// Getting an HTML file ready for the engine, on the page (it needs the browser's DOMParser): pictures and stylesheets
// the user added go inside it, and anything that would load from elsewhere is left out, since nothing is fetched.
import { isRemote, needsFile, pageCss, referencedName, type MarginId } from "./text";

/** A file the page refers to, and whether we have it. */
export interface Reference {
  /** As the page writes it ("img/logo.png"). */
  url: string;
  kind: "image" | "stylesheet";
  /** "added": the user gave us the file. "missing": they could add it. "remote": on another site, never fetched. */
  status: "added" | "missing" | "remote";
}

/** Elements that run code or pull in other documents. MuPDF ignores them; we take them out so nothing is kept. */
const DROPPED = "script, iframe, frame, frameset, object, embed, template, base";

const isStylesheet = (link: Element) => /(^|\s)stylesheet(\s|$)/i.test(link.getAttribute("rel") ?? "");

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

/** The pictures and stylesheets an HTML file uses, and which of them are among `files`. */
export function htmlReferences(html: string, files: readonly File[]): Reference[] {
  const doc = parse(html);
  const names = new Set(files.map((file) => file.name.toLowerCase()));
  const found = new Map<string, Reference>();
  const add = (url: string, kind: Reference["kind"]) => {
    if (!needsFile(url) || found.has(url)) return;
    const status = isRemote(url) ? "remote" : names.has(referencedName(url)) ? "added" : "missing";
    found.set(url, { url, kind, status });
  };
  for (const img of doc.querySelectorAll("img[src]")) add(img.getAttribute("src")!, "image");
  for (const link of doc.querySelectorAll("link[href]")) {
    if (isStylesheet(link)) add(link.getAttribute("href")!, "stylesheet");
  }
  return [...found.values()];
}

/** Formats MuPDF reads inside HTML. Others (SVG, WebP, AVIF) are drawn as PNG by the browser first. */
const ENGINE_IMAGES = /^image\/(png|jpeg|gif|bmp|tiff)$/;
/** SVGs are drawn at this many pixels per CSS pixel, so they stay sharp in print. */
const SVG_SCALE = 3;

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file"));
    reader.readAsDataURL(blob);
  });
}

interface InlineImage {
  url: string;
  /** The width to show it at, in CSS pixels, when it was drawn larger than its own size. */
  width?: number;
}

/** The image drawn by the browser (which reads SVG, WebP and AVIF where MuPDF doesn't), as a PNG. */
async function drawnAsPng(file: File): Promise<InlineImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const svg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    const scale = svg ? SVG_SCALE : 1;
    const own = { width: image.naturalWidth || 300, height: image.naturalHeight || 150 };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(own.width * scale);
    canvas.height = Math.round(own.height * scale);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { url: canvas.toDataURL("image/png"), ...(svg && { width: own.width }) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The image as a data URL MuPDF can read, or null if it can't be read at all. */
async function inlineImage(file: File): Promise<InlineImage | null> {
  try {
    return ENGINE_IMAGES.test(file.type) ? { url: await dataUrl(file) } : await drawnAsPng(file);
  } catch {
    return null;
  }
}

/**
 * The HTML to lay out: added pictures and stylesheets inside it, everything else that would load from elsewhere (and
 * scripts) taken out, and our page margins last so they win.
 */
export async function prepareHtml(html: string, files: readonly File[], margin: MarginId): Promise<string> {
  const doc = parse(html);
  for (const element of doc.querySelectorAll(DROPPED)) element.remove();
  for (const source of doc.querySelectorAll("picture source")) source.remove();
  const byName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  const fileFor = (url: string) => (isRemote(url) ? undefined : byName.get(referencedName(url)));

  for (const img of doc.querySelectorAll("img")) {
    img.removeAttribute("srcset");
    const src = img.getAttribute("src") ?? "";
    if (!needsFile(src)) continue;
    const file = fileFor(src);
    const image = file ? await inlineImage(file) : null;
    if (!image) {
      img.remove();
      continue;
    }
    img.setAttribute("src", image.url);
    // A drawn-larger SVG keeps its own size on the page, unless the page sizes it.
    if (image.width && !img.hasAttribute("width") && !img.hasAttribute("height")) {
      img.setAttribute("width", String(image.width));
    }
  }

  for (const link of doc.querySelectorAll("link")) {
    const file = isStylesheet(link) ? fileFor(link.getAttribute("href") ?? "") : undefined;
    if (!file) {
      link.remove();
      continue;
    }
    const style = doc.createElement("style");
    // @import would load from elsewhere too.
    style.textContent = (await file.text()).replace(/@import[^;]*;/gi, "");
    link.replaceWith(style);
  }

  const page = doc.createElement("style");
  page.textContent = pageCss(margin);
  doc.head.append(page);
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}
