import { useId, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { unsupportedCharacters } from "~/editor/fonts";
import type { ReadyDocument } from "~/intake/intake";
import { EMPTY_SLOTS, headerFooterEdits, SLOTS, type HeaderFooterOptions } from "~/pagetools/headers";
import { DEFAULT_STYLE, today } from "~/pagetools/stamping";
import { ActionBar, plural, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";
import { fieldClass, PagePreview, panelClass, StyleFields, WholeNumberField } from "./fields";

/** The Header & footer workspace: text at the top and bottom of each page, with page numbers, date and file name. */
export function HeaderFooterWorkspace() {
  return <SingleFileTool Options={HeaderFooterPanel} />;
}

async function addHeaders(doc: ReadyDocument, options: HeaderFooterOptions): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, { edits: headerFooterEdits(doc.info.pages, options) });
  const pages = doc.info.pageCount - Math.min(options.from, doc.info.pageCount) + 1;
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "header-footer"),
    detail: `Header and footer on ${plural(pages, "page")}.`,
  };
}

function HeaderFooterPanel({ doc, run, working, buttonRef }: ToolProps) {
  const pageCount = doc.info.pageCount;
  const [options, setOptions] = useState<HeaderFooterOptions>(() => ({
    text: { ...EMPTY_SLOTS, "top-left": "{file}", "bottom-right": "Page {page} of {pages}" },
    style: { ...DEFAULT_STYLE, size: 9, color: [0.36, 0.35, 0.45] },
    margin: 24,
    from: 1,
    startAt: 1,
    file: doc.name,
    date: today(),
  }));
  const set = (patch: Partial<HeaderFooterOptions>) => setOptions((current) => ({ ...current, ...patch }));
  const ids = useId();
  const shown = Math.min(options.from, pageCount) - 1;
  const preview = headerFooterEdits(doc.info.pages, options).pages.find((entry) => entry.page === shown);
  const filled = SLOTS.filter(({ slot }) => options.text[slot].trim()).length;
  const missing = unsupportedCharacters(SLOTS.map(({ slot }) => options.text[slot]).join(""));

  return (
    <>
      <div className="space-y-4">
        <section className={panelClass} aria-label="Header and footer text">
          {(["Header", "Footer"] as const).map((part, row) => (
            <fieldset key={part}>
              <legend className="font-semibold">{part}</legend>
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                {SLOTS.slice(row * 3, row * 3 + 3).map(({ slot, label }) => (
                  <div key={slot}>
                    <label htmlFor={`${ids}-${slot}`} className="text-sm text-ink-muted">
                      {label.replace(`${part} `, "").replace(/^./, (c) => c.toUpperCase())}
                    </label>
                    <input
                      id={`${ids}-${slot}`}
                      type="text"
                      aria-label={label}
                      value={options.text[slot]}
                      onChange={(event) => set({ text: { ...options.text, [slot]: event.target.value } })}
                      className={`${fieldClass} mt-0`}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-sm text-ink-muted">
            {
              "Type {page} for the page number, {pages} for the last one, {date} for today and {file} for the file’s name."
            }
          </p>
          {missing.length > 0 && (
            <p className="text-sm font-semibold">
              {missing.join(" ")} can&apos;t be shown in the standard fonts and will be left out.
            </p>
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
              label="First page number"
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
        <section className={panelClass} aria-label="Preview">
          <p className="font-semibold">Page {shown + 1}</p>
          <PagePreview docId={doc.info.id} index={shown} page={doc.info.pages[shown]!} marks={preview?.marks ?? []} />
        </section>
      </div>
      <ActionBar
        status={
          working
            ? "Adding…"
            : filled === 0
              ? "Type something in the header or footer."
              : `${plural(filled, "line")} on pages ${options.from}–${pageCount}.`
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={working || filled === 0}
          className={primaryButton}
          onClick={() => run(() => addHeaders(doc, options))}
        >
          {working ? "Adding…" : "Add header & footer"}
        </button>
      </ActionBar>
    </>
  );
}
