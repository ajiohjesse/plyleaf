// Getting a result to the user: a name for it, a plain download (every browser) and "Save as" where the browser lets
// a page ask where to save (Chromium on desktop). Nothing leaves the device: the file goes from memory to disk.

/** Longest name we suggest, before the suffix and extension. File systems allow 255 bytes; this leaves room. */
const MAX_BASE = 100;
/** Names Windows won't create a file under, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * The name for a tool's output, from the source file's name and what the tool did: "report.pdf" and "merged" make
 * "report-merged.pdf". Characters that aren't allowed in file names on Windows, macOS or Linux become dashes.
 */
export function outputName(source: string, suffix = "", extension = "pdf"): string {
  let base = source
    // A short trailing extension, like ".pdf" or ".jpeg".
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/\s+/g, " ")
    // oxlint-disable-next-line no-control-regex -- control characters are what we're taking out
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
    // Windows drops trailing dots and spaces; dashes left at the ends by the step above look odd.
    .replace(/^[\s.-]+|[\s.-]+$/g, "");
  base = Array.from(base).slice(0, MAX_BASE).join("").trim();
  if (base === "") base = "document";
  if (RESERVED.test(base) && suffix === "") base += "-file";
  return `${base}${suffix ? `-${suffix}` : ""}.${extension}`;
}

/** Downloads a file the way a link with `download` does. Call it from a click, so browsers allow it. */
export function downloadFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  // Firefox only follows links that are in the document.
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started from the URL by now; Safari needs it for a moment longer than the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface WritableFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

type ShowSaveFilePicker = (options: SaveFilePickerOptions) => Promise<{ createWritable(): Promise<WritableFile> }>;

function savePicker(): ShowSaveFilePicker | undefined {
  if (typeof window === "undefined") return undefined;
  const picker = (window as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  return typeof picker === "function" ? picker.bind(window) : undefined;
}

/** Whether this browser can ask where to save a file. */
export function canSaveAs(): boolean {
  return savePicker() !== undefined;
}

/**
 * Asks where to save the file and writes it there. Resolves to false if the user closed the dialog. Call it from a
 * click; throws if the browser can't ask or the write fails.
 */
export async function saveAs(file: Blob, name: string): Promise<boolean> {
  const picker = savePicker();
  if (!picker) throw new Error("This browser can't ask where to save");
  const extension = name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".pdf";
  let handle;
  try {
    handle = await picker({
      suggestedName: name,
      types: [
        {
          description: extension.toLowerCase() === ".zip" ? "ZIP archive" : "PDF document",
          accept: { [file.type || "application/pdf"]: [extension] },
        },
      ],
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return false;
    throw error;
  }
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return true;
}
