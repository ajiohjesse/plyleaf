import { useId, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { unsupportedCharacters } from "~/editor/fonts";
import type { ReadyDocument } from "~/intake/intake";
import { batesEdits, batesLabel, DEFAULT_BATES, type BatesOptions } from "~/pagetools/bates";
import { DEFAULT_STYLE } from "~/pagetools/stamping";
import { ActionBar, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";
import { fieldClass, PagePreview, panelClass, PositionGrid, StyleFields, WholeNumberField } from "./fields";

/** The Bates numbering workspace: a prefix, a zero-padded number counted page by page, and a suffix on each page. */
export function BatesWorkspace() {
  return <SingleFileTool Options={BatesPanel} />;
}

/** The first and last labels of a run, e.g. "ACME000001–ACME000012". */
function labels(options: BatesOptions, pageCount: number) {
  const count = pageCount - Math.min(options.from, pageCount) + 1;
  return {
    first: batesLabel(options, options.startAt),
    last: batesLabel(options, options.startAt + count - 1),
    next: options.startAt + count,
  };
}

async function stamp(doc: ReadyDocument, options: BatesOptions): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, { edits: batesEdits(doc.info.pages, options) });
  const { first, last, next } = labels(options, doc.info.pageCount);
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "bates"),
    detail: `Numbered ${first} to ${last}. The next file starts at ${next}.`,
  };
}

function BatesPanel({ doc, run, working, buttonRef }: ToolProps) {
  const pageCount = doc.info.pageCount;
  const [options, setOptions] = useState<BatesOptions>({ ...DEFAULT_BATES, style: { ...DEFAULT_STYLE, size: 10 } });
  const set = (patch: Partial<BatesOptions>) => setOptions((current) => ({ ...current, ...patch }));
  const ids = { prefix: useId(), suffix: useId() };
  const shown = Math.min(options.from, pageCount) - 1;
  const preview = batesEdits(doc.info.pages, options).pages.find((entry) => entry.page === shown);
  const { first, last } = labels(options, pageCount);
  const missing = unsupportedCharacters(options.prefix + options.suffix);

  return (
    <>
      <div className="space-y-4">
        <section className={panelClass} aria-label="Number">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor={ids.prefix} className="font-semibold">
                Prefix
              </label>
              <input
                id={ids.prefix}
                type="text"
                value={options.prefix}
                placeholder="e.g. ACME"
                onChange={(event) => set({ prefix: event.target.value })}
                className={fieldClass}
              />
            </div>
            <WholeNumberField
              label="First number"
              value={options.startAt}
              min={0}
              max={999_999_999}
              onChange={(startAt) => set({ startAt })}
            />
            <WholeNumberField
              label="Digits"
              value={options.digits}
              min={1}
              max={12}
              onChange={(digits) => set({ digits })}
            />
            <div>
              <label htmlFor={ids.suffix} className="font-semibold">
                Suffix
              </label>
              <input
                id={ids.suffix}
                type="text"
                value={options.suffix}
                onChange={(event) => set({ suffix: event.target.value })}
                className={fieldClass}
              />
            </div>
          </div>
          {missing.length > 0 && (
            <p className="text-sm font-semibold">
              {missing.join(" ")} can&apos;t be shown in the standard fonts and will be left out.
            </p>
          )}
          <StyleFields style={options.style} onChange={(style) => set({ style })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <WholeNumberField
              label="From page"
              value={options.from}
              min={1}
              max={pageCount}
              onChange={(from) => set({ from })}
            />
            <WholeNumberField
              label="Margin (points)"
              value={options.margin}
              min={0}
              max={200}
              onChange={(margin) => set({ margin })}
              hint="72 points is an inch."
            />
          </div>
        </section>
        <section className={`${panelClass} sm:grid sm:grid-cols-[auto_1fr] sm:gap-6 sm:space-y-0`} aria-label="Preview">
          <PositionGrid value={options.position} onChange={(position) => set({ position })} />
          <div>
            <p className="font-semibold">Page {shown + 1}</p>
            <PagePreview docId={doc.info.id} index={shown} page={doc.info.pages[shown]!} marks={preview?.marks ?? []} />
          </div>
        </section>
      </div>
      <ActionBar status={working ? "Numbering…" : `${first} to ${last}`}>
        <button
          type="button"
          ref={buttonRef}
          disabled={working}
          className={primaryButton}
          onClick={() => run(() => stamp(doc, options))}
        >
          {working ? "Numbering…" : "Add Bates numbers"}
        </button>
      </ActionBar>
    </>
  );
}
