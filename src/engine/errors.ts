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

/**
 * The EngineError for anything an engine operation threw. MuPDF reports a failed allocation as a plain Error and
 * stays usable; a WebAssembly.RuntimeError means the WASM aborted and the module can't be used again.
 */
export function toEngineError(error: unknown): EngineError {
  if (error instanceof EngineError) return error;
  const message = error instanceof Error ? error.message : String(error);
  // Checked first: an abort is fatal whatever caused it, running out of memory included.
  if (typeof WebAssembly !== "undefined" && error instanceof WebAssembly.RuntimeError) {
    return new EngineError("engine-crashed", message);
  }
  if (error instanceof RangeError || /malloc .*failed|out of memory|allocation failed/i.test(message)) {
    return new EngineError("out-of-memory", message);
  }
  return new EngineError("engine-failure", message);
}

interface SerializedError {
  message: string;
  code: EngineErrorCode;
}

/**
 * Comlink only carries an error's message and stack across the worker boundary. This replaces the serialisation of
 * its "throw" handler (keeping its check for thrown values) on both sides, so that callers get an EngineError with
 * its code (see toEngineError for errors that aren't EngineErrors yet).
 */
export function carryEngineErrors() {
  const thrown = transferHandlers.get("throw") as TransferHandler<{ value: unknown }, SerializedError>;
  transferHandlers.set("throw", {
    canHandle: thrown.canHandle,
    serialize: ({ value }) => {
      const error = toEngineError(value);
      return [{ message: error.message, code: error.code }, []];
    },
    deserialize: (error: SerializedError) => {
      throw new EngineError(error.code, error.message);
    },
  });
}
