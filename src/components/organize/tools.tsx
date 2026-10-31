// What each page-level Organize tool does on the shared board (D-023): its labels, status, output, and any toolbar or
// per-page buttons. OrganizeWorkspace runs whichever one a tool page names.
import {
  duplicatePages,
  insertBlanks,
  isReordered,
  moveToEdge,
  originalOrder,
  removePages,
  reversePages,
  rotatePages,
  type Board,
  type BoardPage,
} from "~/organize/board";
import { CloseIcon } from "~/components/intake/IntakePanel";
import { IconButton, plural } from "~/components/workspace/parts";

export type OrganizeTool = "extract" | "delete" | "rotate" | "reorder" | "insert" | "duplicate";

/** What a tool's own toolbar and per-page buttons get to work with. */
export interface ToolContext {
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

export interface ToolSpec {
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
export const smallButton =
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

const blanks = (board: Board) => board.filter((page) => page.source === null).length;

const insert: ToolSpec = {
  action: () => "Insert blank pages",
  making: "Inserting…",
  suffix: "with-blanks",
  status: (_selected, _total, board) =>
    blanks(board) === 0
      ? "Add a blank page with the + under any page, or select pages and add them before or after."
      : `${plural(blanks(board), "blank page")} added`,
  tone: "keep",
  build: (board) => (blanks(board) > 0 ? board : null),
  toolbar: (context) => {
    const count = context.selected.size;
    const add = (where: "before" | "after") =>
      context.change(
        (board, selected) => insertBlanks(board, selected, where).board,
        `Added ${plural(count, "blank page")} ${where} the selected pages.`,
      );
    return (
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="float-left mr-1 text-sm font-semibold">Add blank pages</legend>
        <button type="button" className={smallButton} disabled={count === 0} onClick={() => add("before")}>
          Before selected
        </button>
        <button type="button" className={smallButton} disabled={count === 0} onClick={() => add("after")}>
          After selected
        </button>
        <button
          type="button"
          className={smallButton}
          disabled={blanks(context.board) === 0}
          onClick={() =>
            context.change((board) => board.filter((page) => page.source !== null), "Removed every blank page.")
          }
        >
          Remove all blanks
        </button>
      </fieldset>
    );
  },
  controls: (page, index, context) =>
    page.source === null ? (
      <IconButton
        label={`Remove blank page ${index + 1}`}
        onClick={() =>
          context.change((board) => removePages(board, new Set([page.key])), `Removed blank page ${index + 1}.`)
        }
      >
        <CloseIcon />
      </IconButton>
    ) : (
      <IconButton
        label={`Add a blank page after page ${index + 1}`}
        onClick={() =>
          context.change(
            (board) => insertBlanks(board, new Set([page.key])).board,
            `Added a blank page after page ${index + 1}.`,
          )
        }
      >
        <PlusIcon />
      </IconButton>
    ),
};

/** Keys of the pages that repeat a page shown earlier on the board. */
function copyKeys(board: Board): Set<string> {
  const seen = new Set<number>();
  const copies = new Set<string>();
  for (const page of board) {
    if (page.source === null) continue;
    if (seen.has(page.source)) copies.add(page.key);
    seen.add(page.source);
  }
  return copies;
}

const duplicate: ToolSpec = {
  action: () => "Duplicate pages",
  making: "Duplicating…",
  suffix: "duplicated",
  status: (_selected, _total, board) => {
    const copies = copyKeys(board).size;
    return copies === 0
      ? "Copy a page with the button under it, or select pages and copy them all."
      : `${plural(copies, "copy", "copies")} added · ${plural(board.length, "page")}`;
  },
  tone: "keep",
  build: (board) => (copyKeys(board).size > 0 ? board : null),
  toolbar: (context) => {
    const count = context.selected.size;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={smallButton}
          disabled={count === 0}
          onClick={() =>
            context.change(
              (board, selected) => duplicatePages(board, selected).board,
              `Copied ${plural(count, "selected page")}. Each copy is right after its page.`,
            )
          }
        >
          Duplicate selected
        </button>
        <button
          type="button"
          className={smallButton}
          disabled={copyKeys(context.board).size === 0}
          onClick={() => context.change((board) => removePages(board, copyKeys(board)), "Removed every copy.")}
        >
          Remove all copies
        </button>
      </div>
    );
  },
  controls: (page, index, context) => {
    const isCopy = copyKeys(context.board).has(page.key);
    return (
      <>
        <IconButton
          label={`Duplicate page ${index + 1}`}
          onClick={() =>
            context.change(
              (board) => duplicatePages(board, new Set([page.key])).board,
              `Copied page ${index + 1}. The copy is page ${index + 2}.`,
            )
          }
        >
          <CopyIcon />
        </IconButton>
        {isCopy && (
          <IconButton
            label={`Remove page ${index + 1}, a copy`}
            onClick={() =>
              context.change(
                (board) => removePages(board, new Set([page.key])),
                `Removed the copy at page ${index + 1}.`,
              )
            }
          >
            <CloseIcon />
          </IconButton>
        )}
      </>
    );
  },
};

export const TOOLS: Record<OrganizeTool, ToolSpec> = {
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
  insert,
  duplicate,
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinejoin="round"
    >
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}
