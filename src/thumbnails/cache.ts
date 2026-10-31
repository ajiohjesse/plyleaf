// Page thumbnails for open documents. Requests queue up and go to the engine a couple at a time, in the order they
// were made; a request that's cancelled before it starts (its page scrolled away) never reaches the engine. Finished
// images are kept per (document, page, width) until the cache passes its byte budget, then the least recently used go.
// Framework-free so it can be unit-tested with a fake engine; the shared instance is in ./thumbnails.ts.
import type { Bitmap, DocId } from "~/engine/types";

export interface ThumbnailOptions<T> {
  render(doc: DocId, page: number, width: number): Promise<Bitmap>;
  /** Turns a rendered bitmap into what we keep and paint (an ImageBitmap in the browser). */
  toImage(bitmap: Bitmap): Promise<T>;
  /** Frees an image the cache dropped. */
  dispose?(image: T): void;
  /** Bytes of decoded pixels to keep. */
  budget?: number;
  /** Renders in flight at once. Two keeps the worker busy while the previous result crosses back. */
  concurrency?: number;
}

export interface ThumbnailCache<T> {
  /** A finished image, if there is one. Counts as a use. */
  peek(doc: DocId, page: number, width: number): T | undefined;
  /**
   * Asks for an image and calls back once it's ready (straight away if it's cached). Returns a cancel function:
   * call it when the image isn't wanted any more. Requests for the same image share one render.
   */
  request(
    doc: DocId,
    page: number,
    width: number,
    onReady: (image: T) => void,
    onError?: (error: unknown) => void,
  ): () => void;
  /**
   * Moves a queued render ahead of the others that haven't been prioritised (pages on screen before pages just off
   * it). Prioritised renders keep the order they were prioritised in.
   */
  prioritise(doc: DocId, page: number, width: number): void;
  /** Drops everything for a document: its images and its queued renders. Call it when the document closes. */
  forget(doc: DocId): void;
  stats(): { images: number; bytes: number; queued: number; rendering: number; rendered: number };
}

/** Enough for about a hundred 320 px-wide A4 thumbnails. */
export const DEFAULT_BUDGET = 64 * 1024 * 1024;

interface Entry<T> {
  image: T;
  bytes: number;
}

interface Job<T> {
  key: string;
  doc: DocId;
  page: number;
  width: number;
  waiters: Set<Waiter<T>>;
  urgent: boolean;
}

interface Waiter<T> {
  onReady: (image: T) => void;
  onError: ((error: unknown) => void) | undefined;
}

export function createThumbnailCache<T>(options: ThumbnailOptions<T>): ThumbnailCache<T> {
  const { render, toImage, dispose, budget = DEFAULT_BUDGET, concurrency = 2 } = options;
  // A Map iterates in insertion order, so re-inserting on use keeps the least recently used first.
  const images = new Map<string, Entry<T>>();
  let bytes = 0;
  const queue: Job<T>[] = [];
  /** Renders in flight that new requests can still join, by key. */
  const running = new Map<string, Job<T>>();
  let inFlight = 0;
  /** Bumped by forget(), so a render that finishes for a forgotten document is thrown away. */
  const generations = new Map<DocId, number>();
  let rendered = 0;

  const keyOf = (doc: DocId, page: number, width: number) => `${doc}:${page}:${width}`;

  function store(key: string, entry: Entry<T>) {
    images.set(key, entry);
    bytes += entry.bytes;
    for (const [oldKey, old] of images) {
      // Always keep the newest image, even if it alone is over budget.
      if (bytes <= budget || oldKey === key) break;
      drop(oldKey, old);
    }
  }

  function drop(key: string, entry: Entry<T>) {
    images.delete(key);
    bytes -= entry.bytes;
    dispose?.(entry.image);
  }

  function pump() {
    while (inFlight < concurrency && queue.length > 0) {
      const job = queue.shift()!;
      running.set(job.key, job);
      inFlight++;
      void run(job);
    }
  }

  async function run(job: Job<T>) {
    const generation = generations.get(job.doc) ?? 0;
    try {
      const bitmap = await render(job.doc, job.page, job.width);
      const image = await toImage(bitmap);
      rendered++;
      if ((generations.get(job.doc) ?? 0) !== generation) {
        dispose?.(image);
        return;
      }
      store(job.key, { image, bytes: bitmap.width * bitmap.height * 4 });
      for (const waiter of job.waiters) waiter.onReady(image);
    } catch (error) {
      if ((generations.get(job.doc) ?? 0) === generation) for (const waiter of job.waiters) waiter.onError?.(error);
    } finally {
      if (running.get(job.key) === job) running.delete(job.key);
      inFlight--;
      pump();
    }
  }

  function touch(key: string): T | undefined {
    const entry = images.get(key);
    if (!entry) return undefined;
    images.delete(key);
    images.set(key, entry);
    return entry.image;
  }

  return {
    peek: (doc, page, width) => touch(keyOf(doc, page, width)),

    request(doc, page, width, onReady, onError) {
      const key = keyOf(doc, page, width);
      const cached = touch(key);
      if (cached !== undefined) {
        onReady(cached);
        return () => {};
      }
      const waiter: Waiter<T> = { onReady, onError };
      let job = running.get(key) ?? queue.find((j) => j.key === key);
      if (!job) {
        job = { key, doc, page, width, waiters: new Set(), urgent: false };
        queue.push(job);
      }
      job.waiters.add(waiter);
      pump();
      const mine = job;
      return () => {
        mine.waiters.delete(waiter);
        // A render that has started runs to the end (the worker can't stop it) and its image is cached.
        if (mine.waiters.size === 0 && running.get(mine.key) !== mine) {
          const index = queue.indexOf(mine);
          if (index >= 0) queue.splice(index, 1);
        }
      };
    },

    prioritise(doc, page, width) {
      const index = queue.findIndex((job) => job.key === keyOf(doc, page, width));
      if (index < 0 || queue[index]!.urgent) return;
      const [job] = queue.splice(index, 1);
      job!.urgent = true;
      const firstPlain = queue.findIndex((j) => !j.urgent);
      queue.splice(firstPlain < 0 ? queue.length : firstPlain, 0, job!);
    },

    forget(doc) {
      generations.set(doc, (generations.get(doc) ?? 0) + 1);
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.doc === doc) queue.splice(i, 1);
      for (const [key, job] of running) if (job.doc === doc) running.delete(key);
      const prefix = `${doc}:`;
      for (const [key, entry] of images) if (key.startsWith(prefix)) drop(key, entry);
    },

    stats: () => ({ images: images.size, bytes, queued: queue.length, rendering: inFlight, rendered }),
  };
}

/**
 * The width to render a thumbnail shown `cssWidth` CSS pixels wide: in device pixels (up to 2×), rounded up to a
 * multiple of 32 so that small layout changes reuse the images already cached.
 */
export function renderWidth(cssWidth: number, devicePixelRatio = 1): number {
  const device = cssWidth * Math.min(Math.max(devicePixelRatio, 1), 2);
  return Math.max(32, Math.ceil(device / 32) * 32);
}
