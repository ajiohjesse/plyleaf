import { useEffect, useId, useRef, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { LANGUAGES, MAX_LANGUAGES, startingLanguages, type LanguageCode } from "~/ocr/catalogue";
import type { OcrProgress } from "~/ocr/ocr";
import { ActionBar, plural, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";

/** A page with fewer characters of text than this is taken to be a scan (a stray page number doesn't count). */
const SCANNED_BELOW = 10;

/** The OCR PDF workspace: one PDF, its pages read in the languages chosen, and invisible text put over them. */
export function OcrWorkspace() {
  return <SingleFileTool intake={{ accept: ["pdf", "image"] }} Options={OcrOptions} />;
}

/** Which pages to read: those without text, or (`all`) every page. */
export function pagesToRead(amounts: readonly number[], all: boolean): number[] {
  return amounts.flatMap((amount, page) => (all || amount < SCANNED_BELOW ? [page] : []));
}

async function makeSearchable(
  doc: ReadyDocument,
  pages: number[],
  languages: LanguageCode[],
  onProgress: (progress: OcrProgress) => void,
  signal: AbortSignal,
): Promise<Outcome> {
  const { readPages, OcrCancelled } = await import("~/ocr/ocr");
  let result;
  try {
    result = await readPages(doc.info.id, doc.info.pages, pages, languages, onProgress, signal);
  } catch (error) {
    if (error instanceof OcrCancelled) return { info: "Stopped. Your file hasn't been changed." };
    throw error;
  }
  const words = [...result.words.values()].reduce((sum, count) => sum + count, 0);
  if (result.layers.length === 0) {
    return {
      info: `No words were found on ${pages.length === 1 ? "the page" : `the ${pages.length} pages`} read. Check the languages chosen; very small, blurry or handwritten text may not be readable.`,
    };
  }
  const bytes = await engine.transform(doc.info.id, { textLayers: result.layers });
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "ocr"),
    detail: `${plural(words, "word")} read on ${plural(result.layers.length, "page")}, now searchable`,
  };
}

function OcrOptions({ doc, run, working, buttonRef }: ToolProps) {
  const [languages, setLanguages] = useState<LanguageCode[]>(() =>
    startingLanguages(typeof navigator === "undefined" ? [] : navigator.languages),
  );
  const [amounts, setAmounts] = useState<number[] | null>(null);
  const [readAll, setReadAll] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const abort = useRef<AbortController | null>(null);
  const hint = useId();

  useEffect(() => {
    let current = true;
    engine.textAmounts(doc.info.id).then(
      (found) => current && setAmounts(found),
      // Can't tell: read every page.
      () => current && setAmounts(doc.info.pages.map(() => 0)),
    );
    return () => {
      current = false;
    };
  }, [doc.info.id, doc.info.pages]);

  const withText = amounts ? amounts.filter((amount) => amount >= SCANNED_BELOW).length : 0;
  const pages = amounts ? pagesToRead(amounts, readAll) : [];
  const ordered = [...LANGUAGES].sort(
    (a, b) => Number(languages.includes(b.code)) - Number(languages.includes(a.code)),
  );
  const chosenSize = LANGUAGES.filter((language) => languages.includes(language.code)).reduce(
    (sum, language) => sum + language.size,
    0,
  );

  function toggle(code: LanguageCode) {
    setLanguages((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code].slice(0, MAX_LANGUAGES),
    );
  }

  function start() {
    const controller = new AbortController();
    abort.current = controller;
    setProgress(null);
    run(async () => {
      try {
        return await makeSearchable(doc, pages, languages, setProgress, controller.signal);
      } finally {
        abort.current = null;
        setProgress(null);
      }
    });
  }

  const status = working
    ? progress?.stage === "reading"
      ? `Reading page ${progress.page + 1} (${progress.done + 1} of ${pages.length})…`
      : "Loading the reading data…"
    : amounts === null
      ? "Looking for pages to read…"
      : languages.length === 0
        ? "Choose the language the document is in."
        : pages.length === 0
          ? `Every page already has text you can search. To read them anyway, tick “Also read pages that have text”.`
          : pages.length === doc.info.pageCount
            ? `${plural(pages.length, "page")} to read.`
            : `${plural(pages.length, "page")} to read; ${plural(withText, "page")} already ${withText === 1 ? "has" : "have"} text.`;

  return (
    <>
      <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4" aria-describedby={hint}>
        <legend className="px-1 font-semibold">Languages in the document</legend>
        <p id={hint} className="text-sm text-ink-muted">
          Choose up to {MAX_LANGUAGES}. Each one&apos;s reading data ({chosenSize.toFixed(1)} MB for these) comes from
          Plyleaf the first time and then from your browser&apos;s cache. Your file stays here.
        </p>
        <ul className="grid max-h-72 gap-2 overflow-y-auto p-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((language) => {
            const checked = languages.includes(language.code);
            return (
              <li key={language.code}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-line px-3 py-2 has-checked:border-primary has-checked:bg-sticky-lavender/20 has-disabled:cursor-not-allowed has-disabled:opacity-50">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={working || (!checked && languages.length >= MAX_LANGUAGES)}
                    onChange={() => toggle(language.code)}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{language.name}</span>
                    {language.native !== language.name && (
                      <span className="text-ink-muted" lang={language.bcp47}>
                        {" "}
                        · {language.native}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-ink-muted tabular-nums">{language.size.toFixed(1)} MB</span>
                </label>
              </li>
            );
          })}
        </ul>
        {withText > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={readAll}
              disabled={working}
              onChange={(event) => setReadAll(event.target.checked)}
            />
            <span>
              Also read pages that have text{" "}
              <span className="text-ink-muted">(their text stays, so a search may find some words twice)</span>
            </span>
          </label>
        )}
      </fieldset>
      <ActionBar
        status={
          <span className="flex items-center gap-3">
            {working && (
              <progress
                className="h-2 w-28 accent-primary"
                max={1}
                value={progress?.fraction ?? 0}
                aria-label="Progress"
              />
            )}
            <span aria-live="polite">{status}</span>
          </span>
        }
      >
        {working ? (
          <button
            type="button"
            className="btn-pill border-2 border-line hover:bg-ink/10"
            onClick={() => abort.current?.abort()}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            ref={buttonRef}
            disabled={amounts === null || pages.length === 0 || languages.length === 0}
            className={primaryButton}
            onClick={start}
          >
            Make it searchable
          </button>
        )}
      </ActionBar>
    </>
  );
}
