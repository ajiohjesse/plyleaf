import { expect, test } from "vitest";
import type { Bitmap } from "~/engine/types";
import { createThumbnailCache, renderWidth } from "~/thumbnails/cache";

interface Image {
  key: string;
  bytes: number;
}

/** A fake engine whose renders finish only when the test says so. Renders are `width` × `width` pixels. */
function fakeRender() {
  const pending: { key: string; finish: () => void; fail: (error: unknown) => void }[] = [];
  const started: string[] = [];
  const render = (doc: string, page: number, width: number) =>
    new Promise<Bitmap>((resolve, reject) => {
      const key = `${doc}:${page}:${width}`;
      started.push(key);
      pending.push({
        key,
        finish: () => resolve({ width, height: width, pixels: new Uint8ClampedArray(0) }),
        fail: reject,
      });
    });
  /** Finishes the oldest render in flight (or the one for `key`), then lets the cache react. */
  async function finish(key?: string) {
    const index = key ? pending.findIndex((p) => p.key === key) : 0;
    expect(index).toBeGreaterThanOrEqual(0);
    pending.splice(index, 1)[0]!.finish();
    await settle();
  }
  return { render, pending, started, finish };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

function setup(budget?: number) {
  const fake = fakeRender();
  const disposed: string[] = [];
  const cache = createThumbnailCache<Image>({
    render: fake.render,
    toImage: async (bitmap: Bitmap) => ({
      key: `${bitmap.width}`,
      bytes: bitmap.width * bitmap.height * 4,
    }),
    dispose: (image) => disposed.push(image.key),
    ...(budget !== undefined && { budget }),
  });
  return { cache, fake, disposed };
}

test("renders two at a time, in request order, and caches the result", async () => {
  const { cache, fake } = setup();
  const ready: string[] = [];
  for (const page of [0, 1, 2]) cache.request("d1", page, 64, () => ready.push(`page ${page}`));

  expect(fake.started).toEqual(["d1:0:64", "d1:1:64"]);
  expect(cache.stats()).toMatchObject({ queued: 1, rendering: 2 });

  await fake.finish();
  expect(ready).toEqual(["page 0"]);
  expect(fake.started).toEqual(["d1:0:64", "d1:1:64", "d1:2:64"]);
  await fake.finish();
  await fake.finish();
  expect(ready).toEqual(["page 0", "page 1", "page 2"]);

  // Cached now: ready straight away, no new render.
  let cached: Image | undefined;
  cache.request("d1", 1, 64, (image) => (cached = image));
  expect(cached).toEqual({ key: "64", bytes: 64 * 64 * 4 });
  expect(cache.peek("d1", 1, 64)).toBe(cached);
  expect(cache.peek("d1", 1, 96)).toBeUndefined();
  expect(cache.stats()).toMatchObject({ images: 3, rendered: 3, queued: 0, rendering: 0 });
});

test("a request cancelled before its render starts never reaches the engine", async () => {
  const { cache, fake } = setup();
  cache.request("d1", 0, 64, () => {});
  cache.request("d1", 1, 64, () => {});
  const cancelQueued = cache.request("d1", 2, 64, () => {});
  cache.request("d1", 3, 64, () => {});
  cancelQueued();

  await fake.finish();
  await fake.finish();
  expect(fake.started).toEqual(["d1:0:64", "d1:1:64", "d1:3:64"]);
});

test("a render that has started still finishes and is cached after its request is cancelled", async () => {
  const { cache, fake } = setup();
  let called = false;
  const cancel = cache.request("d1", 0, 64, () => (called = true));
  cancel();
  await fake.finish();
  expect(called).toBe(false);
  expect(cache.peek("d1", 0, 64)).toBeDefined();
});

test("requests for the same image share one render", async () => {
  const { cache, fake } = setup();
  const ready: string[] = [];
  cache.request("d1", 0, 64, () => ready.push("first"));
  const cancelSecond = cache.request("d1", 0, 64, () => ready.push("second"));
  cache.request("d1", 0, 64, () => ready.push("third"));
  cancelSecond();
  // Queued, not yet started, also joins.
  cache.request("d1", 1, 64, () => {});
  cache.request("d1", 2, 64, () => ready.push("queued a"));
  cache.request("d1", 2, 64, () => ready.push("queued b"));

  await fake.finish();
  await fake.finish();
  await fake.finish();
  expect(fake.started).toEqual(["d1:0:64", "d1:1:64", "d1:2:64"]);
  expect(ready).toEqual(["first", "third", "queued a", "queued b"]);
});

test("drops the least recently used images once it's over budget", async () => {
  // Each 64 px image is 16 KB; the budget holds two.
  const { cache, fake, disposed } = setup(2 * 64 * 64 * 4);
  for (const page of [0, 1]) cache.request("d1", page, 64, () => {});
  await fake.finish();
  await fake.finish();

  // Using page 0 makes page 1 the oldest.
  expect(cache.peek("d1", 0, 64)).toBeDefined();
  cache.request("d1", 2, 64, () => {});
  await fake.finish();

  expect(cache.peek("d1", 1, 64)).toBeUndefined();
  expect(cache.peek("d1", 0, 64)).toBeDefined();
  expect(cache.peek("d1", 2, 64)).toBeDefined();
  expect(disposed).toEqual(["64"]);
  expect(cache.stats()).toMatchObject({ images: 2, bytes: 2 * 64 * 64 * 4 });

  // An image bigger than the whole budget is still kept (on its own).
  cache.request("d1", 3, 256, () => {});
  await fake.finish();
  expect(cache.stats()).toMatchObject({ images: 1 });
  expect(cache.peek("d1", 3, 256)).toBeDefined();
});

test("forget drops a document's images and queued renders, and ignores its renders in flight", async () => {
  const { cache, fake, disposed } = setup();
  cache.request("d1", 0, 64, () => {});
  await fake.finish();

  let lateResult = false;
  cache.request("d1", 1, 64, () => (lateResult = true));
  cache.request("d2", 0, 64, () => {});
  cache.request("d1", 2, 64, () => {});
  cache.forget("d1");

  expect(cache.peek("d1", 0, 64)).toBeUndefined();
  expect(disposed).toEqual(["64"]);
  expect(cache.stats()).toMatchObject({ images: 0, queued: 0, rendering: 2 });

  // A new document that reuses the id doesn't join the old render.
  let fresh = false;
  cache.request("d1", 1, 64, () => (fresh = true));
  await fake.finish("d1:1:64");
  expect(lateResult).toBe(false);
  expect(cache.peek("d1", 1, 64)).toBeUndefined();
  expect(disposed).toEqual(["64", "64"]);

  await fake.finish("d2:0:64");
  await fake.finish("d1:1:64");
  expect(fresh).toBe(true);
  expect(fake.started).toEqual(["d1:0:64", "d1:1:64", "d2:0:64", "d1:1:64"]);
});

test("reports render failures to the requests that were waiting", async () => {
  const { cache, fake } = setup();
  const errors: unknown[] = [];
  cache.request(
    "d1",
    0,
    64,
    () => {},
    (error) => errors.push(error),
  );
  fake.pending[0]!.fail(new Error("out of memory"));
  await settle();
  expect(errors).toEqual([new Error("out of memory")]);
  expect(cache.stats()).toMatchObject({ images: 0, rendering: 0 });

  // Not cached, so asking again tries again.
  cache.request("d1", 0, 64, () => {});
  expect(fake.started).toEqual(["d1:0:64", "d1:0:64"]);
});

test("render widths are device pixels, capped at 2×, in steps of 32", () => {
  expect(renderWidth(150)).toBe(160);
  expect(renderWidth(150, 2)).toBe(320);
  expect(renderWidth(150, 3)).toBe(320);
  expect(renderWidth(150, 1.5)).toBe(256);
  expect(renderWidth(160, 1)).toBe(160);
  expect(renderWidth(1)).toBe(32);
  expect(renderWidth(150, 0)).toBe(160);
});
