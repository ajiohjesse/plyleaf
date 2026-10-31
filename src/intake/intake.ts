// The list of documents a workspace has open, fed by file intake. It checks each batch of files, opens the accepted
// ones in the engine one after another (so the list keeps the order they came in) and keeps a message for each file
// it couldn't take. Framework-free so it can be unit-tested with a fake engine; React reads it via useIntake.
import type { EngineError } from "~/engine/errors";
import type { DocInfo } from "~/engine/types";
import { checkFiles, formatSize, largeInputBytes, openFailureMessage, resetMessage, type IntakeOptions } from "./files";

export interface OpeningDocument {
  key: string;
  name: string;
  size: number;
  status: "opening";
}

export interface ReadyDocument {
  key: string;
  name: string;
  size: number;
  status: "ready";
  info: DocInfo;
}

export type IntakeDocument = OpeningDocument | ReadyDocument;

export interface Notice {
  id: number;
  message: string;
  /** "error": a file wasn't added or was lost. "warning": it was added, but something may go wrong. */
  tone: "error" | "warning";
}

export interface IntakeState {
  documents: readonly IntakeDocument[];
  /** Files from the latest batch that couldn't be added, and warnings about it. Each new batch replaces them. */
  notices: readonly Notice[];
  /** A batch is being checked or opened. */
  busy: boolean;
}

/** The part of the engine intake needs. */
export interface IntakeEngine {
  open(file: Blob): Promise<DocInfo>;
  close(id: string): Promise<void>;
  /** Called when the engine restarted and lost every open document. */
  onReset?(listener: (error: EngineError) => void): () => void;
}

export interface Intake {
  getState(): IntakeState;
  /** While anything is subscribed, the intake also follows engine restarts (dropping the documents they lost). */
  subscribe(listener: () => void): () => void;
  /** Checks and opens a batch of files. Resolves when every accepted file is open or has failed. */
  add(files: readonly File[]): Promise<void>;
  /** Removes a document and closes it in the engine (once it has opened, if it's still opening). */
  remove(key: string): Promise<void>;
  /** Moves a document to `index` in the list (clamped to the list), e.g. to set the order files are merged in. */
  move(key: string, index: number): void;
  dismiss(noticeId: number): void;
}

export function createIntake(engine: IntakeEngine, options: IntakeOptions = {}): Intake {
  let state: IntakeState = { documents: [], notices: [], busy: false };
  const listeners = new Set<() => void>();
  let stopFollowingEngine: (() => void) | undefined;
  const warnAbove = options.largeInputBytes ?? largeInputBytes();
  /** The open files are over warnAbove and we've said so; reset once they drop below it. */
  let warnedLarge = false;
  let largeWarningId = 0;
  let nextKey = 1;
  let nextNotice = 1;
  let pendingBatches = 0;
  // Batches run one at a time, in the order they were added.
  let queue = Promise.resolve();

  function update(change: Partial<IntakeState>) {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  }

  const notice = (message: string, tone: Notice["tone"] = "error"): Notice => ({ id: nextNotice++, message, tone });
  /** Adds a notice unless the same message is already showing (every file failing for one reason says it once). */
  const withNotice = (notices: readonly Notice[], message: string, tone?: Notice["tone"]) =>
    notices.some((n) => n.message === message) ? notices : [...notices, notice(message, tone)];
  const isListed = (key: string) => state.documents.some((doc) => doc.key === key);

  /**
   * Sets the documents, adding the large-input warning to `notices` when they first go over the limit and taking it
   * away once they're back under it (a file that failed to open no longer counts, say).
   */
  function setDocuments(documents: readonly IntakeDocument[], notices = state.notices) {
    const total = documents.reduce((sum, doc) => sum + doc.size, 0);
    if (total <= warnAbove) {
      warnedLarge = false;
      notices = notices.filter((n) => n.id !== largeWarningId);
    } else if (!warnedLarge) {
      warnedLarge = true;
      const warning = notice(
        `Together your files are ${formatSize(total)}. That's a lot for a browser to hold in memory, so this may be ` +
          "slow, and if it runs out, try fewer files at a time.",
        "warning",
      );
      largeWarningId = warning.id;
      notices = [...notices, warning];
    }
    update({ documents, notices });
  }

  /** The engine restarted: the documents it held are gone. Ones still opening will fail and say so themselves. */
  function onEngineReset(error: EngineError) {
    if (!state.documents.some((doc) => doc.status === "ready")) return;
    setDocuments(
      state.documents.filter((doc) => doc.status !== "ready"),
      withNotice(state.notices, resetMessage(error)),
    );
  }

  async function runBatch(files: readonly File[]) {
    // A single-file tool replaces what it has rather than refusing the new file.
    const { accepted, rejected } = await checkFiles(files, options);
    const notices = rejected.map((message) => notice(message));
    if (options.multiple === false && accepted.length > 0) {
      await Promise.all(state.documents.map((doc) => removeDocument(doc.key)));
    }
    const opening: OpeningDocument[] = accepted.map((file) => ({
      key: `f${nextKey++}`,
      name: file.name,
      size: file.size,
      status: "opening",
    }));
    setDocuments([...state.documents, ...opening], notices);

    for (const [i, file] of accepted.entries()) {
      const { key } = opening[i]!;
      try {
        const info = await engine.open(file);
        if (!isListed(key)) {
          // Removed while it was opening.
          await engine.close(info.id);
          continue;
        }
        update({
          documents: state.documents.map((doc) => (doc.key === key ? { ...doc, status: "ready", info } : doc)),
        });
      } catch (error) {
        setDocuments(
          state.documents.filter((doc) => doc.key !== key),
          isListed(key) ? withNotice(state.notices, openFailureMessage(file.name, error)) : state.notices,
        );
      }
    }
  }

  async function removeDocument(key: string) {
    const doc = state.documents.find((d) => d.key === key);
    if (!doc) return;
    setDocuments(state.documents.filter((d) => d.key !== key));
    if (doc.status === "ready") await engine.close(doc.info.id);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      stopFollowingEngine ??= engine.onReset?.(onEngineReset);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopFollowingEngine?.();
          stopFollowingEngine = undefined;
        }
      };
    },
    add(files) {
      pendingBatches++;
      update({ busy: true });
      queue = queue
        .then(() => runBatch(files))
        .catch(() => update({ notices: withNotice(state.notices, "Something went wrong adding your files.") }))
        .finally(() => {
          pendingBatches--;
          if (pendingBatches === 0) update({ busy: false });
        });
      return queue;
    },
    remove: removeDocument,
    move(key, index) {
      const from = state.documents.findIndex((doc) => doc.key === key);
      const to = Math.max(0, Math.min(state.documents.length - 1, Math.trunc(index)));
      if (from === -1 || from === to) return;
      const documents = [...state.documents];
      documents.splice(to, 0, ...documents.splice(from, 1));
      update({ documents });
    },
    dismiss(noticeId) {
      update({ notices: state.notices.filter((n) => n.id !== noticeId) });
    },
  };
}
