import { useEffect, useRef, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { operationFailureMessage } from "~/intake/files";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import { FileOrder } from "~/components/workspace/FileOrder";
import { ActionBar, FailureAlert, plural, primaryButton, type Result } from "~/components/workspace/parts";

/**
 * The Merge PDF workspace: add PDFs and images, put them in order (drag, or the move buttons), merge every page of each
 * into one file, then download it. An image is a page its own size (scaled down to fit A4 or Letter if it's bigger). The files stay open, so going back to change the order and merging again is instant.
 */
const ACCEPT = ["pdf", "image"] as const;

export function MergeWorkspace() {
  const [state, intake] = useIntake({ accept: ACCEPT });
  const [making, setMaking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const ready = state.documents.filter((doc) => doc.status === "ready");
  const pageCount = ready.reduce((sum, doc) => sum + doc.info.pageCount, 0);
  const canMerge = ready.length >= 2 && !state.busy && !making;
  const mergeRef = useRef<HTMLButtonElement>(null);
  // Coming back from the done screen, focus returns to the button that made the file.
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) mergeRef.current?.focus();
  }, [returning]);

  async function merge() {
    setMaking(true);
    setResult(null);
    setReturning(false);
    try {
      const bytes = await engine.assemble(
        ready.flatMap((doc) => doc.info.pages.map((_, page) => ({ doc: doc.info.id, page }))),
      );
      setResult({ file: new Blob([bytes], { type: "application/pdf" }), name: outputName(ready[0]!.name, "merged") });
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
          startOverLabel="Back to your files"
        />
      </div>
    );
  }

  const hasFiles = state.documents.length > 0;
  return (
    <div className="space-y-4" data-files={hasFiles || undefined} data-busy={state.busy || making || undefined}>
      {hasFiles && <FileOrder documents={state.documents} intake={intake} />}
      <FileDrop onFiles={(files) => void intake.add(files)} accept={ACCEPT} compact={hasFiles} />
      <IntakeNotices state={state} intake={intake} />
      {result && "error" in result && <FailureAlert message={result.error} />}
      {hasFiles && (
        <ActionBar
          status={
            state.busy
              ? "Opening your files…"
              : ready.length < 2
                ? "Add at least one more file to merge."
                : `${plural(ready.length, "file")} · ${plural(pageCount, "page")}, in this order`
          }
        >
          <button
            type="button"
            ref={mergeRef}
            disabled={!canMerge}
            className={primaryButton}
            onClick={() => void merge()}
          >
            {making ? "Merging…" : "Merge PDFs"}
          </button>
        </ActionBar>
      )}
    </div>
  );
}
