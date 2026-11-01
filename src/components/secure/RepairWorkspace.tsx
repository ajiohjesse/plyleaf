import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { ActionBar, plural, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";

/**
 * The Repair PDF workspace. MuPDF rebuilds a damaged file's structure when it opens it; this saves that as a clean
 * new file and says whether there was anything to fix. Files too damaged to open get intake's "couldn't be opened".
 */
export function RepairWorkspace() {
  return <SingleFileTool Options={RepairOptions} />;
}

async function repair(doc: ReadyDocument): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, {});
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "repaired"),
    detail: `${plural(doc.info.pageCount, "page")}, saved as a clean file.`,
  };
}

function RepairOptions({ doc, run, working, buttonRef }: ToolProps) {
  return (
    <>
      <p
        className={`rounded-card border-2 px-4 py-3 ${doc.info.repaired ? "border-sticky-yellow bg-sticky-yellow/30" : "border-line bg-surface"}`}
      >
        {doc.info.repaired
          ? `${doc.name} was damaged. Plyleaf rebuilt its structure and found ${plural(doc.info.pageCount, "page")}. Save the repaired copy below.`
          : `Plyleaf found no damage in ${doc.name}'s structure. Saving a clean copy can still help an app that struggles with it.`}
      </p>
      <ActionBar
        status={working ? "Repairing…" : "The repaired copy is a new, clean PDF. Your original stays as it is."}
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={working}
          className={primaryButton}
          onClick={() => run(() => repair(doc))}
        >
          {working ? "Repairing…" : doc.info.repaired ? "Save repaired PDF" : "Save a clean copy"}
        </button>
      </ActionBar>
    </>
  );
}
