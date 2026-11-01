import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { ActionBar, plural, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";

/** The Grayscale PDF workspace: one PDF, every page made grey. */
export function GrayscaleWorkspace() {
  return <SingleFileTool Options={GrayscaleOptions} />;
}

async function toGrey(doc: ReadyDocument): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, { grayscale: true });
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "grayscale"),
    detail: plural(doc.info.pageCount, "page") + " in shades of grey",
  };
}

function GrayscaleOptions({ doc, run, working, buttonRef }: ToolProps) {
  return (
    <ActionBar
      status={
        working
          ? "Converting… large files can take a minute."
          : `${plural(doc.info.pageCount, "page")}: text, drawings and images will all be grey.`
      }
    >
      <button
        type="button"
        ref={buttonRef}
        disabled={working}
        className={primaryButton}
        onClick={() => run(() => toGrey(doc))}
      >
        {working ? "Converting…" : "Convert to grayscale"}
      </button>
    </ActionBar>
  );
}
