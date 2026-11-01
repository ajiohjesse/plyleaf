import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { engine } from "~/engine/client";
import {
  canEncodeWebp,
  encodeWebp,
  imageSize,
  MIME_TYPES,
  pageImageName,
  type ImageFormat,
} from "~/convert/pdf-images";
import { outputName } from "~/download/download";
import { operationFailureMessage } from "~/intake/files";
import type { ReadyDocument } from "~/intake/intake";
import { pagesInRanges, parseRanges } from "~/organize/ranges";
import { zipFiles } from "~/organize/split";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import {
  ActionBar,
  Choice,
  FailureAlert,
  FileCard,
  plural,
  primaryButton,
  type Result,
} from "~/components/workspace/parts";

interface Settings {
  format: ImageFormat;
  dpi: number;
  pages: number[];
}

const RESOLUTIONS = [
  { dpi: 72, label: "72 dpi: small, for screens" },
  { dpi: 150, label: "150 dpi: sharp, for most uses" },
  { dpi: 300, label: "300 dpi: for printing" },
  { dpi: 600, label: "600 dpi: very sharp, large files" },
];

/**
 * The PDF to images workspace: one PDF in, a JPG, PNG or WebP image per page out (a zip when there are several). Pages
 * are rendered one at a time, so memory stays at one page's worth.
 */
export function PdfToImagesWorkspace() {
  const [state, intake] = useIntake({ multiple: false });
  const doc = state.documents[0];
  const [result, setResult] = useState<Result | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) buttonRef.current?.focus();
  }, [returning]);

  async function convert(ready: ReadyDocument, { format, dpi, pages }: Settings) {
    setResult(null);
    setReturning(false);
    setProgress({ done: 0, total: pages.length });
    try {
      const files: { name: string; bytes: Uint8Array }[] = [];
      for (const [i, page] of pages.entries()) {
        let bytes: Uint8Array;
        if (format === "webp") {
          const { width } = imageSize(ready.info.pages[page]!, dpi);
          const blob = await encodeWebp(await engine.render(ready.info.id, page, width), 0.9);
          bytes = new Uint8Array(await blob.arrayBuffer());
        } else {
          bytes = await engine.pageImage(ready.info.id, page, { dpi, format });
        }
        files.push({ name: pageImageName(ready.name, page, ready.info.pageCount, format), bytes });
        setProgress({ done: i + 1, total: pages.length });
      }
      if (files.length === 1) {
        const [only] = files;
        setResult({
          file: new Blob([only!.bytes as Uint8Array<ArrayBuffer>], { type: MIME_TYPES[format] }),
          name: only!.name,
        });
      } else {
        setResult({
          file: new Blob([zipFiles(files)], { type: "application/zip" }),
          name: outputName(ready.name, "images", "zip"),
          detail: `${plural(files.length, "image")} in one zip file`,
        });
      }
    } catch (error) {
      setResult({ error: operationFailureMessage(error) });
    } finally {
      setProgress(null);
    }
  }

  if (result && "file" in result) {
    return (
      <div data-files>
        <DownloadPanel
          file={result.file}
          name={result.name}
          {...(result.detail && { detail: result.detail })}
          onStartOver={() => {
            setResult(null);
            setReturning(true);
          }}
          startOverLabel="Back to your file"
        />
      </div>
    );
  }

  return (
    <div
      className="space-y-4"
      data-files={doc ? true : undefined}
      data-busy={state.busy || progress ? true : undefined}
    >
      {doc && <FileCard doc={doc} onRemove={() => void intake.remove(doc.key)} />}
      <IntakeNotices state={state} intake={intake} />
      {result && "error" in result && <FailureAlert message={result.error} />}
      {doc?.status === "ready" && (
        <ImageOptions
          key={doc.key}
          doc={doc}
          progress={progress}
          buttonRef={buttonRef}
          onConvert={(settings) => void convert(doc, settings)}
        />
      )}
      <FileDrop onFiles={(files) => void intake.add(files)} multiple={false} compact={doc !== undefined} />
    </div>
  );
}

/** What a browser can encode doesn't change while the page is open. */
const noChanges = () => () => {};

