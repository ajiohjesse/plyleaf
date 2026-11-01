import { useId, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { ActionBar, Choice, plural, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";

/** The Flatten PDF workspace: form fields (and annotations) drawn into the pages, so they can't be changed. */
export function FlattenWorkspace() {
  return <SingleFileTool Options={FlattenOptions} />;
}

async function flatten(doc: ReadyDocument, what: "forms" | "all"): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, { flatten: what });
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "flattened"),
    detail:
      what === "all"
        ? "Form fields and annotations are now part of the pages."
        : "Form fields are now part of the pages.",
  };
}

function FlattenOptions({ doc, run, working, buttonRef }: ToolProps) {
  const { annotations, formFields } = doc.info;
  const [what, setWhat] = useState<"forms" | "all">("all");
  const name = useId();

  if (annotations === 0 && formFields === 0) {
    return (
      <p className="rounded-card border border-line bg-surface px-4 py-3">
        {doc.name} has no form fields or annotations, so there&apos;s nothing to flatten. Links stay links either way.
      </p>
    );
  }
  const nothing = what === "forms" && formFields === 0;
  return (
    <>
      <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 font-semibold">Flatten</legend>
        <p className="text-sm text-ink-muted">
          This PDF has {plural(formFields, "form field")} and {plural(annotations, "annotation")} (comments, highlights,
          drawings).
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name={name} checked={what === "all"} onChange={() => setWhat("all")} title="Everything">
            Form fields and annotations become part of the page.
          </Choice>
          <Choice name={name} checked={what === "forms"} onChange={() => setWhat("forms")} title="Form fields only">
            Filled-in forms are fixed; comments stay editable.
          </Choice>
        </div>
      </fieldset>
      <ActionBar
        status={
          working
            ? "Flattening…"
            : nothing
              ? "There are no form fields: choose Everything to flatten the annotations."
              : "What you see stays the same; it just can't be changed."
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={working || nothing}
          className={primaryButton}
          onClick={() => run(() => flatten(doc, what))}
        >
          {working ? "Flattening…" : "Flatten PDF"}
        </button>
      </ActionBar>
    </>
  );
}
