import { useId, useState } from "react";
import { engine, type Metadata } from "~/engine/client";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { EDITABLE_FIELDS, formatPdfDate } from "~/secure/metadata";
import { ActionBar, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";

/** The PDF metadata workspace: change the title, author and other document information, or remove all of it. */
export function MetadataWorkspace() {
  return <SingleFileTool Options={MetadataOptions} />;
}

async function save(doc: ReadyDocument, change: { set: Metadata } | "remove"): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, { metadata: change });
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, change === "remove" ? "no-metadata" : "metadata"),
    detail: change === "remove" ? "No title, author, dates or other hidden details." : "Document information updated.",
  };
}

function MetadataOptions({ doc, run, working, buttonRef }: ToolProps) {
  const original = doc.info.metadata;
  const [values, setValues] = useState<Metadata>(() =>
    Object.fromEntries(EDITABLE_FIELDS.map(({ field }) => [field, original[field] ?? ""])),
  );
  const formId = useId();
  const ids = useId();
  // Only what changed is sent, so untouched fields stay exactly as they were.
  const changed = Object.fromEntries(
    EDITABLE_FIELDS.flatMap(({ field }) =>
      (values[field] ?? "") !== (original[field] ?? "") ? [[field, values[field] ?? ""]] : [],
    ),
  ) as Metadata;
  const hasChanges = Object.keys(changed).length > 0;
  const dates = (["CreationDate", "ModDate"] as const).filter((field) => original[field]);

  return (
    <>
      <form
        id={formId}
        className="space-y-4 rounded-card border border-line bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (hasChanges) run(() => save(doc, { set: changed }));
        }}
      >
        {EDITABLE_FIELDS.map(({ field, label, hint }) => (
          <div key={field}>
            <label htmlFor={`${ids}-${field}`} className="font-semibold">
              {label}
            </label>
            <input
              id={`${ids}-${field}`}
              type="text"
              value={values[field] ?? ""}
              onChange={(event) => setValues((v) => ({ ...v, [field]: event.target.value }))}
              aria-describedby={hint ? `${ids}-${field}-hint` : undefined}
              className="mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none"
            />
            {hint && (
              <p id={`${ids}-${field}-hint`} className="mt-1 text-sm text-ink-muted">
                {hint}
              </p>
            )}
          </div>
        ))}
        {dates.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {dates.map((field) => (
              <div key={field} className="contents">
                <dt className="font-semibold">{field === "CreationDate" ? "Created" : "Last changed"}</dt>
                <dd className="text-ink-muted">{formatPdfDate(original[field]!)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-sm text-ink-muted">Leave a field empty to remove it.</p>
      </form>
      <ActionBar
        status={
          working ? "Saving…" : hasChanges ? "Ready to save your changes." : "Change a field, or remove everything."
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={working}
            onClick={() => run(() => save(doc, "remove"))}
            className="btn-pill border-2 border-primary bg-surface text-primary hover:bg-sticky-lavender/30 disabled:opacity-60"
          >
            Remove all metadata
          </button>
          <button
            type="submit"
            form={formId}
            ref={buttonRef}
            disabled={working || !hasChanges}
            className={primaryButton}
          >
            Save changes
          </button>
        </div>
      </ActionBar>
    </>
  );
}
