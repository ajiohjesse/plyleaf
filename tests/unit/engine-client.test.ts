import { expose } from "comlink";
import { MessageChannel } from "node:worker_threads";
import { beforeEach, expect, test, vi } from "vitest";
import type { DocInfo } from "~/engine/types";

// Stands in for the engine worker: a Comlink endpoint serving a fake API, so we can watch the client start and
// recycle workers without loading MuPDF.
let started = 0;
let terminated = 0;
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
      close: () => {},
    },
    port1 as unknown as MessagePort,
  );
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
