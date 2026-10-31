import type { IntakeOptions } from "~/intake/files";
import type { Intake, IntakeState } from "~/intake/intake";
import { FileDrop } from "./FileDrop";
import { useIntake } from "./useIntake";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Messages for files that couldn't be added. The live region is always there so screen readers announce them. */
export function IntakeNotices({ state, intake }: { state: IntakeState; intake: Intake }) {
  return (
    <div aria-live="assertive" className="empty:hidden">
      {state.notices.length > 0 && (
        <ul className="space-y-2" aria-label="Files that couldn't be added">
          {state.notices.map((notice) => (
            <li
              key={notice.id}
              className="flex items-start justify-between gap-3 rounded-card border-2 border-sticky-coral bg-sticky-pink/40 px-4 py-3"
            >
              <span>{notice.message}</span>
              <button
                type="button"
                onClick={() => intake.dismiss(notice.id)}
                className="-my-1 grid size-8 shrink-0 place-items-center rounded-full hover:bg-ink/10"
                aria-label="Dismiss"
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DocumentList({ state, intake }: { state: IntakeState; intake: Intake }) {
  if (state.documents.length === 0) return null;
  return (
    <ol className="space-y-2" aria-label="Your files">
      {state.documents.map((doc) => (
        <li
          key={doc.key}
          data-status={doc.status}
          className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-sticky"
        >
          <span
            aria-hidden="true"
            className="grid h-10 w-8 shrink-0 place-items-center rounded-md bg-sticky-yellow font-display text-[0.6rem] font-extrabold"
          >
            PDF
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{doc.name}</span>
            <span className="block text-sm text-ink-muted">
              {doc.status === "opening"
                ? "Opening…"
                : `${doc.info.pageCount} ${doc.info.pageCount === 1 ? "page" : "pages"} · ${formatSize(doc.size)}`}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void intake.remove(doc.key)}
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-ink/10 hover:text-ink"
            aria-label={`Remove ${doc.name}`}
          >
            <CloseIcon />
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * File intake on its own: the drop zone, then the files that opened and messages for those that didn't. Workspaces
 * build on the same pieces; for now this is what the intake harness shows.
 */
export function IntakePanel(options: IntakeOptions) {
  const [state, intake] = useIntake(options);
  const hasDocuments = state.documents.length > 0;
  return (
    <div className="space-y-4" data-busy={state.busy || undefined}>
      <DocumentList state={state} intake={intake} />
      <FileDrop
        onFiles={(files) => void intake.add(files)}
        compact={hasDocuments}
        {...(options.accept && { accept: options.accept })}
        {...(options.multiple !== undefined && { multiple: options.multiple })}
      />
      <IntakeNotices state={state} intake={intake} />
    </div>
  );
}
