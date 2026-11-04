// Signatures and initials saved on this device, in the browser's IndexedDB. They never leave the device: there's no
// account and nothing is sent anywhere (GOAL P2, P3). A browser that won't store them (some private windows) still
// lets the user sign; they just aren't kept.
import type { SignatureKind } from "./ink";

export interface SavedSignature {
  id: string;
  kind: SignatureKind;
  /** A PNG with a transparent background. */
  png: Uint8Array;
  /** Its size in pixels. */
  width: number;
  height: number;
  /** When it was made (ms since 1970), to list them in order. */
  created: number;
}

const DATABASE = "plyleaf";
const STORE = "signatures";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB isn't available"));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB wouldn't open"));
    request.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
  });
}

async function run<T>(mode: IDBTransactionMode, use: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = use(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB gave up"));
    });
  } finally {
    db.close();
  }
}

/** Every saved signature and initials, oldest first. */
export async function loadSignatures(): Promise<SavedSignature[]> {
  const all = await run<SavedSignature[]>("readonly", (store) => store.getAll() as IDBRequest<SavedSignature[]>);
  return all.sort((a, b) => a.created - b.created);
}

export async function saveSignature(signature: SavedSignature): Promise<void> {
  await run("readwrite", (store) => store.put(signature));
}

export async function deleteSignature(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
}
