// Pieces every tool workspace uses: the sticky action bar, a failure message, a small icon button and the open file's
// card with its first page.
import { useEffect } from "react";
import type { PageInfo } from "~/engine/types";
import { formatSize } from "~/intake/files";
import type { IntakeDocument } from "~/intake/intake";
import { thumbnails } from "~/thumbnails/thumbnails";
import { CloseIcon } from "~/components/intake/IntakePanel";
import { PageCanvas } from "~/components/thumbnails/PageCanvas";

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** A tool's result: the file to download, or why it couldn't be made. */
export type Result = { file: Blob; name: string; detail?: string } | { error: string };

/** Sticks to the bottom of the screen while the workspace is in view: what will happen, and the button that does it. */
export function ActionBar({ status, children }: { status: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 shadow-sticky">
      <p className="text-sm text-ink-muted">{status}</p>
      {children}
    </div>
  );
}

export const primaryButton =
  "btn-pill bg-primary text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60";

export function FailureAlert({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-card border-2 border-sticky-coral bg-sticky-pink/40 px-4 py-3">
      {message}
    </p>
  );
}

/**
 * A small round icon button. A disabled one is aria-disabled rather than disabled, so it keeps keyboard focus (after
 * moving something to the end of a list, say).
 */
export function IconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-ink/10 hover:text-ink aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:bg-transparent sm:size-10"
    >
      {children}
    </button>
  );
}

/** One option of a radio group, as a card: a title and a line about it. */
export function Choice({
  name,
  checked,
  onChange,
  title,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-lg border-2 border-line p-3 has-checked:border-primary has-checked:bg-sticky-lavender/20">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="row-span-2 mt-1 size-4 accent-primary"
      />
      <span className="font-semibold">{title}</span>
      <span className="text-sm text-ink-muted">{children}</span>
    </label>
  );
}

/** Thumbnails fit in a box this big, in CSS pixels. */
const THUMB = { width: 40, height: 52 };

function fit(page: PageInfo) {
  const scale = Math.min(THUMB.width / page.width, THUMB.height / page.height);
  return { width: Math.max(1, Math.round(page.width * scale)), height: Math.max(1, Math.round(page.height * scale)) };
}

/** A document's first page, small. Its image is dropped from the cache when the document goes. */
export function FirstPage({ doc }: { doc: IntakeDocument }) {
  const docId = doc.status === "ready" ? doc.info.id : null;
  // The image is no use once the file is removed (and the id may be reissued).
  useEffect(() => (docId ? () => thumbnails.forget(docId) : undefined), [docId]);
  if (doc.status !== "ready") {
    return <span className="block rounded-sm bg-surface-band ring-1 ring-line" style={THUMB} />;
  }
  const size = fit(doc.info.pages[0]!);
  return (
    <span className="grid place-items-center" style={THUMB}>
      <span
        className="relative block overflow-hidden rounded-sm bg-surface ring-1 ring-line"
        style={{ width: size.width, height: size.height }}
      >
        <PageCanvas docId={doc.info.id} index={0} width={size.width} onScreen />
      </span>
    </span>
  );
}

/** "12 pages · 1.2 MB", "Image · 1.2 MB", or "Opening…". */
export function docSummary(doc: IntakeDocument) {
  if (doc.status === "opening") return "Opening…";
  if (doc.status === "locked") return `Needs a password · ${formatSize(doc.size)}`;
  const { source, pageCount } = doc.info;
  const what =
    source === "image"
      ? pageCount === 1
        ? "Image"
        : `Image, ${plural(pageCount, "page")}`
      : plural(pageCount, "page");
  return `${what} · ${formatSize(doc.size)}`;
}

/** The file a single-file tool is working on, with a button to remove it (and pick another). */
export function FileCard({ doc, onRemove }: { doc: IntakeDocument; onRemove: () => void }) {
  return (
    <div
      data-status={doc.status}
      className="flex items-center gap-3 rounded-card border border-line bg-surface py-2 pr-2 pl-3 sm:pr-3"
    >
      <FirstPage doc={doc} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{doc.name}</span>
        <span className="block text-sm text-ink-muted">{docSummary(doc)}</span>
      </span>
      <IconButton label={`Remove ${doc.name}`} onClick={onRemove}>
        <CloseIcon />
      </IconButton>
    </div>
  );
}

/** Six dots: the handle that drags something into place. */
export function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
      {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} />))}
    </svg>
  );
}
