// Checks files the user hands us (picked, dropped or pasted) before they reach the engine, and turns engine errors
// into messages people can act on. No MuPDF here: it runs on the main thread, on the first bytes of each file.
import { EngineError } from "~/engine/errors";

export type FileKind = "pdf" | "image";

export interface IntakeOptions {
  /** The kinds a tool takes. Defaults to PDFs only. */
  accept?: readonly FileKind[];
  /** Whether a tool takes more than one file. Defaults to true. */
  multiple?: boolean;
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

/** The message for a file the engine couldn't open. */
export function openFailureMessage(name: string, error: unknown): string {
  const code = error instanceof EngineError ? error.code : "engine-failure";
  switch (code) {
    case "invalid-file":
      return `${name} couldn't be opened. It may be damaged, or not really a PDF.`;
    case "password-required":
      return `${name} is protected with a password. Plyleaf can't open protected PDFs yet.`;
    default:
      return `Something went wrong opening ${name}. Try again, or try a smaller file.`;
  }
}
