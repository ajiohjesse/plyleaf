import { expose } from "comlink";
import { MessageChannel } from "node:worker_threads";
import { beforeEach, expect, test, vi } from "vitest";
import type { DocInfo } from "~/engine/types";

// Stands in for the engine worker: a Comlink endpoint serving a fake API, so we can watch the client start and
// recycle workers without loading MuPDF.
let started = 0;
let terminated = 0;
/** The newest fake worker's end of the channel, to fire events on. */
let latest: EventTarget;
// Called with `new`; returning an object makes that object the instance.
function FakeWorker() {
  started++;
  const { port1, port2 } = new MessageChannel();
  let nextId = 1;
  expose(
    {
      ready: () => {},
      open: (bytes: Uint8Array): DocInfo => ({
        id: `d${nextId++}`,
        pageCount: bytes.length,
        pages: [],
        repaired: false,
      }),
      // Page 0 hangs (for a worker that dies mid-call); page 1 fails to allocate; page 2 aborts the WASM.
      render: (_id: string, page: number) => {
        if (page === 1) throw new Error("malloc (201326592 bytes) failed");
        if (page === 2) throw new WebAssembly.RuntimeError("unreachable");
        return new Promise(() => {});
      },
      close: () => {},
    },
    port1 as unknown as MessagePort,
  );
  latest = port2 as unknown as EventTarget;
  return Object.assign(port2, {
    terminate() {
      terminated++;
      port1.close();
    },
  });
}

async function loadClient() {
  vi.resetModules();
  return import("~/engine/client");
}

beforeEach(() => {
  started = 0;
  terminated = 0;
  vi.stubGlobal("Worker", FakeWorker);
});

test("starts no worker until it's needed, then reuses one", async () => {
  const { engine, preloadEngine } = await loadClient();
  expect(engine.stats().running).toBe(false);
  expect(started).toBe(0);

  preloadEngine();
  await engine.open(new Uint8Array(10));
  await engine.open(new Blob(["%PDF-"]));
  expect(started).toBe(1);
  expect(engine.stats()).toEqual({ running: true, openDocuments: 2, bytesOpened: 15 });
});

test("recycles the worker once a large job's documents are all closed", async () => {
  const { engine, RECYCLE_AFTER_BYTES } = await loadClient();
  const big = await engine.open(new Uint8Array(RECYCLE_AFTER_BYTES));
  const small = await engine.open(new Uint8Array(10));

  await engine.close(big.id);
  expect(terminated).toBe(0); // one document still open

  await engine.close(small.id);
  expect(terminated).toBe(1);
  expect(engine.stats().running).toBe(false);

  // Closing again is harmless, and the next call starts a fresh worker.
  await engine.close(small.id);
  await engine.open(new Uint8Array(10));
  expect(started).toBe(2);
});

test("keeps the worker after small jobs", async () => {
  const { engine } = await loadClient();
  const doc = await engine.open(new Uint8Array(1024));
  await engine.close(doc.id);
  expect(terminated).toBe(0);
  expect(engine.stats()).toEqual({ running: true, openDocuments: 0, bytesOpened: 1024 });
});

/** What a failed call rejected with. */
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error: { name: string; code: string }) => `${error.name}: ${error.code}`,
  );

test("running out of memory fails the call but keeps the worker and its documents", async () => {
  const { engine } = await loadClient();
  const resets: string[] = [];
  engine.onReset((error) => resets.push(error.code));
  const doc = await engine.open(new Uint8Array(10));

  expect(await failure(engine.render(doc.id, 1, 100))).toBe("EngineError: out-of-memory");
  expect(terminated).toBe(0);
  expect(resets).toEqual([]);
  expect(engine.stats()).toMatchObject({ running: true, openDocuments: 1 });
});

test("an aborted WASM restarts the worker and reports the documents lost", async () => {
  const { engine } = await loadClient();
  const resets: string[] = [];
  engine.onReset((error) => resets.push(error.code));
  const doc = await engine.open(new Uint8Array(10));

  expect(await failure(engine.render(doc.id, 2, 100))).toBe("EngineError: engine-crashed");
  expect(terminated).toBe(1);
  expect(resets).toEqual(["engine-crashed"]);
  expect(engine.stats()).toMatchObject({ running: false, openDocuments: 0 });

  await engine.open(new Uint8Array(10));
  expect(started).toBe(2);
});

test("a worker that dies fails the calls waiting on it", async () => {
  const { engine } = await loadClient();
  const resets: string[] = [];
  const stop = engine.onReset((error) => resets.push(error.code));
  const doc = await engine.open(new Uint8Array(10));

  const pending = failure(engine.render(doc.id, 0, 100));
  latest.dispatchEvent(new Event("error"));
  expect(await pending).toBe("EngineError: engine-crashed");
  expect(terminated).toBe(1);
  expect(resets).toEqual(["engine-crashed"]);

  // No documents open, so a second crash tells nobody; and listeners can stop listening.
  stop();
  const again = failure(engine.render(doc.id, 0, 100));
  latest.dispatchEvent(new Event("error"));
  expect(await again).toBe("EngineError: engine-unavailable");
  expect(resets).toEqual(["engine-crashed"]);
});

test("a worker that never starts reports the engine unavailable, and the next call tries again", async () => {
  const { engine } = await loadClient();
  const pending = failure(engine.render("d1", 0, 100));
  latest.dispatchEvent(new Event("error"));
  expect(await pending).toBe("EngineError: engine-unavailable");
  expect(engine.stats().running).toBe(false);

  await engine.open(new Uint8Array(10));
  expect(started).toBe(2);
});
