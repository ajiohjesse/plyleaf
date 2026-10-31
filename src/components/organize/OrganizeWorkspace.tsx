import { useCallback, useEffect, useId, useRef, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { operationFailureMessage } from "~/intake/files";
import type { ReadyDocument } from "~/intake/intake";
import {
  boardFrom,
  keysBetween,
  isReordered,
  keysInRanges,
  movePage,
  moveToEdge,
  originalOrder,
  removePages,
  reversePages,
  rotatePages,
  toSpecs,
  type Board,
  type BoardPage,
} from "~/organize/board";
import { parseRanges } from "~/organize/ranges";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import {
  ActionBar,
  FailureAlert,
  FileCard,
  IconButton,
  plural,
  primaryButton,
  type Result,
} from "~/components/workspace/parts";
import { PageBoard } from "./PageBoard";

export type OrganizeTool = "extract" | "delete" | "rotate" | "reorder";

/** What a tool's own toolbar and per-page buttons get to work with. */
interface ToolContext {
  board: Board;
  selected: ReadonlySet<string>;
  /**
   * Changes the board, from the latest one (two quick changes both count), and the selection if `select` is given,
   * and tells screen readers what happened.
   */
  change: (
    next: (board: Board, selected: ReadonlySet<string>) => Board,
    message: string,
    select?: (board: Board) => ReadonlySet<string>,
  ) => void;
}

interface ToolSpec {
  /** The primary button, given how many pages are selected. */
  action: (selected: number) => string;
  making: string;
  /** Added to the file name: "report-extracted.pdf". */
  suffix: string;
  /** What the action bar says, given how many pages are selected of how many. */
  status: (selected: number, total: number, board: Board) => string;
  /** What selecting a page means, which sets how selected pages look. */
  tone: "keep" | "remove";
  /** Builds the output's pages from the board and selection; null while there's nothing to make. */
  build: (board: Board, selected: ReadonlySet<string>) => Board | null;
  /** Buttons under the select bar that act on the selection (or every page). */
  toolbar?: (context: ToolContext) => React.ReactNode;
  /** Buttons under each page. */
  controls?: (page: BoardPage, index: number, context: ToolContext) => React.ReactNode;
  /** Pages can be dragged into a new order. */
  sortable?: boolean;
}

/** A smaller, outlined pill for secondary actions. */
const smallButton =
  "btn-pill min-h-10 gap-1.5 border-2 border-line bg-surface px-4 text-sm hover:border-primary disabled:cursor-default disabled:opacity-50 disabled:hover:border-line";

/** The selected pages, or every page when none are. */
const targets = (board: Board, selected: ReadonlySet<string>) =>
  selected.size > 0 ? selected : new Set(board.map((page) => page.key));

const turned = (board: Board) => board.filter((page) => page.rotate !== 0).length;

const reorder: ToolSpec = {
  action: () => "Reorder PDF",
  making: "Reordering…",
  suffix: "reordered",
  status: (_selected, _total, board) =>
    isReordered(board)
      ? "Pages in a new order"
      : "Drag pages by their handles, or select pages and move them together.",
  tone: "keep",
  build: (board) => (isReordered(board) ? board : null),
  sortable: true,
  toolbar: (context) => {
    const count = context.selected.size;
    const which = plural(count, "selected page");
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={smallButton}
          disabled={count === 0}
          onClick={() =>
            context.change((board, selected) => moveToEdge(board, selected, "start"), `Moved ${which} to the start.`)
          }
        >
          Move to start
        </button>
        <button
          type="button"
          className={smallButton}
          disabled={count === 0}
          onClick={() =>
            context.change((board, selected) => moveToEdge(board, selected, "end"), `Moved ${which} to the end.`)
          }
        >
          Move to end
        </button>
        <button
          type="button"
          className={smallButton}
          onClick={() => context.change(reversePages, "The pages are in reverse order.")}
        >
          Reverse order
        </button>
        <button
          type="button"
          className={smallButton}
          disabled={!isReordered(context.board)}
          onClick={() => context.change(originalOrder, "The pages are back in their original order.")}
        >
          Reset
        </button>
      </div>
    );
  },
};

