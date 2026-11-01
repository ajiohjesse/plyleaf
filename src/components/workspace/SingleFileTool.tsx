import { useEffect, useRef, useState } from "react";
import { operationFailureMessage, type IntakeOptions } from "~/intake/files";
import type { ReadyDocument } from "~/intake/intake";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import { FailureAlert, FileCard, type Result } from "./parts";

/** What a tool's action comes to: a file, a failure, or something to tell the user instead of a file. */
export type Outcome = Result | { info: string };

/** What a tool's options get from the shell. */
export interface ToolProps {
  doc: ReadyDocument;
  /** Runs the tool's action, then shows the file it made (or why there isn't one). */
  run: (action: () => Promise<Outcome>) => void;
  working: boolean;
  /** For the button that runs the action: focus comes back to it from the done screen. */
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

interface Props {
  intake?: IntakeOptions;
  /** The tool's options and action bar for the open file. Keyed by the file, so a new file starts afresh. */
  Options: React.ComponentType<ToolProps>;
}

/**
 * The shell of a one-file tool (the Optimize & secure tools): file intake, the open file's card, the tool's options,
 * and the done screen. "Back to your file" keeps the file open and the options as they were.
 */
export function SingleFileTool({ intake: options, Options }: Props) {
  const [state, intake] = useIntake({ ...options, multiple: false });
  const doc = state.documents[0];
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [working, setWorking] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) buttonRef.current?.focus();
  }, [returning]);
  // A new file clears what the last one came to.
  const key = doc?.key;
  const [shownFor, setShownFor] = useState(key);
  if (shownFor !== key) {
    setShownFor(key);
    setOutcome(null);
  }

  function run(action: () => Promise<Outcome>) {
    setWorking(true);
    setOutcome(null);
    setReturning(false);
    action()
      .then(setOutcome, (error: unknown) => setOutcome({ error: operationFailureMessage(error) }))
      .finally(() => setWorking(false));
  }

  if (outcome && "file" in outcome) {
    return (
      <div data-files>
        <DownloadPanel
          file={outcome.file}
          name={outcome.name}
          {...(outcome.detail && { detail: outcome.detail })}
          onStartOver={() => {
            setOutcome(null);
            setReturning(true);
          }}
          startOverLabel="Back to your file"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-files={doc ? true : undefined} data-busy={state.busy || working || undefined}>
      {doc && <FileCard doc={doc} onRemove={() => void intake.remove(doc.key)} />}
      <IntakeNotices state={state} intake={intake} />
      {outcome && "error" in outcome && <FailureAlert message={outcome.error} />}
      {outcome && "info" in outcome && (
        <output className="block rounded-card border-2 border-sticky-yellow bg-sticky-yellow/30 px-4 py-3">
          {outcome.info}
        </output>
      )}
      {doc?.status === "ready" && (
        <div key={doc.key} className="space-y-4">
          <Options doc={doc} run={run} working={working} buttonRef={buttonRef} />
        </div>
      )}
      {/* Stays mounted with a file open, so a file dropped anywhere swaps in rather than opening in the browser. */}
      <FileDrop onFiles={(files) => void intake.add(files)} multiple={false} compact={doc !== undefined} />
    </div>
  );
}
