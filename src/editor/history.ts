// Undo and redo for the editor: a list of past states, the present one and the states undone. Changes that belong to
// one gesture (typing into a text box, dragging something) share a `merge` key and become one step.

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** The merge key of the last change, while further changes with that key still join its step. */
  readonly open: string | null;
}

/** Steps kept to undo. Older ones are dropped. */
export const UNDO_LIMIT = 200;

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], open: null };
}

/**
 * `next` as the present. With the same `merge` key as the change before (and no settle() in between), it's part of
 * that change's step; otherwise it's a new step. Either way nothing is left to redo.
 */
export function change<T>(history: History<T>, next: T, merge: string | null = null): History<T> {
  if (next === history.present) return history;
  if (merge !== null && merge === history.open) return { ...history, present: next, future: [] };
  const past = [...history.past, history.present].slice(-UNDO_LIMIT);
  return { past, present: next, future: [], open: merge };
}

/** Ends the open step, so the next change is a step of its own even with the same merge key. */
export function settle<T>(history: History<T>): History<T> {
  return history.open === null ? history : { ...history, open: null };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    open: null,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future, open: null };
}

export const canUndo = (history: History<unknown>) => history.past.length > 0;
export const canRedo = (history: History<unknown>) => history.future.length > 0;