const TOOLS: Record<OrganizeTool, ToolSpec> = {
  extract: {
    action: (n) => (n > 0 ? `Extract ${plural(n, "page")}` : "Extract pages"),
    making: "Extracting…",
    suffix: "extracted",
    status: (n, total) => (n === 0 ? "Select the pages to keep." : `${n} of ${plural(total, "page")} selected`),
    tone: "keep",
    build: (board, selected) => (selected.size > 0 ? board.filter((page) => selected.has(page.key)) : null),
  },
  delete: {
    action: (n) => (n > 0 ? `Delete ${plural(n, "page")}` : "Delete pages"),
    making: "Deleting…",
    suffix: "edited",
    status: (n, total) =>
      n === 0
        ? "Select the pages to delete."
        : n === total
          ? "Keep at least one page."
          : `${plural(n, "page")} to delete · ${plural(total - n, "page")} left`,
    tone: "remove",
    build: (board, selected) =>
      selected.size > 0 && selected.size < board.length ? removePages(board, selected) : null,
  },
  rotate: {
    action: () => "Rotate PDF",
    making: "Rotating…",
    suffix: "rotated",
    status: (_selected, _total, board) =>
      turned(board) === 0
        ? "Turn pages with their arrows, or select pages and turn them together."
        : `${plural(turned(board), "page")} turned`,
    tone: "keep",
    build: (board) => (turned(board) > 0 ? board : null),
    toolbar: (context) => {
      const which = context.selected.size > 0 ? plural(context.selected.size, "selected page") : "all pages";
      const turn = (by: -90 | 90) =>
        context.change(
          (board, selected) => rotatePages(board, targets(board, selected), by),
          `Turned ${which} ${by < 0 ? "left" : "right"}.`,
        );
      return (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="float-left mr-1 text-sm font-semibold">Turn {which}</legend>
          <button type="button" className={smallButton} onClick={() => turn(-90)}>
            <RotateIcon /> Left
          </button>
          <button type="button" className={smallButton} onClick={() => turn(90)}>
            <RotateIcon clockwise /> Right
          </button>
          <button
            type="button"
            className={smallButton}
            disabled={turned(context.board) === 0}
            onClick={() =>
              context.change(
                (board) => board.map((page) => (page.rotate === 0 ? page : { ...page, rotate: 0 })),
                "Every page is back the way it was.",
              )
            }
          >
            Reset
          </button>
        </fieldset>
      );
    },
    controls: (page, index, context) => {
      const turn = (by: -90 | 90) =>
        context.change(
          (board) => rotatePages(board, new Set([page.key]), by),
          `Page ${index + 1} turned ${by < 0 ? "left" : "right"}.`,
        );
      return (
        <>
          <IconButton label={`Turn page ${index + 1} left`} onClick={() => turn(-90)}>
            <RotateIcon />
          </IconButton>
          <IconButton label={`Turn page ${index + 1} right`} onClick={() => turn(90)}>
            <RotateIcon clockwise />
          </IconButton>
        </>
      );
    },
  },
  reorder,
};

function RotateIcon({ clockwise = false }: { clockwise?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={clockwise ? "size-5 -scale-x-100" : "size-5"}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5v5h5" />
      <path d="M4.6 10A8 8 0 1 1 6 16.5" />
    </svg>
  );
}

interface BoardState {
  /** The intake document this board was made from. */
  docKey: string;
  board: Board;
  selected: ReadonlySet<string>;
  /** The last page clicked, where a shift-click span starts. */
  anchor: string | null;
}

/**
 * The page-level Organize workspace: one PDF's pages on a board, selected by clicking (shift for a span) or by typing
 * ranges, and the tool's action on them. The board survives the done screen, so going back keeps the work.
 */
