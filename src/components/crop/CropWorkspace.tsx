import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { engine } from "~/engine/client";
import type { Crop, PageSpec } from "~/engine/types";
import { outputName } from "~/download/download";
import { operationFailureMessage } from "~/intake/files";
import type { ReadyDocument } from "~/intake/intake";
import { cropFromMargins, dragCrop, FULL, isFull, marginsOf, type Grip, type Margins } from "~/organize/crop";
import { keysInRanges, boardFrom } from "~/organize/board";
import { parseRanges } from "~/organize/ranges";
import { thumbnails } from "~/thumbnails/thumbnails";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import { PageCanvas } from "~/components/thumbnails/PageCanvas";
import {
  ActionBar,
  Choice,
  FailureAlert,
  FileCard,
  IconButton,
  plural,
  primaryButton,
  type Result,
} from "~/components/workspace/parts";

/** The preview is at most this wide (CSS pixels) and this tall, so the frame is easy to handle. */
const PREVIEW = { width: 480, height: 560 };

/**
 * The Crop PDF workspace: one PDF in, a crop frame drawn on a page (dragged, or set by typing margins), applied to
 * every page or the pages typed, and out as a PDF whose pages show only that part. Cropping sets each page's crop box,
 * so the content outside is hidden, not removed.
 */
export function CropWorkspace() {
  const [state, intake] = useIntake({ multiple: false });
  const doc = state.documents[0];
  const ready = doc?.status === "ready" ? doc : null;
  // The frame and page choice belong to one file; a new file starts afresh.
  const [crop, setCrop] = useState<{ key: string; crop: Crop } | null>(null);
  const current = ready && crop?.key === ready.key ? crop.crop : FULL;
  const [making, setMaking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) actionRef.current?.focus();
  }, [returning]);

  async function make(document: ReadyDocument, pages: number[], frame: Crop) {
    setMaking(true);
    setResult(null);
    setReturning(false);
    try {
      const chosen = new Set(pages);
      const specs: PageSpec[] = document.info.pages.map((_, page) => ({
        doc: document.info.id,
        page,
        ...(chosen.has(page) && { crop: frame }),
      }));
      const bytes = await engine.assemble(specs);
      setResult({ file: new Blob([bytes], { type: "application/pdf" }), name: outputName(document.name, "cropped") });
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
    <div className="space-y-4" data-files={doc ? true : undefined} data-busy={state.busy || making || undefined}>
      {doc && <FileCard doc={doc} onRemove={() => void intake.remove(doc.key)} />}
      <IntakeNotices state={state} intake={intake} />
      {result && "error" in result && <FailureAlert message={result.error} />}
      {ready && (
        <CropOptions
          key={ready.key}
          doc={ready}
          crop={current}
          onCrop={(next) => setCrop({ key: ready.key, crop: next })}
          making={making}
          buttonRef={actionRef}
          onMake={(pages) => void make(ready, pages, current)}
        />
      )}
      {/* Stays mounted with a file open, so a file dropped anywhere swaps in rather than opening in the browser. */}
      <FileDrop onFiles={(files) => void intake.add(files)} multiple={false} compact={doc !== undefined} />
    </div>
  );
}

interface OptionsProps {
  doc: ReadyDocument;
  crop: Crop;
  onCrop: (crop: Crop) => void;
  making: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onMake: (pages: number[]) => void;
}

