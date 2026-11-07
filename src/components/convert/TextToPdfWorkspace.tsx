import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { engine, preloadEngine } from "~/engine/client";
import { htmlReferences, prepareHtml, type Reference } from "~/convert/html";
import {
  decodeText,
  FONT_SIZES,
  formatOf,
  HTML_FONT_SIZE,
  htmlTitle,
  localPageSize,
  markdownTitle,
  markdownToHtml,
  pageSize,
  TEXT_ACCEPT,
  textToHtml,
  type FontId,
  type Layout,
  type MarginId,
  type PageSizeId,
  type TextFormat,
} from "~/convert/text";
import { outputName } from "~/download/download";
import { formatSize, operationFailureMessage } from "~/intake/files";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { CloseIcon } from "~/components/intake/IntakePanel";
import {
  ActionBar,
  Choice,
  FailureAlert,
  IconButton,
  plural,
  primaryButton,
  type Result,
} from "~/components/workspace/parts";

/** Biggest text file we take. Far more than a 5,000-page PDF holds. */
const MAX_TEXT_BYTES = 20 * 1024 * 1024;
/** Longer text isn't shown in the box (the browser would crawl); it's converted as it is. */
const MAX_SHOWN = 500_000;

const FORMATS: { value: TextFormat; title: string; text: string }[] = [
  { value: "text", title: "Plain text", text: "Every line and space as typed." },
  { value: "markdown", title: "Markdown", text: "Headings, lists, tables, links and code." },
  { value: "html", title: "HTML", text: "A web page, with its own styles." },
];

const FONTS: { value: FontId; label: string }[] = [
  { value: "sans", label: "Sans serif" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospaced" },
];

const isAsset = (file: File) =>
  file.type.startsWith("image/") || /\.(css|svg|png|jpe?g|gif|webp|avif|bmp|tiff?)$/i.test(file.name);

/** A file that's text, by its first bytes: no NULs (binary files have them; UTF-16 text starts with a byte-order mark). */
function looksLikeText(head: Uint8Array) {
  if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) return true;
  return !head.includes(0);
}

const noChanges = () => () => {};
const browserPageSize = () => localPageSize(navigator.language);

const selectClass =
  "mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none";

interface Source {
  name: string;
  size: number;
}

/**
 * The Text to PDF workspace (HTML, Markdown and plain text pages share it; `format` is what the page is about): a
 * file or typed text in, laid out on pages by the engine. HTML's pictures and stylesheets can be added as files;
 * nothing is ever fetched.
 */
