import { useEffect, useId, useRef, useState } from "react";
import { engine } from "~/engine/client";
import { extractedImageName, MIME_TYPES, TINY_IMAGE } from "~/convert/pdf-images";
import { outputName } from "~/download/download";
import { operationFailureMessage } from "~/intake/files";
import type { ReadyDocument } from "~/intake/intake";
import { zipFiles } from "~/organize/split";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import { ActionBar, FailureAlert, FileCard, plural, primaryButton, type Result } from "~/components/workspace/parts";

/**
 * The Extract images workspace: one PDF in, every image it draws out, at its original quality (a zip when there are
 * several). Pages are searched one at a time, and an image used on several pages comes out once.
 */
export function ExtractImagesWorkspace() {
  const [state, intake] = useIntake({ multiple: false });
  const doc = state.documents[0];
  const [skipTiny, setSkipTiny] = useState(true);
  const [result, setResult] = useState<Result | { none: string } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [returning, setReturning] = useState(false);
  const tinyId = useId();
  useEffect(() => {
    if (returning) buttonRef.current?.focus();
  }, [returning]);

  async function extract(ready: ReadyDocument) {
    const { pageCount } = ready.info;
    setResult(null);
    setReturning(false);
    setProgress({ done: 0, total: pageCount });
    try {
      const seen: number[] = [];
      const files: { name: string; bytes: Uint8Array; format: "jpeg" | "png" }[] = [];
      for (let page = 0; page < pageCount; page++) {
        const images = await engine.extractImages(ready.info.id, page, seen);
        seen.push(...images.map((image) => image.id));
        const kept = images.filter((image) => !skipTiny || image.width >= TINY_IMAGE || image.height >= TINY_IMAGE);
        kept.forEach(({ format, bytes }, index) =>
          files.push({ name: extractedImageName(ready.name, page, pageCount, index, format), bytes, format }),
        );
        setProgress({ done: page + 1, total: pageCount });
      }
      if (files.length === 0) {
        setResult({
          none: skipTiny
            ? `No images found in ${ready.name}, apart from any smaller than ${TINY_IMAGE} × ${TINY_IMAGE} pixels.`
            : `No images found in ${ready.name}. Text and drawings aren't images; to save whole pages, use PDF to images.`,
        });
      } else if (files.length === 1) {
        const [only] = files;
        setResult({
          file: new Blob([only!.bytes as Uint8Array<ArrayBuffer>], { type: MIME_TYPES[only!.format] }),
          name: only!.name,
        });
      } else {
        setResult({
          file: new Blob([zipFiles(files)], { type: "application/zip" }),
          name: outputName(ready.name, "images", "zip"),
          detail: `${plural(files.length, "image")} in one zip file`,
        });
      }
    } catch (error) {
      setResult({ error: operationFailureMessage(error) });
    } finally {
      setProgress(null);
    }
  }

  if (result && "file" in result) {
    return (
      <div data-files>
        <DownloadPanel
          file={result.file}
          name={result.name}
          {...(result.detail && { detail: result.detail })}
          onStartOver={() => {
            setResult(null);
            setReturning(true);
          }}
          startOverLabel="Back to your file"
        />
      </div>
    );
  }

  return (
    <div
      className="space-y-4"
      data-files={doc ? true : undefined}
      data-busy={state.busy || progress ? true : undefined}
    >
      {doc && <FileCard doc={doc} onRemove={() => void intake.remove(doc.key)} />}
      <IntakeNotices state={state} intake={intake} />
      {result && "error" in result && <FailureAlert message={result.error} />}
      {result && "none" in result && (
        <output className="block rounded-card border border-line bg-surface px-4 py-3">{result.none}</output>
      )}
      {doc?.status === "ready" && (
        <>
          <div className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
            <input
              id={tinyId}
              type="checkbox"
              checked={skipTiny}
              onChange={(event) => setSkipTiny(event.target.checked)}
              className="mt-1 size-4 accent-primary"
            />
            <label htmlFor={tinyId}>
              <span className="font-semibold">Leave out tiny images</span>
              <span className="block text-sm text-ink-muted">
                Icons, bullets and lines smaller than {TINY_IMAGE} × {TINY_IMAGE} pixels.
              </span>
            </label>
          </div>
          <ActionBar
            status={
              progress
                ? `Looking at page ${progress.done} of ${progress.total}…`
                : "JPEGs come out exactly as they are in the PDF; other images as lossless PNG."
            }
          >
            <button
              type="button"
              ref={buttonRef}
              disabled={progress !== null}
              className={primaryButton}
              onClick={() => void extract(doc)}
            >
              {progress ? "Extracting…" : "Extract images"}
            </button>
          </ActionBar>
        </>
      )}
      <FileDrop onFiles={(files) => void intake.add(files)} multiple={false} compact={doc !== undefined} />
    </div>
  );
}
