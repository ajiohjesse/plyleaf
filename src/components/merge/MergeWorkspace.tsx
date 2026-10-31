import { useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { engine } from "~/engine/client";
import type { PageInfo } from "~/engine/types";
import { outputName } from "~/download/download";
import { formatSize, operationFailureMessage } from "~/intake/files";
import type { Intake, IntakeDocument } from "~/intake/intake";
import { thumbnails } from "~/thumbnails/thumbnails";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { CloseIcon, IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import { PageCanvas } from "~/components/thumbnails/PageCanvas";

type Result = { file: Blob; name: string } | { error: string };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * The Merge PDF workspace: add PDFs, put them in order (drag, or the move buttons), merge every page of each into one
 * file, then download it. The files stay open, so going back to change the order and merging again is instant.
 */
export function MergeWorkspace() {
  const [state, intake] = useIntake();
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
      <FileDrop onFiles={(files) => void intake.add(files)} compact={hasFiles} />
      <IntakeNotices state={state} intake={intake} />
      {result && "error" in result && (
        <p role="alert" className="rounded-card border-2 border-sticky-coral bg-sticky-pink/40 px-4 py-3">
          {result.error}
        </p>
      )}
      {hasFiles && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 shadow-sticky">
          <p className="text-sm text-ink-muted">
            {state.busy
              ? "Opening your files…"
              : ready.length < 2
                ? "Add at least one more PDF to merge."
                : `${plural(ready.length, "file")} · ${plural(pageCount, "page")}, in this order`}
          </p>
          <button
            type="button"
            ref={mergeRef}
            disabled={!canMerge}
            className="btn-pill bg-primary text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void merge()}
          >
            {making ? "Merging…" : "Merge PDFs"}
          </button>
        </div>
      )}
    </div>
  );
}

/** The files in the order they'll be merged, each with its first page, a drag handle and move/remove buttons. */
function FileOrder({ documents, intake }: { documents: readonly IntakeDocument[]; intake: Intake }) {
  // What the move buttons did, for screen readers (dragging has its own announcements).
  const [moved, setMoved] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const count = documents.length;
  const position = (id: UniqueIdentifier) => documents.findIndex((doc) => doc.key === id) + 1;
  const name = (id: UniqueIdentifier) => documents.find((doc) => doc.key === id)?.name ?? "The file";
  // dnd-kit reports the picked-up file as over its own place straight after "picked up"; saying that too would
  // replace the more useful message.
  const justPickedUp = useRef(false);
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      justPickedUp.current = true;
      return `Picked up ${name(active.id)}, file ${position(active.id)} of ${count}.`;
    },
    onDragOver: ({ active, over }) => {
      const first = justPickedUp.current;
      justPickedUp.current = false;
      if (first && over?.id === active.id) return undefined;
      return over
        ? `${name(active.id)} is over position ${position(over.id)} of ${count}.`
        : `${name(active.id)} is outside the list.`;
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `${name(active.id)} dropped at position ${position(over.id)} of ${count}.`
        : `${name(active.id)} put back.`,
    onDragCancel: ({ active }) =>
      `Moving ${name(active.id)} was cancelled. It stays at position ${position(active.id)}.`,
  };

  function moveTo(doc: IntakeDocument, index: number) {
    if (index < 0 || index >= count) return;
    intake.move(doc.key, index);
    setMoved(`${doc.name} is now file ${index + 1} of ${count}.`);
  }

  function dropped({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) intake.move(String(active.id), position(over.id) - 1);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={dropped}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a file, press space or enter to pick it up, use the up and down arrow keys to move it, then press space or enter to drop it. Press escape to cancel.",
        },
      }}
    >
      <SortableContext items={documents.map((doc) => doc.key)} strategy={verticalListSortingStrategy}>
        <ol className="space-y-2" aria-label="Your files">
          {documents.map((doc, index) => (
            <FileRow
              key={doc.key}
              doc={doc}
              index={index}
              count={count}
              onMove={(to) => moveTo(doc, to)}
              onRemove={() => void intake.remove(doc.key)}
            />
          ))}
        </ol>
      </SortableContext>
      <p aria-live="polite" className="sr-only">
        {moved}
      </p>
    </DndContext>
  );
}

interface FileRowProps {
  doc: IntakeDocument;
  index: number;
  count: number;
  onMove: (index: number) => void;
  onRemove: () => void;
}

function FileRow({ doc, index, count, onMove, onRemove }: FileRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: doc.key,
  });
  const docId = doc.status === "ready" ? doc.info.id : null;
  // Its first page's image is no use once the file is removed (and the id may be reissued).
  useEffect(() => (docId ? () => thumbnails.forget(docId) : undefined), [docId]);

  return (
    <li
      ref={setNodeRef}
      data-status={doc.status}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={[
        "relative flex items-center gap-2 rounded-card border bg-surface py-2 pr-2 pl-1 sm:gap-3 sm:pr-3",
        isDragging ? "z-20 border-primary shadow-sticky" : "border-line",
      ].join(" ")}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${doc.name}`}
        className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-muted hover:bg-ink/10 hover:text-ink active:cursor-grabbing"
      >
        <GripIcon />
      </button>
      <span className="relative shrink-0">
        <FirstPage doc={doc} />
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full bg-ink text-[0.7rem] font-bold text-surface"
        >
          {index + 1}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{doc.name}</span>
        <span className="block text-sm text-ink-muted">
          {doc.status === "opening" ? "Opening…" : `${plural(doc.info.pageCount, "page")} · ${formatSize(doc.size)}`}
        </span>
      </span>
      <span className="flex shrink-0">
        <IconButton label={`Move ${doc.name} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
          <ChevronIcon up />
        </IconButton>
        <IconButton label={`Move ${doc.name} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
          <ChevronIcon />
        </IconButton>
        <IconButton label={`Remove ${doc.name}`} onClick={onRemove}>
          <CloseIcon />
        </IconButton>
      </span>
    </li>
  );
}

/** Thumbnails fit in a box this big, in CSS pixels. */
const THUMB = { width: 40, height: 52 };

function FirstPage({ doc }: { doc: IntakeDocument }) {
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

function fit(page: PageInfo) {
  const scale = Math.min(THUMB.width / page.width, THUMB.height / page.height);
  return { width: Math.max(1, Math.round(page.width * scale)), height: Math.max(1, Math.round(page.height * scale)) };
}

/**
 * A small round icon button. At the ends of the list a move button is aria-disabled rather than disabled, so it keeps
 * keyboard focus after moving a file to the top or bottom.
 */
function IconButton({
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
      className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-ink/10 hover:text-ink aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:bg-transparent sm:size-10"
    >
      {children}
    </button>
  );
}

function ChevronIcon({ up = false }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
      {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} />))}
    </svg>
  );
}
