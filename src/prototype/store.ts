// A stand-in for the working document (D-045): the real one keeps PDF versions on the device; this keeps their names.
import { useSyncExternalStore } from "react";

export interface Step {
  id: string;
  tool: string;
  label: string;
  size: number;
}

export interface WorkingDoc {
  name: string;
  pages: number;
  steps: Step[];
  /** How many steps are applied; the rest were undone and can be redone. */
  at: number;
}

const KEY = "plyleaf-prototype-doc";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: WorkingDoc | null } = { raw: null, value: null };

function read(): WorkingDoc | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    // Storage blocked: the prototype just starts empty.
  }
  if (raw !== cache.raw) cache = { raw, value: raw ? (JSON.parse(raw) as WorkingDoc) : null };
  return cache.value;
}

function write(doc: WorkingDoc | null) {
  try {
    if (doc) sessionStorage.setItem(KEY, JSON.stringify(doc));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Ignored, as above.
  }
  listeners.forEach((listener) => listener());
}

export const sampleDoc = (): WorkingDoc => ({
  name: "lease-agreement.pdf",
  pages: 6,
  at: 1,
  steps: [{ id: "original", tool: "original", label: "Original", size: 4_820_000 }],
});

export const workingDoc = {
  get: read,
  open(name = "lease-agreement.pdf") {
    write({ ...sampleDoc(), name });
  },
  close() {
    write(null);
  },
  apply(tool: string, label: string, size: number) {
    const doc = read();
    if (!doc) return;
    const steps = [...doc.steps.slice(0, doc.at), { id: `${tool}-${Date.now()}`, tool, label, size }];
    write({ ...doc, steps, at: steps.length });
  },
  goTo(at: number) {
    const doc = read();
    if (doc) write({ ...doc, at: Math.max(1, Math.min(at, doc.steps.length)) });
  },
  restore(doc: WorkingDoc) {
    write(doc);
  },
};

export function useWorkingDoc() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      const onStorage = () => onChange();
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => null,
  );
}

export const formatSize = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