function CropOptions({ doc, crop, onCrop, making, buttonRef, onMake }: OptionsProps) {
  const pageCount = doc.info.pageCount;
  const [shown, setShown] = useState(0);
  const [which, setWhich] = useState<"all" | "some">("all");
  const [rangesText, setRangesText] = useState("");
  const ids = { mode: useId(), ranges: useId(), rangesError: useId() };
  useEffect(() => () => thumbnails.forget(doc.info.id), [doc.info.id]);

  let pages: number[] | null = Array.from({ length: pageCount }, (_, i) => i);
  let rangesError = "";
  if (which === "some") {
    const parsed = parseRanges(rangesText, pageCount);
    if (parsed.ok) {
      // keysInRanges dedupes overlapping ranges; a throwaway board maps positions to page indexes.
      const board = boardFrom(doc.info);
      const keys = keysInRanges(board, parsed.ranges);
      pages = board.flatMap((page, index) => (keys.has(page.key) ? [index] : []));
    } else {
      pages = null;
      rangesError = rangesText.trim() === "" ? "Type the pages to crop, like 1-3, 5." : parsed.error;
    }
  }
  const full = isFull(crop);
  const percent = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <>
      <section aria-label="Crop area" className="space-y-3 rounded-card border border-line bg-surface p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <IconButton label="Previous page" disabled={shown === 0} onClick={() => setShown(shown - 1)}>
            <Chevron left />
          </IconButton>
          <p className="text-sm font-semibold" aria-live="polite">
            Page {shown + 1} of {pageCount}
          </p>
          <IconButton label="Next page" disabled={shown === pageCount - 1} onClick={() => setShown(shown + 1)}>
            <Chevron />
          </IconButton>
        </div>
        <CropFrame doc={doc} page={shown} crop={crop} onCrop={onCrop} />
        <p className="text-center text-sm text-ink-muted">Drag the frame or its handles, or type the margins below.</p>
      </section>

      <MarginFields crop={crop} onCrop={onCrop} />

      <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 font-semibold">Crop which pages</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name={ids.mode} checked={which === "all"} onChange={() => setWhich("all")} title="All pages">
            The same area of every page.
          </Choice>
          <Choice name={ids.mode} checked={which === "some"} onChange={() => setWhich("some")} title="Some pages">
            Only the pages you type.
          </Choice>
        </div>
        {which === "some" && (
          <div>
            <label htmlFor={ids.ranges} className="font-semibold">
              Pages to crop
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
              aria-describedby={ids.rangesError}
              className="mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none aria-invalid:border-sticky-coral"
            />
            <p id={ids.rangesError} className="mt-1 text-sm text-ink-muted">
              {rangesError || `${plural(pages!.length, "page")} of ${pageCount}.`}
            </p>
          </div>
        )}
      </fieldset>

      <ActionBar
        status={
          making
            ? "Cropping…"
            : full
              ? "Move the frame's edges in to choose what to keep."
              : !pages
                ? "Choose the pages to crop."
                : `${plural(pages.length, "page")} cropped to ${percent(crop.width)} × ${percent(crop.height)}`
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={full || !pages || pages.length === 0 || making}
          className={primaryButton}
          onClick={() => pages && onMake(pages)}
        >
          {making ? "Cropping…" : "Crop PDF"}
        </button>
      </ActionBar>
    </>
  );
}