interface OptionsProps {
  doc: ReadyDocument;
  progress: { done: number; total: number } | null;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onConvert: (settings: Settings) => void;
}

function ImageOptions({ doc, progress, buttonRef, onConvert }: OptionsProps) {
  const pageCount = doc.info.pageCount;
  const [format, setFormat] = useState<ImageFormat>("jpeg");
  const [dpi, setDpi] = useState(150);
  const [which, setWhich] = useState<"all" | "some">("all");
  const [rangesText, setRangesText] = useState("");
  // Only known in the browser; the server render offers it.
  const webp = useSyncExternalStore(noChanges, canEncodeWebp, () => true);
  const ids = { format: useId(), dpi: useId(), which: useId(), ranges: useId(), rangesHint: useId() };

  let pages: number[] | null = Array.from({ length: pageCount }, (_, i) => i);
  let rangesError = "";
  if (which === "some") {
    const parsed = parseRanges(rangesText, pageCount);
    if (parsed.ok) pages = pagesInRanges(parsed.ranges);
    else {
      pages = null;
      rangesError = rangesText.trim() === "" ? "Type the pages to convert, like 1-3, 5." : parsed.error;
    }
  }
  const first = imageSize(doc.info.pages[pages?.[0] ?? 0]!, dpi);
  const formats: { value: ImageFormat; title: string; text: string }[] = [
    { value: "jpeg", title: "JPG", text: "Small files, best for photos and scans." },
    { value: "png", title: "PNG", text: "Lossless, best for text and drawings." },
    {
      value: "webp",
      title: "WebP",
      text: webp ? "Smaller than JPG, for the web." : "This browser can't make WebP images.",
    },
  ];
  const inputClass =
    "mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none aria-invalid:border-sticky-coral";
  const ready = pages !== null && (format !== "webp" || webp);

  return (
    <>
      <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 font-semibold">Image format</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {formats.map((option) => (
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
        <div>
          <label htmlFor={ids.dpi} className="font-semibold">
            Resolution
          </label>
          <select
            id={ids.dpi}
            value={dpi}
            onChange={(event) => setDpi(Number(event.target.value))}
            className={`${inputClass} sm:max-w-sm`}
          >
            {RESOLUTIONS.map((option) => (
              <option key={option.dpi} value={option.dpi}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-ink-muted">
            {pages && pages.length > 1 ? "The first page will be" : "The image will be"} {first.width} × {first.height}{" "}
            pixels{first.capped ? ", as big as Plyleaf makes them" : ""}.
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 font-semibold">Pages</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name={ids.which} checked={which === "all"} onChange={() => setWhich("all")} title="All pages">
            An image of every page.
          </Choice>
          <Choice name={ids.which} checked={which === "some"} onChange={() => setWhich("some")} title="Some pages">
            Only the pages you type.
          </Choice>
        </div>
        {which === "some" && (
          <div>
            <label htmlFor={ids.ranges} className="font-semibold">
              Pages to convert
            </label>
            <input
              id={ids.ranges}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. 1-3, 5"
              value={rangesText}
              onChange={(event) => setRangesText(event.target.value)}
              aria-invalid={rangesError && rangesText ? true : undefined}
              aria-describedby={ids.rangesHint}
              className={inputClass}
            />
            <p id={ids.rangesHint} className="mt-1 text-sm text-ink-muted">
              {rangesError || `${plural(pages!.length, "page")} of ${pageCount}.`}
            </p>
          </div>
        )}
      </fieldset>

      <ActionBar
        status={
          progress
            ? `Converting… ${progress.done} of ${progress.total}`
            : !pages
              ? "Choose the pages to convert."
              : format === "webp" && !webp
                ? "Choose JPG or PNG: this browser can't make WebP."
                : pages.length === 1
                  ? "1 image"
                  : `${plural(pages.length, "image")}, downloaded as one zip`
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={!ready || progress !== null}
          className={primaryButton}
          onClick={() => pages && onConvert({ format, dpi, pages })}
        >
          {progress ? "Converting…" : "Convert to images"}
        </button>
      </ActionBar>
    </>
  );
}
