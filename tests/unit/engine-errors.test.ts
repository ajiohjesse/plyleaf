import { expose, wrap } from "comlink";
import { MessageChannel } from "node:worker_threads";
import { expect, test } from "vitest";
import { carryEngineErrors, EngineError } from "~/engine/errors";

carryEngineErrors();

const { port1, port2 } = new MessageChannel();
expose(
  {
    fails(code: "password-required" | "other") {
      if (code === "other") throw new RangeError("out of memory");
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
  expect(error).toMatchObject({ code: "engine-failure", message: "out of memory" });
});

test("return values that look like thrown values pass through", async () => {
  expect(await remote.returnsValue()).toEqual({ value: 1 });
  port1.close();
});
