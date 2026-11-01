import { useEffect, useRef, useState } from "react";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import { PasswordPrompt } from "~/components/secure/PasswordPrompt";
import { FileCard } from "~/components/workspace/parts";
import { Editor } from "./Editor";
import type { Tool } from "./EditorPage";

/**
 * The editor's workspace (Edit PDF, Annotate PDF): one PDF in, the editor, and the done screen. The editor stays mounted (hidden) behind the done
 * screen, so "Back to editing" returns to everything as it was, undo history and all.
 */
export function EditorWorkspace({ tool, suffix }: { tool?: Tool; suffix?: string }) {
  const [state, intake] = useIntake({ passwords: true, multiple: false });
  const doc = state.documents[0];
  const [saved, setSaved] = useState<{ key: string; file: Blob; name: string } | null>(null);
  const shownSaved = saved && saved.key === doc?.key ? saved : null;
  const editorRef = useRef<HTMLDivElement>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) editorRef.current?.querySelector<HTMLElement>("[role=toolbar] button")?.focus();
  }, [returning]);

  return (
    <div className="space-y-4" data-files={doc ? true : undefined} data-busy={state.busy || undefined}>
      {shownSaved && (
        <DownloadPanel
          file={shownSaved.file}
          name={shownSaved.name}
          onStartOver={() => {
            setSaved(null);
            setReturning(true);
          }}
          startOverLabel="Back to editing"
        />
      )}
      <div ref={editorRef} hidden={shownSaved !== null} className="space-y-4">
        {doc && <FileCard doc={doc} onRemove={() => void intake.remove(doc.key)} />}
        <IntakeNotices state={state} intake={intake} />
        {doc?.status === "locked" && (
          <PasswordPrompt doc={doc} onUnlock={(password) => void intake.unlock(doc.key, password)} />
        )}
        {doc?.status === "ready" && (
          <Editor
            key={doc.key}
            doc={doc}
            {...(tool && { initialTool: tool })}
            {...(suffix && { suffix })}
            onSaved={(file, name) => {
              setReturning(false);
              setSaved({ key: doc.key, file, name });
            }}
          />
        )}
        {/* Stays mounted with a file open, so a file dropped anywhere swaps in rather than opening in the browser. */}
        <FileDrop onFiles={(files) => void intake.add(files)} multiple={false} compact={doc !== undefined} />
      </div>
    </div>
  );
}