export function TextToPdfWorkspace({ format: initialFormat }: { format: TextFormat }) {
  const [format, setFormat] = useState(initialFormat);
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [assets, setAssets] = useState<File[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  // The page size is the local paper (A4, or Letter in the US and Canada) until the user picks one.
  const localSize = useSyncExternalStore(noChanges, browserPageSize, () => "a4" as const);
  const [chosen, setLayout] = useState<Omit<Layout, "size"> & { size: PageSizeId | null }>({
    size: null,
    landscape: false,
    margin: "normal",
  });
  const layout: Layout = { ...chosen, size: chosen.size ?? localSize };
  const [fonts, setFonts] = useState<Record<"text" | "markdown", FontId>>({ text: "mono", markdown: "sans" });
  const [fontSize, setFontSize] = useState(11);
  const [making, setMaking] = useState(false);
  const [result, setResult] = useState<(Result & { pages?: number }) | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [returning, setReturning] = useState(false);
  const ids = { text: useId(), format: useId(), assets: useId(), hint: useId() };

  useEffect(() => {
    if (returning) buttonRef.current?.focus();
  }, [returning]);

  const deferredText = useDeferredValue(text);
  const references = useMemo(
    () => (format === "html" && deferredText.trim() ? htmlReferences(deferredText, assets) : []),
    [format, deferredText, assets],
  );

  async function takeFiles(files: File[]) {
    const messages: string[] = [];
    const textFiles: File[] = [];
    const assetFiles: File[] = [];
    for (const file of files) {
      if (isAsset(file)) assetFiles.push(file);
      else textFiles.push(file);
    }
    let nextFormat = format;
    const [first, ...rest] = textFiles;
    for (const file of rest) messages.push(`${file.name} was left out: this tool converts one file at a time.`);
    if (first) {
      const taken = await readText(first);
      if (typeof taken === "string") {
        messages.push(taken);
      } else {
        nextFormat = formatOf(first.name);
        setFormat(nextFormat);
        setText(taken.text);
        setSource({ name: first.name, size: first.size });
        setAssets([]);
        setResult(null);
      }
    }
    if (assetFiles.length > 0) {
      if (nextFormat === "html") {
        setAssets((current) => {
          const names = new Set(assetFiles.map((file) => file.name.toLowerCase()));
          return [...current.filter((file) => !names.has(file.name.toLowerCase())), ...assetFiles];
        });
      } else {
        for (const file of assetFiles) {
          messages.push(
            `${file.name} was left out: pictures and stylesheets go with an HTML file. To make a PDF of pictures, use Images to PDF.`,
          );
        }
      }
    }
    setNotices(messages);
  }

  async function convert() {
    setMaking(true);
    setResult(null);
    setReturning(false);
    try {
      const style = { font: format === "html" ? "sans" : fonts[format], fontSize } as const;
      const found = format === "html" ? htmlTitle(text) : format === "markdown" ? markdownTitle(text) : "";
      const title = found || (source ? source.name.replace(/\.[a-z0-9]{1,8}$/i, "") : "");
      const html =
        format === "html"
          ? await prepareHtml(text, assets, layout.margin)
          : format === "markdown"
            ? await markdownToHtml(text, style, layout, title)
            : textToHtml(text, style, layout, title);
      const { bytes, pageCount } = await engine.htmlToPdf(html, {
        ...pageSize(layout),
        fontSize: format === "html" ? HTML_FONT_SIZE : fontSize,
        ...(title && { title }),
      });
      setResult({
        file: new Blob([bytes], { type: "application/pdf" }),
        name: outputName(source?.name ?? (title || "document")),
        pages: pageCount,
      });
    } catch (error) {
      setResult({ error: operationFailureMessage(error) });
    } finally {
      setMaking(false);
    }
  }

  if (result && "file" in result) {
    return (
      <div data-files>
        <DownloadPanel
          file={result.file}
          name={result.name}
          detail={plural(result.pages ?? 1, "page")}
          onStartOver={() => {
            setResult(null);
            setReturning(true);
          }}
          startOverLabel="Back to your text"
        />
      </div>
    );
  }

  const empty = text.trim() === "";
  const what = format === "html" ? "HTML" : format === "markdown" ? "Markdown" : "text";
  return (
    <div className="space-y-4" data-files={source || !empty ? true : undefined} data-busy={making || undefined}>
      {source && (
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface py-2 pr-2 pl-4 sm:pr-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{source.name}</span>
            <span className="block text-sm text-ink-muted">
              {FORMATS.find((option) => option.value === format)!.title} · {formatSize(source.size)}
            </span>
          </span>
          <IconButton
            label={`Remove ${source.name}`}
            onClick={() => {
              setSource(null);
              setText("");
              setAssets([]);
              setResult(null);
            }}
          >
            <CloseIcon />
          </IconButton>
        </div>
      )}
      <FileDrop
        onFiles={(files) => void takeFiles(files)}
        other={{
          accept: `${TEXT_ACCEPT},image/*,.css`,
          one: "a text, Markdown or HTML file",
          many: "files",
          more: format === "html" ? "Use a different file, or add pictures" : "Use a different file",
        }}
        multiple
        compact={source !== null || !empty}
      />
      {notices.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {notices.map((notice) => (
            <li key={notice} className="rounded-card border-2 border-sticky-yellow bg-sticky-yellow/30 px-4 py-3">
              {notice}
            </li>
          ))}
        </ul>
      )}

      <fieldset className="space-y-2 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 font-semibold">Read it as</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {FORMATS.map((option) => (
            <Choice
              key={option.value}
              name={ids.format}
              checked={format === option.value}
              onChange={() => setFormat(option.value)}
              title={option.title}
            >
              {option.text}
            </Choice>
          ))}
        </div>
      </fieldset>

      {text.length <= MAX_SHOWN ? (
        <div>
          <label htmlFor={ids.text} className="font-semibold">
            {source ? `${what} from ${source.name}` : `Or type or paste ${what} here`}
          </label>
          <textarea
            id={ids.text}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onFocus={preloadEngine}
            spellCheck={format !== "html"}
            rows={12}
            className="mt-1 block w-full resize-y rounded-card border-2 border-line bg-surface p-3 font-mono text-sm focus:border-primary focus:outline-none"
          />
        </div>
      ) : (
        <p className="rounded-card border border-line bg-surface px-4 py-3 text-ink-muted">
          {source?.name} is too long to show here ({plural(text.length, "character")}). It will be converted as it is.
        </p>
      )}

      {format === "html" && references.length > 0 && (
        <HtmlFiles references={references} assets={assets} onAdd={(files) => void takeFiles(files)} id={ids.assets} />
      )}

      <PageOptions
        layout={layout}
        onLayout={setLayout}
        {...(format !== "html" && {
          font: fonts[format],
          onFont: (font: FontId) => setFonts((current) => ({ ...current, [format]: font })),
          fontSize,
          onFontSize: setFontSize,
        })}
      />

      {result && "error" in result && <FailureAlert message={result.error} />}
      <ActionBar
        status={
          making
            ? "Laying out your pages…"
            : empty
              ? "Add a file, or type or paste something, to make a PDF."
              : `${what === "text" ? "Text" : what} on ${layout.size === "a4" ? "A4" : "US Letter"} pages${layout.landscape ? ", landscape" : ""}`
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={empty || making}
          className={primaryButton}
          onClick={() => void convert()}
        >
          {making ? "Making your PDF…" : "Convert to PDF"}
        </button>
      </ActionBar>
    </div>
  );
}

/** A file's text, or why it can't be used. */
async function readText(file: File): Promise<{ text: string } | string> {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_TEXT_BYTES) {
    return `${file.name} is too big (${formatSize(file.size)}). Text files up to ${formatSize(MAX_TEXT_BYTES)} can be converted.`;
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return `${file.name} couldn't be read.`;
  }
  if (!looksLikeText(bytes.subarray(0, 4096))) {
    const pdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    return pdf
      ? `${file.name} is already a PDF. To get its text out, use PDF to text.`
      : `${file.name} isn't a text, Markdown or HTML file.`;
  }
  return { text: decodeText(bytes) };
}

