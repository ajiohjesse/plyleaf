// Checks files the user hands us (picked, dropped or pasted) before they reach the engine, and turns engine errors
// into messages people can act on. No MuPDF here: it runs on the main thread, on the first bytes of each file.
import { EngineError } from "~/engine/errors";

export type FileKind = "pdf" | "image";

export interface IntakeOptions {
  /** The kinds a tool takes. Defaults to PDFs only. */
  accept?: readonly FileKind[];
  /** Whether a tool takes more than one file. Defaults to true. */
  multiple?: boolean;
  /** Warn once the open files add up to more than this many bytes. Defaults to largeInputBytes() for this device. */
  largeInputBytes?: number;
}

const MB = 1024 * 1024;

/**
 * How much input to take before warning that the browser may run out of memory. The engine's heap is capped at 2 GB
 * and holds about 4–6× the input while working (D-015), so desktops get 300 MB; phones, tablets and devices that
 * report 4 GB of RAM or less get 100 MB.
 */
export function largeInputBytes(
  env: { deviceMemory?: number; coarsePointer?: boolean } = {
    ...(typeof navigator !== "undefined" &&
      "deviceMemory" in navigator && { deviceMemory: navigator.deviceMemory as number }),
    coarsePointer: typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches,
  },
): number {
  const small = env.coarsePointer || (env.deviceMemory !== undefined && env.deviceMemory <= 4);
  return (small ? 100 : 300) * MB;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export interface Checked {
  accepted: File[];
  /** One message per file left out, in the order the files came. */
  rejected: string[];
}

/** How far into a file we look for a PDF header. The spec puts it first, but readers accept junk before it. */
const SNIFF_BYTES = 1024;

function startsWith(head: Uint8Array, signature: string, offset = 0) {
  for (let i = 0; i < signature.length; i++) {
    if (head[offset + i] !== signature.charCodeAt(i)) return false;
  }
  return true;
}

function hasPdfHeader(head: Uint8Array) {
  for (let i = 0; i + 5 <= head.length; i++) {
    if (head[i] === 0x25 && startsWith(head, "%PDF-", i)) return true;
  }
  return false;
}

const heifBrands = ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "avif"];

function isImage(head: Uint8Array) {
  return (
    startsWith(head, "\x89PNG\r\n\x1a\n") ||
    startsWith(head, "\xff\xd8\xff") ||
    startsWith(head, "GIF8") ||
    (startsWith(head, "RIFF") && startsWith(head, "WEBP", 8)) ||
    startsWith(head, "II*\0") ||
    startsWith(head, "MM\0*") ||
    (startsWith(head, "ftyp", 4) && heifBrands.some((brand) => startsWith(head, brand, 8)))
  );
}

/**
 * What a file is, by its first bytes. A file without a PDF header that is named or typed as a PDF still counts as
 * one, because MuPDF can often repair it; the engine has the last word.
 */
export function sniffKind(head: Uint8Array, name: string, type: string): FileKind | "unknown" {
  if (hasPdfHeader(head)) return "pdf";
  if (isImage(head)) return "image";
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  return "unknown";
}

function describeKinds(accept: readonly FileKind[]) {
  return accept.includes("image") ? (accept.includes("pdf") ? "a PDF or an image" : "an image") : "a PDF";
}

/** Sorts files into the ones a tool can take and messages for the rest. */
export async function checkFiles(files: readonly File[], options: IntakeOptions = {}): Promise<Checked> {
  const { accept = ["pdf"], multiple = true } = options;
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (file.size === 0) {
      rejected.push(`${file.name} is empty.`);
      continue;
    }
    let head: Uint8Array;
    try {
      head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    } catch {
      // The file moved or changed on disk after it was picked, or it's a folder.
      rejected.push(`${file.name} couldn't be read.`);
      continue;
    }
    const kind = sniffKind(head, file.name, file.type);
    if (kind === "unknown" || !accept.includes(kind)) {
      const what = kind === "image" ? "is an image, not" : "isn't";
      rejected.push(`${file.name} ${what} ${describeKinds(accept)}.`);
    } else if (!multiple && accepted.length > 0) {
      rejected.push(`${file.name} was left out: this tool works on one file at a time.`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

/** Said whatever the engine was doing when it couldn't load. Not tied to a file, so it's shown once. */
export const ENGINE_UNAVAILABLE =
  "Plyleaf couldn't load its PDF engine. Check your internet connection and try again (it's only needed once).";

/** The message for a file the engine couldn't open. */
export function openFailureMessage(name: string, error: unknown): string {
  const code = error instanceof EngineError ? error.code : "engine-failure";
  switch (code) {
    case "invalid-file":
      return `${name} couldn't be opened. It may be damaged, or not really a PDF.`;
    case "invalid-image":
      return `${name} couldn't be opened. It may be damaged, or a kind of image this browser can't read.`;
    case "password-required":
      return `${name} is protected with a password. Plyleaf can't open protected PDFs yet.`;
    case "out-of-memory":
      return `${name} is too big for the memory this browser has left. Close other files or tabs and try again.`;
    case "engine-crashed":
      return `Plyleaf's PDF engine stopped while opening ${name}. Try again, or try a smaller file.`;
    case "engine-unavailable":
      return ENGINE_UNAVAILABLE;
    default:
      return `Something went wrong opening ${name}. Try again, or try a smaller file.`;
  }
}

/** The message for an operation on open files (making the output PDF) that failed. */
export function operationFailureMessage(error: unknown): string {
  const code = error instanceof EngineError ? error.code : "engine-failure";
  switch (code) {
    case "out-of-memory":
      return "Your browser ran out of memory making this PDF. Try fewer or smaller files at a time, or close other tabs.";
    case "engine-crashed":
      return "Plyleaf's PDF engine stopped while making your PDF, so your files were closed. Add them again and try with fewer at a time.";
    case "engine-unavailable":
      return ENGINE_UNAVAILABLE;
    case "unknown-document":
      return "Your files were closed before the PDF was made. Add them again and try once more.";
    default:
      return "Something went wrong making your PDF. Try again.";
  }
}

/** The message when the engine restarted and took the open files with it. */
export function resetMessage(error: unknown): string {
  const code = error instanceof EngineError ? error.code : "engine-crashed";
  return code === "engine-unavailable"
    ? ENGINE_UNAVAILABLE
    : "Plyleaf's PDF engine stopped, so your files were closed. Add them again to carry on (fewer at a time if they're large).";
}