/** The page with the crop frame over it: outside the frame is dimmed, and the frame and its handles can be dragged. */
function CropFrame({
  doc,
  page,
  crop,
  onCrop,
}: {
  doc: ReadyDocument;
  page: number;
  crop: Crop;
  onCrop: (crop: Crop) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(PREVIEW.width);
  useLayoutEffect(() => {
    const element = wrapRef.current!;
    // The content box: clientWidth includes the padding around the page.
    const measure = () => {
      const style = getComputedStyle(element);
      const inner = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setAvailable(Math.max(1, Math.min(PREVIEW.width, inner)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const info = doc.info.pages[page]!;
  const scale = Math.min(available / info.width, PREVIEW.height / info.height);
  const size = {
    width: Math.max(1, Math.round(info.width * scale)),
    height: Math.max(1, Math.round(info.height * scale)),
  };
  const drag = useRef<{ grip: Grip; x: number; y: number; start: Crop } | null>(null);

  function begin(grip: Grip) {
    return (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      drag.current = { grip, x: event.clientX, y: event.clientY, start: crop };
    };
  }
  function move(event: React.PointerEvent) {
    const active = drag.current;
    if (!active) return;
    onCrop(
      dragCrop(
        active.start,
        active.grip,
        (event.clientX - active.x) / size.width,
        (event.clientY - active.y) / size.height,
      ),
    );
  }
  function end() {
    drag.current = null;
  }
  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  const grips: { grip: Grip; style: React.CSSProperties; cursor: string }[] = [
    { grip: "nw", style: { left: 0, top: 0 }, cursor: "nwse-resize" },
    { grip: "n", style: { left: "50%", top: 0 }, cursor: "ns-resize" },
    { grip: "ne", style: { left: "100%", top: 0 }, cursor: "nesw-resize" },
    { grip: "e", style: { left: "100%", top: "50%" }, cursor: "ew-resize" },
    { grip: "se", style: { left: "100%", top: "100%" }, cursor: "nwse-resize" },
    { grip: "s", style: { left: "50%", top: "100%" }, cursor: "ns-resize" },
    { grip: "sw", style: { left: 0, top: "100%" }, cursor: "nesw-resize" },
    { grip: "w", style: { left: 0, top: "50%" }, cursor: "ew-resize" },
  ];

  return (
    <div ref={wrapRef} className="grid place-items-center rounded-lg bg-surface-band p-4 sm:p-6">
      <div
        className="relative touch-none bg-surface shadow-sticky ring-1 ring-line select-none"
        style={size}
        data-crop-preview
      >
        <PageCanvas docId={doc.info.id} index={page} width={size.width} onScreen />
        {/* The frame. Its huge shadow dims everything outside it; the preview clips nothing, so it's masked here. */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            data-crop-frame
            className="absolute cursor-move border-2 border-primary"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
              boxShadow: "0 0 0 9999px rgb(15 13 46 / 0.45)",
            }}
            onPointerDown={begin("move")}
            {...handlers}
          />
        </div>
        {/* Handles sit outside the clipping layer so the ones on the page's edge aren't cut in half. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.width * 100}%`,
            height: `${crop.height * 100}%`,
          }}
        >
          {grips.map(({ grip, style, cursor }) => (
            <span
              key={grip}
              data-grip={grip}
              className="pointer-events-auto absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center"
              style={{ ...style, cursor }}
              onPointerDown={begin(grip)}
              {...handlers}
            >
              <span className="size-3 border-2 border-primary bg-surface" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const SIDES: { side: keyof Margins; label: string }[] = [
  { side: "top", label: "Top" },
  { side: "bottom", label: "Bottom" },
  { side: "left", label: "Left" },
  { side: "right", label: "Right" },
];

/** The frame as four margins in percent of the page, for keyboards and exact values. */
function MarginFields({ crop, onCrop }: { crop: Crop; onCrop: (crop: Crop) => void }) {
  const baseId = useId();
  const errorId = useId();
  // While a field is being edited, what's typed (which may not be a valid margin yet).
  const [draft, setDraft] = useState<{ side: keyof Margins; text: string } | null>(null);
  const margins = marginsOf(crop);
  const shown = (side: keyof Margins) =>
    draft?.side === side ? draft.text : String(Math.round(margins[side] * 1000) / 10);
  let error = "";
  if (draft) {
    const value = Number(draft.text);
    if (draft.text.trim() === "" || !Number.isFinite(value) || value < 0) error = "Type a margin from 0 to 95%.";
    else if (!cropFromMargins({ ...margins, [draft.side]: value / 100 })) error = "That leaves too little of the page.";
  }

  function change(side: keyof Margins, text: string) {
    setDraft({ side, text });
    const value = Number(text);
    if (text.trim() === "" || !Number.isFinite(value)) return;
    const next = cropFromMargins({ ...margins, [side]: value / 100 });
    if (next) onCrop(next);
  }

  return (
    <fieldset className="rounded-card border border-line bg-surface p-4">
      <legend className="px-1 font-semibold">Margins to cut, in % of the page</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SIDES.map(({ side, label }) => (
          <div key={side}>
            <label htmlFor={`${baseId}-${side}`} className="text-sm font-semibold">
              {label}
            </label>
            <input
              id={`${baseId}-${side}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={95}
              step={0.5}
              value={shown(side)}
              onChange={(event) => change(side, event.target.value)}
              onBlur={() => setDraft(null)}
              aria-invalid={draft?.side === side && error ? true : undefined}
              aria-describedby={draft?.side === side && error ? errorId : undefined}
              className="mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none aria-invalid:border-sticky-coral"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p id={errorId} className="text-sm font-semibold">
          {error}
        </p>
        <button
          type="button"
          className="btn-pill min-h-10 border-2 border-line bg-surface px-4 text-sm hover:border-primary disabled:cursor-default disabled:opacity-50 disabled:hover:border-line"
          disabled={isFull(crop)}
          onClick={() => onCrop(FULL)}
        >
          Reset
        </button>
      </div>
    </fieldset>
  );
}

function Chevron({ left = false }: { left?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d={left ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
