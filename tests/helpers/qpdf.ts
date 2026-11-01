// qpdf (compiled to WASM, a dev dependency only) as the outside check on what our engine writes (GOAL M4): it validates
// structure, streams and encryption independently of MuPDF. Works in Vitest and Playwright alike. Results are exit
// codes (this build prints straight to the console, which can't be captured reliably under Vitest).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface QpdfModule {
  FS: { writeFile(path: string, data: Uint8Array): void };
  callMain(args: string[]): number;
}
type CreateModule = (options: object) => Promise<QpdfModule>;

/** Runs qpdf on `pdf` (as /in.pdf, after `args`) in a fresh instance and returns its exit code. */
export async function qpdf(pdf: Uint8Array, args: string[], after: string[] = []): Promise<number> {
  const createModule = require("@neslinesli93/qpdf-wasm") as CreateModule;
  const module = await createModule({
    locateFile: () => require.resolve("@neslinesli93/qpdf-wasm/dist/qpdf.wasm"),
    noInitialRun: true,
  });
  module.FS.writeFile("/in.pdf", pdf);
  try {
    return module.callMain([...args, "/in.pdf", ...after]);
  } catch (error) {
    // Emscripten reports exit() as a thrown ExitStatus.
    const status = (error as { status?: number }).status;
    if (typeof status !== "number") throw error;
    return status;
  }
}

/** qpdf --check: 0 when it finds no errors or warnings, 2 for errors, 3 for warnings only. */
export function qpdfCheck(pdf: Uint8Array, password?: string): Promise<number> {
  return qpdf(pdf, ["--check", ...(password === undefined ? [] : [`--password=${password}`])]);
}

/**
 * What qpdf says about a file's encryption: "none", "restrictions" (encrypted, opens without a password) or "password"
 * (opens only with `password`). This build can't inspect a file it can't open, so a password file needs its password.
 */
export async function qpdfEncryption(
  pdf: Uint8Array,
  password?: string,
): Promise<"none" | "restrictions" | "password"> {
  if ((await qpdf(pdf, ["--is-encrypted"])) === 0) {
    return (await qpdf(pdf, ["--requires-password"])) === 0 ? "password" : "restrictions";
  }
  if (password !== undefined && (await qpdf(pdf, [`--password=${password}`, "--is-encrypted"])) === 0) {
    return "password";
  }
  // Not encrypted: then it opens and checks without a password.
  if ((await qpdfCheck(pdf)) === 2) throw new Error("qpdf can't open the file: wrong password, or damaged");
  return "none";
}

/** Whether qpdf can decrypt the file with `password` (user or owner). */
export async function qpdfOpens(pdf: Uint8Array, password: string): Promise<boolean> {
  return (await qpdf(pdf, [`--password=${password}`, "--decrypt"], ["/out.pdf"])) === 0;
}