const STATUS: Record<Reference["status"], string> = {
  added: "Added",
  missing: "Not added: left out",
  remote: "On another site: left out",
};

/** The pictures and stylesheets an HTML file uses, which of them are here, and a button to add the rest. */
function HtmlFiles({
  references,
  assets,
  onAdd,
  id,
}: {
  references: Reference[];
  assets: File[];
  onAdd: (files: File[]) => void;
  id: string;
}) {
  const missing = references.filter((reference) => reference.status === "missing").length;
  const remote = references.some((reference) => reference.status === "remote");
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3 rounded-card border border-line bg-surface p-4">
      <h2 id={`${id}-heading`} className="font-semibold">
        Pictures and stylesheets
      </h2>
      <p className="text-sm text-ink-muted">
        This page uses {plural(references.length, "file")}.{" "}
        {missing > 0 && "Add the ones on your device to include them. "}
        {remote && "Plyleaf never loads anything from other sites, so those are left out."}
      </p>
      <ul className="divide-y divide-line text-sm">
        {references.map((reference) => (
          <li
            key={reference.url}
            data-status={reference.status}
            className="flex flex-wrap justify-between gap-x-3 py-1.5"
          >
            <span className="min-w-0 break-all">{reference.url}</span>
            <span className={reference.status === "added" ? "font-semibold text-ink" : "text-ink-muted"}>
              {STATUS[reference.status]}
            </span>
          </li>
        ))}
      </ul>
      {missing > 0 && (
        <div>
          <label
            htmlFor={id}
            className="btn-pill inline-flex cursor-pointer border-2 border-primary bg-surface text-primary hover:bg-sticky-lavender/30 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
          >
            Add pictures and stylesheets
            <input
              id={id}
              type="file"
              multiple
              accept="image/*,.css,.svg"
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                if (files.length > 0) onAdd(files);
              }}
            />
          </label>
        </div>
      )}
      {assets.length > 0 && <p className="text-sm text-ink-muted">{plural(assets.length, "file")} added.</p>}
    </section>
  );
}

interface PageOptionsProps {
  layout: Layout;
  onLayout: (layout: Layout) => void;
  font?: FontId;
  onFont?: (font: FontId) => void;
  fontSize?: number;
  onFontSize?: (size: number) => void;
}

function PageOptions({ layout, onLayout, font, onFont, fontSize, onFontSize }: PageOptionsProps) {
  const ids = { size: useId(), orientation: useId(), margin: useId(), font: useId(), fontSize: useId() };
  const set = (change: Partial<Layout>) => onLayout({ ...layout, ...change });
  return (
    <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
      <legend className="px-1 font-semibold">Pages</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={ids.size} className="font-semibold">
            Page size
          </label>
          <select
            id={ids.size}
            value={layout.size}
            onChange={(event) => set({ size: event.target.value as PageSizeId })}
            className={selectClass}
          >
            <option value="a4">A4 (210 × 297 mm)</option>
            <option value="letter">US Letter (8.5 × 11 in)</option>
          </select>
        </div>
        <div>
          <label htmlFor={ids.orientation} className="font-semibold">
            Orientation
          </label>
          <select
            id={ids.orientation}
            value={layout.landscape ? "landscape" : "portrait"}
            onChange={(event) => set({ landscape: event.target.value === "landscape" })}
            className={selectClass}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
        <div>
          <label htmlFor={ids.margin} className="font-semibold">
            Margins
          </label>
          <select
            id={ids.margin}
            value={layout.margin}
            onChange={(event) => set({ margin: event.target.value as MarginId })}
            className={selectClass}
          >
            <option value="narrow">Narrow (½ in, 13 mm)</option>
            <option value="normal">Normal (¾ in, 19 mm)</option>
            <option value="wide">Wide (1 in, 25 mm)</option>
          </select>
        </div>
      </div>
      {font && onFont && fontSize !== undefined && onFontSize && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={ids.font} className="font-semibold">
              Font
            </label>
            <select
              id={ids.font}
              value={font}
              onChange={(event) => onFont(event.target.value as FontId)}
              className={selectClass}
            >
              {FONTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.fontSize} className="font-semibold">
              Text size
            </label>
            <select
              id={ids.fontSize}
              value={fontSize}
              onChange={(event) => onFontSize(Number(event.target.value))}
              className={selectClass}
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} pt
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </fieldset>
  );
}
