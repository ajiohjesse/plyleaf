import { useId, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { DEFAULT_NUMBERS, NUMBER_FORMATS, pageNumberEdits, type NumberOptions } from "~/pagetools/numbers";
import { DEFAULT_STYLE } from "~/pagetools/stamping";
import { ActionBar, plural, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";
import { fieldClass, PagePreview, panelClass, PositionGrid, StyleFields, WholeNumberField } from "./fields";

/** The Page numbers workspace: a number on every page (or from a page on), placed and styled, with a preview. */
export function PageNumbersWorkspace() {
  return <SingleFileTool Options={NumberOptionsPanel} />;
}

async function number(doc: ReadyDocument, options: NumberOptions): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, { edits: pageNumberEdits(doc.info.pages, options) });
  const numbered = doc.info.pageCount - options.from + 1;
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "numbered"),
    detail: `${plural(numbered, "page")} numbered.`,
  };
}

function NumberOptionsPanel({ doc, run, working, buttonRef }: ToolProps) {
  const pageCount = doc.info.pageCount;
  const [options, setOptions] = useState<NumberOptions>({ ...DEFAULT_NUMBERS, style: DEFAULT_STYLE });
  const set = (patch: Partial<NumberOptions>) => setOptions((current) => ({ ...current, ...patch }));
  const ids = { format: useId(), custom: useId() };
  const preset = NUMBER_FORMATS.find((format) => format.template === options.template);
  const [custom, setCustom] = useState(false);
  const shown = Math.min(options.from, pageCount) - 1;
  const preview = pageNumberEdits(doc.info.pages, options).pages.find((entry) => entry.page === shown);
  const valid = options.template.includes("{page}");

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-4">
          <section className={panelClass} aria-label="Number style">
            <div>
              <label htmlFor={ids.format} className="font-semibold">
                Format
              </label>
              <select
                id={ids.format}
                value={custom || !preset ? "custom" : preset.id}
                onChange={(event) => {
                  const chosen = NUMBER_FORMATS.find((format) => format.id === event.target.value);
                  setCustom(!chosen);
                  if (chosen) set({ template: chosen.template });
                }}
                className={fieldClass}
              >
                {NUMBER_FORMATS.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.label}
                  </option>
                ))}
                <option value="custom">Your own words…</option>
              </select>
            </div>
            {(custom || !preset) && (
              <div>
                <label htmlFor={ids.custom} className="font-semibold">
                  Words
                </label>
                <input
                  id={ids.custom}
                  type="text"
                  value={options.template}
                  onChange={(event) => set({ template: event.target.value })}
                  aria-describedby={`${ids.custom}-hint`}
                  aria-invalid={!valid || undefined}
                  className={`${fieldClass} aria-invalid:border-sticky-coral`}
                />
                <p id={`${ids.custom}-hint`} className="mt-1 text-sm text-ink-muted">
                  {"{page} is the number and {pages} the last one, as in “Sheet {page} of {pages}”."}
                </p>
              </div>
            )}
            <StyleFields style={options.style} onChange={(style) => set({ style })} />
          </section>
          <section className={panelClass} aria-label="Which pages">
            <div className="grid gap-3 sm:grid-cols-3">
              <WholeNumberField
                label="From page"
                value={options.from}
                min={1}
                max={pageCount}
                onChange={(from) => set({ from })}
                hint="Leave out a cover page or two."
              />
              <WholeNumberField
                label="First number"
                value={options.startAt}
                min={0}
                max={99999}
                onChange={(startAt) => set({ startAt })}
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
        </div>
        <section className={`${panelClass} sm:grid sm:grid-cols-[auto_1fr] sm:gap-6 sm:space-y-0`} aria-label="Preview">
          <PositionGrid value={options.position} onChange={(position) => set({ position })} />
          <div>
            <p className="font-semibold">Page {shown + 1}</p>
            <PagePreview docId={doc.info.id} index={shown} page={doc.info.pages[shown]!} marks={preview?.marks ?? []} />
          </div>
        </section>
      </div>
      <ActionBar
        status={
          working
            ? "Numbering…"
            : !valid
              ? "Put {page} where the number goes."
              : `Pages ${options.from}–${pageCount} numbered from ${options.startAt}.`
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={working || !valid}
          className={primaryButton}
          onClick={() => run(() => number(doc, options))}
        >
          {working ? "Numbering…" : "Add page numbers"}
        </button>
      </ActionBar>
    </>
  );
}
