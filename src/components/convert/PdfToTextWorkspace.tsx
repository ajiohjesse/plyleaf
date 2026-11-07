import { useId, useState } from "react";
import { engine } from "~/engine/client";
import { joinPages, pagesWithoutText } from "~/convert/pdf-text";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { ActionBar, plural, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";

/** The PDF to text workspace: one PDF in, its text out as a .txt file (UTF-8), or copied. */
export function PdfToTextWorkspace() {
  return <SingleFileTool Options={PdfToTextOptions} />;
}

/** "page 3", "pages 2 and 5", "pages 1, 2 and 7", "12 pages". */
function listPages(pages: number[]): string {
  if (pages.length > 5) return plural(pages.length, "page");
  if (pages.length === 1) return `page ${pages[0]}`;
  return `pages ${pages.slice(0, -1).join(", ")} and ${pages.at(-1)}`;
}

async function extract(doc: ReadyDocument, markPages: boolean): Promise<Outcome> {
  const pages = await engine.pdfText(doc.info.id);
  const empty = pagesWithoutText(pages);
  if (empty.length === pages.length) {
    return {
      info: `${doc.name} has no text to copy: its pages are pictures (a scan or a photo, say). Plyleaf doesn't read text in pictures.`,
    };
  }
  const text = joinPages(pages, markPages);
  return {
    file: new Blob([text], { type: "text/plain;charset=utf-8" }),
    name: outputName(doc.name, "", "txt"),
    detail:
      empty.length > 0
        ? `${listPages(empty)} had no text (pictures only), so ${empty.length === 1 ? "it's" : "they're"} empty`
        : `Text from ${plural(pages.length, "page")}`,
    copy: text,
  };
}

function PdfToTextOptions({ doc, run, working, buttonRef }: ToolProps) {
  const [markPages, setMarkPages] = useState(true);
  const markId = useId();
  return (
    <>
      <div className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
        <input
          id={markId}
          type="checkbox"
          checked={markPages}
          onChange={(event) => setMarkPages(event.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        <label htmlFor={markId}>
          <span className="font-semibold">Show where each page starts</span>
          <span className="block text-sm text-ink-muted">A line like “--- Page 2 ---” before each page’s text.</span>
        </label>
      </div>
      <ActionBar
        status={
          working
            ? "Reading the text…"
            : `${plural(doc.info.pageCount, "page")}: the text in reading order, as a .txt file.`
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={working}
          className={primaryButton}
          onClick={() => run(() => extract(doc, markPages))}
        >
          {working ? "Reading…" : "Get the text"}
        </button>
      </ActionBar>
    </>
  );
}
