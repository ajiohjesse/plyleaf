import { useEffect, useId, useRef, useState } from "react";
import { canSaveAs, downloadFile, saveAs } from "~/download/download";
import { formatSize } from "~/intake/files";

interface Props {
  file: Blob;
  name: string;
  /** A line about what's in the file, e.g. "3 PDFs in one zip". */
  detail?: string;
  /** Goes back to the workspace, e.g. to change something and make the file again. */
  onStartOver?: () => void;
  startOverLabel?: string;
}

/**
 * The "done" screen: the result, a Download button that's always there and never asks for anything, and "Save as…"
 * where the browser can ask where to save.
 */
export function DownloadPanel({ file, name, detail, onStartOver, startOverLabel = "Start over" }: Props) {
  const headingId = useId();
  // Only rendered after the user has done something, so this runs in the browser.
  const [saveAsSupported] = useState(canSaveAs);
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The workspace this replaces had focus (the button that made the file), so bring focus and the view here.
  useEffect(() => headingRef.current?.focus(), []);

  async function chooseWhere() {
    setStatus("");
    try {
      if (await saveAs(file, name)) setStatus(`Saved ${name}.`);
    } catch {
      setStatus("That didn't save. Try Download instead.");
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-card border-2 border-sticky-mint bg-sticky-mint/30 px-5 py-6 text-center sm:px-8"
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="scroll-mt-24 font-display text-2xl font-extrabold focus:outline-none sm:text-3xl"
      >
        Done — your file is ready
      </h2>
      <p className="text-ink-muted">
        <span className="font-semibold break-all text-ink">{name}</span> · {formatSize(file.size)}
      </p>
      {detail && <p className="-mt-2 text-ink-muted">{detail}</p>}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          className="btn-pill bg-primary text-on-primary hover:bg-primary-hover"
          onClick={() => downloadFile(file, name)}
        >
          Download
        </button>
        {saveAsSupported && (
          <button
            type="button"
            className="btn-pill border-2 border-primary bg-surface text-primary hover:bg-sticky-lavender/30"
            onClick={() => void chooseWhere()}
          >
            Save as…
          </button>
        )}
        {onStartOver && (
          <button
            type="button"
            className="btn-pill text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            onClick={onStartOver}
          >
            {startOverLabel}
          </button>
        )}
      </div>
      {/* An <output> is a status live region, so screen readers hear "Saved". */}
      <output className="block min-h-6 text-sm text-ink-muted">{status}</output>
    </section>
  );
}
