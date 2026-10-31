// Hands files to a page the ways a user can: drag-and-drop from the desktop and paste. (The picker is Playwright's
// `setInputFiles`.) Files go in as plain arrays so they survive `page.evaluate`.
import type { Page } from "@playwright/test";
import { A4, makePdf } from "./pdf";

export interface FileSpec {
  name: string;
  mimeType: string;
  bytes: number[];
}

export const pdfFile = (name: string, pages = [A4]): FileSpec => ({
  name,
  mimeType: "application/pdf",
  bytes: Array.from(makePdf(pages)),
});

/** The same file in the shape `setInputFiles` takes. */
export const asPayload = (f: FileSpec) => ({ name: f.name, mimeType: f.mimeType, buffer: Buffer.from(f.bytes) });

/** Fires a drag-and-drop of `files` onto `selector`, the way a browser does when files come from the desktop. */
export async function dropFiles(page: Page, selector: string, files: FileSpec[]) {
  await page.evaluate(
    ({ target: where, specs }) => {
      const data = new DataTransfer();
      for (const f of specs) data.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.mimeType }));
      const target = document.querySelector(where)!;
      for (const type of ["dragenter", "dragover", "drop"]) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: data });
        target.dispatchEvent(event);
      }
    },
    { target: selector, specs: files },
  );
}

export async function pasteFiles(page: Page, files: FileSpec[]) {
  await page.evaluate((specs) => {
    const data = new DataTransfer();
    for (const f of specs) data.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.mimeType }));
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    document.body.dispatchEvent(event);
  }, files);
}
