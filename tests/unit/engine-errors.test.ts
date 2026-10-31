import { expose, wrap } from "comlink";
import { MessageChannel } from "node:worker_threads";
import { expect, test } from "vitest";
import { carryEngineErrors, EngineError, toEngineError } from "~/engine/errors";

carryEngineErrors();

const { port1, port2 } = new MessageChannel();
expose(
  {
    fails(code: "password-required" | "other") {
      if (code === "other") throw new TypeError("page tree loop");
      throw new EngineError(code, "This PDF is protected with a password");
    },
    returnsValue: () => ({ value: 1 }),
  },
  port1 as unknown as MessagePort,
);
const remote = wrap<{ fails(code: string): void; returnsValue(): { value: number } }>(port2 as unknown as MessagePort);

test("an EngineError keeps its code across the worker boundary", async () => {
  const error = await remote.fails("password-required").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(EngineError);
  expect(error).toMatchObject({ code: "password-required", message: "This PDF is protected with a password" });
});

test("anything else arrives as an engine failure", async () => {
  const error = await remote.fails("other").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(EngineError);
  expect(error).toMatchObject({ code: "engine-failure", message: "page tree loop" });
});

test("memory failures and WASM aborts get their own codes", () => {
  // What MuPDF throws when the 2 GB WASM heap can't grow (seen in Node with mupdf 1.28).
  expect(toEngineError(new Error("malloc (201326592 bytes) failed")).code).toBe("out-of-memory");
  expect(toEngineError(new RangeError("Array buffer allocation failed")).code).toBe("out-of-memory");
  // An abort leaves the WASM unusable, even when it was memory that ran out.
  expect(toEngineError(new WebAssembly.RuntimeError("Aborted(OOM)")).code).toBe("engine-crashed");
  expect(toEngineError(new WebAssembly.RuntimeError("unreachable")).code).toBe("engine-crashed");
  expect(toEngineError("weird").code).toBe("engine-failure");
  const original = new EngineError("password-required", "locked");
  expect(toEngineError(original)).toBe(original);
});

test("return values that look like thrown values pass through", async () => {
  expect(await remote.returnsValue()).toEqual({ value: 1 });
  port1.close();
});
