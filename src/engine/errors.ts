import { transferHandlers, type TransferHandler } from "comlink";
import type { EngineErrorCode } from "./types";

export class EngineError extends Error {
  override name = "EngineError";
  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface SerializedError {
  message: string;
  code: EngineErrorCode;
}

/**
 * Comlink only carries an error's message and stack across the worker boundary. This replaces the serialisation of
 * its "throw" handler (keeping its check for thrown values) on both sides, so that callers get an EngineError with
 * its code. Anything thrown that isn't an EngineError arrives as "engine-failure".
 */
export function carryEngineErrors() {
  const thrown = transferHandlers.get("throw") as TransferHandler<{ value: unknown }, SerializedError>;
  transferHandlers.set("throw", {
    canHandle: thrown.canHandle,
    serialize: ({ value }) => [
      value instanceof EngineError
        ? { message: value.message, code: value.code }
        : { message: value instanceof Error ? value.message : String(value), code: "engine-failure" },
      [],
    ],
    deserialize: (error: SerializedError) => {
      throw new EngineError(error.code, error.message);
    },
  });
}
