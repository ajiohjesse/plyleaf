// The list of documents a workspace has open, fed by file intake. It checks each batch of files, opens the accepted
// ones in the engine one after another (so the list keeps the order they came in) and keeps a message for each file
// it couldn't take. Framework-free so it can be unit-tested with a fake engine; React reads it via useIntake.
import type { DocInfo } from "~/engine/types";
import { checkFiles, openFailureMessage, type IntakeOptions } from "./files";

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
}

export interface IntakeState {
  documents: readonly IntakeDocument[];
  /** Files from the latest batch that couldn't be added. Each new batch replaces them. */
  notices: readonly Notice[];
  /** A batch is being checked or opened. */
  busy: boolean;
}

/** The part of the engine intake needs. */
export interface IntakeEngine {
  open(file: Blob): Promise<DocInfo>;
  close(id: string): Promise<void>;
}

export interface Intake {
  getState(): IntakeState;
  subscribe(listener: () => void): () => void;
  /** Checks and opens a batch of files. Resolves when every accepted file is open or has failed. */
  add(files: readonly File[]): Promise<void>;
  /** Removes a document and closes it in the engine (once it has opened, if it's still opening). */
  remove(key: string): Promise<void>;
  dismiss(noticeId: number): void;
}

export function createIntake(engine: IntakeEngine, options: IntakeOptions = {}): Intake {
  let state: IntakeState = { documents: [], notices: [], busy: false };
  const listeners = new Set<() => void>();
  let nextKey = 1;
  let nextNotice = 1;
  let pendingBatches = 0;
  // Batches run one at a time, in the order they were added.
  let queue = Promise.resolve();

  function update(change: Partial<IntakeState>) {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  }

  const notice = (message: string): Notice => ({ id: nextNotice++, message });
  const isListed = (key: string) => state.documents.some((doc) => doc.key === key);

  async function runBatch(files: readonly File[]) {
    // A single-file tool replaces what it has rather than refusing the new file.
    const { accepted, rejected } = await checkFiles(files, options);
    const notices = rejected.map(notice);
    if (options.multiple === false && accepted.length > 0) {
      await Promise.all(state.documents.map((doc) => removeDocument(doc.key)));
    }
    const opening: OpeningDocument[] = accepted.map((file) => ({
      key: `f${nextKey++}`,
      name: file.name,
      size: file.size,
      status: "opening",
    }));
    update({ documents: [...state.documents, ...opening], notices });

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
        update({
          documents: state.documents.filter((doc) => doc.key !== key),
          notices: isListed(key) ? [...state.notices, notice(openFailureMessage(file.name, error))] : state.notices,
        });
      }
    }
  }

  async function removeDocument(key: string) {
    const doc = state.documents.find((d) => d.key === key);
    if (!doc) return;
    update({ documents: state.documents.filter((d) => d.key !== key) });
    if (doc.status === "ready") await engine.close(doc.info.id);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add(files) {
      pendingBatches++;
      update({ busy: true });
      queue = queue
        .then(() => runBatch(files))
        .catch(() => update({ notices: [...state.notices, notice("Something went wrong adding your files.")] }))
        .finally(() => {
          pendingBatches--;
          if (pendingBatches === 0) update({ busy: false });
        });
      return queue;
    },
    remove: removeDocument,
    dismiss(noticeId) {
      update({ notices: state.notices.filter((n) => n.id !== noticeId) });
    },
  };
}
