import { useEffect, useId, useRef, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { operationFailureMessage } from "~/intake/files";
import type { ReadyDocument } from "~/intake/intake";
import { describeRange, everyN, parseRanges, rangeLength, type PageRange } from "~/organize/ranges";
import { partNames, zipFiles } from "~/organize/split";
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

type Mode = "ranges" | "every";

/** How many parts the preview lists before saying how many more there are. */
const PREVIEW = 8;

/** Halves the file, as an example of the syntax that's also a sensible split. */
function suggestedRanges(pageCount: number) {
  const half = Math.ceil(pageCount / 2);
  return pageCount < 2 ? "1" : `1-${half}, ${half + 1}${half + 1 < pageCount ? `-${pageCount}` : ""}`;
}

type Plan = { ok: true; ranges: PageRange[] } | { ok: false; error: string };

function planFor(mode: Mode, rangesText: string, everyText: string, pageCount: number): Plan {
  if (mode === "ranges") return parseRanges(rangesText, pageCount);
  const size = Number(everyText);
  if (!/^\d+$/.test(everyText.trim()) || size < 1) return { ok: false, error: "Type a whole number of pages, like 2." };
  if (size >= pageCount) {
    return { ok: false, error: `That would be the whole file. Choose fewer than ${pageCount} pages.` };
  }
  return { ok: true, ranges: everyN(size, pageCount) };
}

/**
 * The Split PDF workspace: one PDF in, split by page ranges or every N pages, and out as one PDF per part (a zip when
 * there's more than one). The file stays open, so going back to change the split is instant.
 */
export function SplitWorkspace() {
  const [state, intake] = useIntake({ multiple: false });
  const doc = state.documents[0];
  const [result, setResult] = useState<Result | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const splitRef = useRef<HTMLButtonElement>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) splitRef.current?.focus();
  }, [returning]);

  async function split(ready: ReadyDocument, ranges: PageRange[]) {
    setResult(null);
    setReturning(false);
    setProgress({ done: 0, total: ranges.length });
    try {
      const names = partNames(ready.name, ranges);
      const parts: { name: string; bytes: Uint8Array }[] = [];
      // One at a time: memory stays at one part's worth of work in the engine, and progress is honest.
      for (const [i, { first, last }] of ranges.entries()) {
        const pages = Array.from({ length: last - first + 1 }, (_, k) => ({ doc: ready.info.id, page: first - 1 + k }));
        parts.push({ name: names[i]!, bytes: await engine.assemble(pages) });
        setProgress({ done: i + 1, total: ranges.length });
      }
      if (parts.length === 1) {
        setResult({
          file: new Blob([parts[0]!.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
          name: parts[0]!.name,
        });
      } else {
        setResult({
          file: new Blob([zipFiles(parts)], { type: "application/zip" }),
          name: outputName(ready.name, "split", "zip"),
          detail: `${plural(parts.length, "PDF")} in one zip file`,
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
        // Keyed by the file, so a new file starts with its own suggested split.
        <SplitOptions
          key={doc.key}
          doc={doc}
          progress={progress}
          buttonRef={splitRef}
          onSplit={(r) => void split(doc, r)}
        />
      )}
      {/* Stays mounted with a file open, so a file dropped anywhere swaps in rather than opening in the browser. */}
      <FileDrop onFiles={(files) => void intake.add(files)} multiple={false} compact={doc !== undefined} />
    </div>
  );
}

interface OptionsProps {
  doc: ReadyDocument;
  progress: { done: number; total: number } | null;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onSplit: (ranges: PageRange[]) => void;
}

function SplitOptions({ doc, progress, buttonRef, onSplit }: OptionsProps) {
  const pageCount = doc.info.pageCount;
  const [mode, setMode] = useState<Mode>("ranges");
  const [rangesText, setRangesText] = useState(() => suggestedRanges(pageCount));
  const [everyText, setEveryText] = useState("1");
  const ids = { ranges: useId(), every: useId(), hint: useId(), error: useId(), preview: useId() };
  const plan = planFor(mode, rangesText, everyText, pageCount);

  if (pageCount < 2) {
    return (
      <p className="rounded-card border border-line bg-surface px-4 py-3">
        This file has only one page, so there's nothing to split.
      </p>
    );
  }

  const inputClass =
    "mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none aria-invalid:border-sticky-coral";

  return (
    <>
      <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 font-semibold">Split by</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            name={`${ids.ranges}-mode`}
            checked={mode === "ranges"}
            onChange={() => setMode("ranges")}
            title="Page ranges"
          >
            One file for each range you type.
          </Choice>
          <Choice
            name={`${ids.ranges}-mode`}
            checked={mode === "every"}
            onChange={() => setMode("every")}
            title="Every N pages"
          >
            Equal parts, in page order.
          </Choice>
        </div>
        {mode === "ranges" ? (
          <div>
            <label htmlFor={ids.ranges} className="font-semibold">
              Pages for each file
            </label>
            <input
              id={ids.ranges}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={rangesText}
              onChange={(event) => setRangesText(event.target.value)}
              aria-invalid={!plan.ok || undefined}
              aria-describedby={`${ids.hint} ${plan.ok ? ids.preview : ids.error}`}
              className={inputClass}
            />
            <p id={ids.hint} className="mt-1 text-sm text-ink-muted">
              Separate files with commas, like 1-3, 4-8, 9-. This file has {plural(pageCount, "page")}.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor={ids.every} className="font-semibold">
              Pages per file
            </label>
            <input
              id={ids.every}
              type="number"
              inputMode="numeric"
              min={1}
              max={pageCount - 1}
              value={everyText}
              onChange={(event) => setEveryText(event.target.value)}
              aria-invalid={!plan.ok || undefined}
              aria-describedby={`${ids.hint} ${plan.ok ? ids.preview : ids.error}`}
              className={`${inputClass} max-w-40`}
            />
            <p id={ids.hint} className="mt-1 text-sm text-ink-muted">
              This file has {plural(pageCount, "page")}.
            </p>
          </div>
        )}
        {!plan.ok && (
          <p id={ids.error} className="text-sm font-semibold text-ink">
            {plan.error}
          </p>
        )}
        {plan.ok && <Preview id={ids.preview} ranges={plan.ranges} />}
      </fieldset>
      <ActionBar
        status={
          progress
            ? `Splitting… ${progress.done} of ${progress.total}`
            : !plan.ok
              ? "Fix the pages above to split."
              : plan.ranges.length === 1
                ? "1 PDF"
                : `${plural(plan.ranges.length, "PDF")}, downloaded as one zip`
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={!plan.ok || progress !== null}
          className={primaryButton}
          onClick={() => plan.ok && onSplit(plan.ranges)}
        >
          {progress ? "Splitting…" : "Split PDF"}
        </button>
      </ActionBar>
    </>
  );
}

function Preview({ id, ranges }: { id: string; ranges: PageRange[] }) {
  const shown = ranges.slice(0, PREVIEW);
  return (
    <div id={id}>
      <p className="text-sm text-ink-muted">You'll get {plural(ranges.length, "file")}:</p>
      <ol className="mt-2 flex flex-wrap gap-2" aria-label="Files you'll get">
        {shown.map((range, i) => (
          <li key={i} className="rounded-pill bg-sticky-yellow/40 px-3 py-1 text-sm">
            <span className="font-semibold">{i + 1}</span> · {describeRange(range)}
            <span className="sr-only">, {plural(rangeLength(range), "page")}</span>
          </li>
        ))}
        {ranges.length > PREVIEW && (
          <li className="px-1 py-1 text-sm text-ink-muted">and {ranges.length - PREVIEW} more</li>
        )}
      </ol>
    </div>
  );
}
