import { useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { FileDrop } from "~/components/intake/FileDrop";
import { DocumentList, IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import { operationFailureMessage, type IntakeOptions } from "~/intake/files";
import { DownloadPanel } from "./DownloadPanel";

type Result = { file: Blob; name: string } | { error: string };

/**
 * Intake, one button that puts every page of the open files into one PDF, and the download screen. It's what the
 * download harness shows: the whole path from a dropped file to a saved one, before the real tools (M2) exist.
 */
export function CombinePanel(options: IntakeOptions) {
  const [state, intake] = useIntake(options);
  const [making, setMaking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const ready = state.documents.filter((doc) => doc.status === "ready");

  async function combine() {
    setMaking(true);
    setResult(null);
    try {
      const bytes = await engine.assemble(
        ready.flatMap((doc) => doc.info.pages.map((_, page) => ({ doc: doc.info.id, page }))),
      );
      setResult({
        file: new Blob([bytes], { type: "application/pdf" }),
        name: outputName(ready[0]!.name, ready.length > 1 ? "combined" : "copy"),
      });
    } catch (error) {
      setResult({ error: operationFailureMessage(error) });
    } finally {
      setMaking(false);
    }
  }

  if (result && "file" in result) {
    return (
      <DownloadPanel
        file={result.file}
        name={result.name}
        onStartOver={() => setResult(null)}
        startOverLabel="Back to files"
      />
    );
  }

  return (
    <div className="space-y-4" data-busy={state.busy || undefined}>
      <DocumentList state={state} intake={intake} />
      <FileDrop onFiles={(files) => void intake.add(files)} compact={state.documents.length > 0} />
      <IntakeNotices state={state} intake={intake} />
      {result && "error" in result && (
        <p role="alert" className="rounded-card border-2 border-sticky-coral bg-sticky-pink/40 px-4 py-3">
          {result.error}
        </p>
      )}
      {ready.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={making || state.busy}
            className="btn-pill bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-60"
            onClick={() => void combine()}
          >
            {making ? "Making your PDF…" : "Combine into one PDF"}
          </button>
        </div>
      )}
    </div>
  );
}