export function OrganizeWorkspace({ tool }: { tool: OrganizeTool }) {
  const spec = TOOLS[tool];
  const [state, intake] = useIntake({ multiple: false });
  const doc = state.documents[0];
  const ready = doc?.status === "ready" ? doc : null;
  const [boardState, setBoardState] = useState<BoardState | null>(null);
  // A new file gets a fresh board (set while rendering, so it never shows the old file's pages).
  if (ready && boardState?.docKey !== ready.key) {
    setBoardState({ docKey: ready.key, board: boardFrom(ready.info), selected: new Set(), anchor: null });
  }
  const current = ready && boardState?.docKey === ready.key ? boardState : null;
  const [making, setMaking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) actionRef.current?.focus();
  }, [returning]);

  // What the last change did, for screen readers.
  const [announcement, setAnnouncement] = useState("");
  const update = useCallback((change: (state: BoardState) => Partial<BoardState>) => {
    setBoardState((previous) => (previous ? { ...previous, ...change(previous) } : previous));
  }, []);

  const toggle = useCallback(
    (key: string, span: boolean) =>
      update(({ board, selected, anchor }) => {
        const next = new Set(selected);
        if (span && anchor) {
          for (const k of keysBetween(board, anchor, key)) next.add(k);
        } else if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return { selected: next, anchor: key };
      }),
    [update],
  );

  async function make(document: ReadyDocument, pages: Board) {
    setMaking(true);
    setResult(null);
    setReturning(false);
    try {
      const bytes = await engine.assemble(toSpecs(pages, document.info.id));
      setResult({ file: new Blob([bytes], { type: "application/pdf" }), name: outputName(document.name, spec.suffix) });
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
          startOverLabel="Back to your file"
        />
      </div>
    );
  }

  const output = current ? spec.build(current.board, current.selected) : null;
  const context: ToolContext | null = current && {
    board: current.board,
    selected: current.selected,
    change: (next, message, select) => {
      update((previous) => {
        const board = next(previous.board, previous.selected);
        // Selected pages that are gone stop being selected.
        const keys = new Set(board.map((page) => page.key));
        const selected = select ? select(board) : previous.selected;
        return { board, selected: new Set([...selected].filter((key) => keys.has(key))) };
      });
      setAnnouncement(message);
    },
  };
  return (
    <div className="space-y-4" data-files={doc ? true : undefined} data-busy={state.busy || making || undefined}>
      {doc && <FileCard doc={doc} onRemove={() => void intake.remove(doc.key)} />}
      <IntakeNotices state={state} intake={intake} />
      {result && "error" in result && <FailureAlert message={result.error} />}
      {ready && current && context && (
        <>
          <SelectBar
            board={current.board}
            selected={current.selected}
            onSelect={(selected) => update(() => ({ selected, anchor: null }))}
          >
            {spec.toolbar?.(context)}
          </SelectBar>
          <PageBoard
            board={current.board}
            docId={ready.info.id}
            label={`Pages of ${ready.name}`}
            selected={current.selected}
            tone={spec.tone}
            onToggle={toggle}
            {...(spec.controls && { controls: (page, index) => spec.controls!(page, index, context) })}
            {...(spec.sortable && {
              // dnd-kit announces the drop itself.
              onMove: (key: string, index: number) => context.change((board) => movePage(board, key, index), ""),
            })}
          />
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          <ActionBar
            status={making ? spec.making : spec.status(current.selected.size, current.board.length, current.board)}
          >
            <button
              type="button"
              ref={actionRef}
              disabled={!output || making}
              className={primaryButton}
              onClick={() => output && void make(ready, output)}
            >
              {making ? spec.making : spec.action(current.selected.size)}
            </button>
          </ActionBar>
        </>
      )}
      {/* Stays mounted with a file open, so a file dropped anywhere swaps in rather than opening in the browser. */}
      <FileDrop onFiles={(files) => void intake.add(files)} multiple={false} compact={doc !== undefined} />
    </div>
  );
}

/** Select all, none, or the pages typed as ranges; then any buttons the tool has for the selection. */
function SelectBar({
  board,
  selected,
  onSelect,
  children,
}: {
  board: Board;
  selected: ReadonlySet<string>;
  onSelect: (selected: ReadonlySet<string>) => void;
  children?: React.ReactNode;
}) {
  const inputId = useId();
  const errorId = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const all = selected.size === board.length;

  function selectTyped(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseRanges(text, board.length);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
    onSelect(keysInRanges(board, parsed.ranges));
  }

  const small = smallButton;
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-card border border-line bg-surface p-3 sm:p-4">
      <form className="flex min-w-0 flex-1 basis-60 flex-col" onSubmit={selectTyped}>
        <label htmlFor={inputId} className="text-sm font-semibold">
          Select pages
        </label>
        <span className="mt-1 flex gap-2">
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. 1-3, 7"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="min-w-0 flex-1 rounded-lg border-2 border-line bg-surface px-3 py-1.5 text-base focus:border-primary focus:outline-none aria-invalid:border-sticky-coral"
          />
          <button type="submit" className={small}>
            Select
          </button>
        </span>
        {error && (
          <span id={errorId} className="mt-1 text-sm font-semibold">
            {error}
          </span>
        )}
      </form>
      <span className="flex gap-2">
        <button
          type="button"
          className={small}
          onClick={() => onSelect(new Set(board.map((page) => page.key)))}
          disabled={all}
        >
          Select all
        </button>
        <button type="button" className={small} onClick={() => onSelect(new Set())} disabled={selected.size === 0}>
          Clear
        </button>
      </span>
      <p className="w-full text-sm text-ink-muted">
        Tap or click pages to select them. Shift-click selects a run of pages.
      </p>
      {children && <div className="w-full border-t border-line pt-3">{children}</div>}
    </div>
  );
}
