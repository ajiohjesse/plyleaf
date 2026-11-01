import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { engine } from "~/engine/client";
import type { DocInfo } from "~/engine/types";
import { fitFor, type Layout } from "~/convert/images";
import { checkFiles, operationFailureMessage } from "~/intake/files";
import { detectDocument, greyFromRgba } from "~/scan/detect";
import type { ScanFilter } from "~/scan/filters";
import { decodePhoto } from "~/scan/photo";
import { WHOLE, type Quad } from "~/scan/quad";
import { thumbnails } from "~/thumbnails/thumbnails";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { LayoutOptions } from "~/components/images/ImagesWorkspace";
import { CloseIcon } from "~/components/intake/IntakePanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { PageCanvas } from "~/components/thumbnails/PageCanvas";
import {
  ActionBar,
  Choice,
  FailureAlert,
  IconButton,
  plural,
  primaryButton,
  type Result,
} from "~/components/workspace/parts";
import { Camera } from "./Camera";
import { CornerEditor } from "./CornerEditor";

interface ScanPage {
  key: string;
  /** The photo as taken or picked; straightened again from this whenever its corners or the filter change. */
  photo: Blob;
  quad: Quad;
  detected: Quad | null;
  /** The straightened page, open in the engine; null while it's being made. */
  info: DocInfo | null;
}

let nextKey = 1;

const noChanges = () => () => {};
const hasCamera = () => typeof navigator.mediaDevices?.getUserMedia === "function";

/**
 * The Scan to PDF workspace: photograph pages (the live camera, or photos picked, dropped or pasted), each page's
 * corners found automatically and adjustable, straightened, optionally grey or black and white, then one PDF.
 */
export function ScanWorkspace() {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const [filter, setFilter] = useState<ScanFilter>("colour");
  const [layout, setLayout] = useState<Layout>({ size: "image", orientation: "auto", margin: "none" });
  const [camera, setCamera] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [making, setMaking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // Known only in the browser; the server render leaves the camera button out.
  const cameraAvailable = useSyncExternalStore(noChanges, hasCamera, () => false);
  const filterName = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) buttonRef.current?.focus();
  }, [returning]);
  // Close the straightened pages when the workspace goes.
  useEffect(
    () => () => {
      for (const page of pagesRef.current) if (page.info) void close(page.info.id);
    },
    [],
  );

  function close(id: string) {
    thumbnails.forget(id);
    return engine.close(id);
  }

  /** (Re)makes a page's straightened version from its photo, replacing the old one. */
  async function straighten(key: string, quad: Quad, using: ScanFilter) {
    const page = pagesRef.current.find((p) => p.key === key);
    if (!page) return;
    const old = page.info;
    setPages((list) => list.map((p) => (p.key === key ? { ...p, quad, info: null } : p)));
    try {
      const info = await engine.openScan(await decodePhoto(page.photo), quad, using);
      if (!pagesRef.current.some((p) => p.key === key)) return void close(info.id);
      setPages((list) => list.map((p) => (p.key === key ? { ...p, info } : p)));
    } catch (error) {
      setNotices((n) => [...n, operationFailureMessage(error)]);
      setPages((list) => list.filter((p) => p.key !== key));
    } finally {
      if (old) void close(old.id);
    }
  }

  async function addPhotos(photos: Blob[], names: string[]) {
    for (const [i, photo] of photos.entries()) {
      try {
        const pixels = await decodePhoto(photo);
        const detected = detectDocument(greyFromRgba(pixels));
        const quad = detected ?? WHOLE;
        const key = `s${nextKey++}`;
        setPages((list) => [...list, { key, photo, quad, detected, info: null }]);
        const info = await engine.openScan(pixels, quad, filter);
        if (!pagesRef.current.some((p) => p.key === key)) {
          void close(info.id);
          continue;
        }
        setPages((list) => list.map((p) => (p.key === key ? { ...p, info } : p)));
      } catch (error) {
        setNotices((n) => [
          ...n,
          error instanceof DOMException || error instanceof TypeError
            ? `${names[i]} couldn't be read as a photo.`
            : operationFailureMessage(error),
        ]);
      }
    }
  }

  async function addFiles(files: File[]) {
    setNotices([]);
    const { accepted, rejected } = await checkFiles(files, { accept: ["image"] });
    setNotices(rejected);
    await addPhotos(
      accepted,
      accepted.map((f) => f.name),
    );
  }

  function changeFilter(next: ScanFilter) {
    setFilter(next);
    for (const page of pagesRef.current) void straighten(page.key, page.quad, next);
  }

  function remove(key: string) {
    const page = pagesRef.current.find((p) => p.key === key);
    setPages((list) => list.filter((p) => p.key !== key));
    if (page?.info) void close(page.info.id);
  }

  function move(key: string, by: number) {
    setPages((list) => {
      const from = list.findIndex((p) => p.key === key);
      const to = from + by;
      if (from === -1 || to < 0 || to >= list.length) return list;
      const next = [...list];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  }

  async function makePdf() {
    setMaking(true);
    setResult(null);
    setReturning(false);
    try {
      const bytes = await engine.assemble(
        pages.flatMap(({ info }) => {
          if (!info) return [];
          const fit = fitFor(info.pages[0]!, layout);
          return [{ doc: info.id, page: 0, ...(fit && { fit }) }];
        }),
      );
      setResult({ file: new Blob([bytes], { type: "application/pdf" }), name: "scan.pdf" });
    } catch (error) {
      setResult({ error: operationFailureMessage(error) });
    } finally {
      setMaking(false);
    }
  }

  if (result && "file" in result) {
    return (
      <div data-files>
        <DownloadPanel
          file={result.file}
          name={result.name}
          detail={plural(pages.length, "page")}
          onStartOver={() => {
            setResult(null);
            setReturning(true);
          }}
          startOverLabel="Back to your scan"
        />
      </div>
    );
  }

  const editingPage = pages.find((p) => p.key === editing);
  if (editingPage) {
    return (
      <div data-files>
        <CornerEditor
          photo={editingPage.photo}
          quad={editingPage.quad}
          detected={editingPage.detected}
          onCancel={() => setEditing(null)}
          onDone={(quad) => {
            setEditing(null);
            void straighten(editingPage.key, quad, filter);
          }}
        />
      </div>
    );
  }

  const busy = pages.some((p) => !p.info);
  const hasPages = pages.length > 0;
  return (
    <div className="space-y-4" data-files={hasPages || camera || undefined} data-busy={busy || making || undefined}>
      {camera ? (
        <Camera onCapture={(photo) => void addPhotos([photo], ["The photo"])} onClose={() => setCamera(false)} />
      ) : (
        cameraAvailable && (
          <button type="button" className={`${primaryButton} w-full sm:w-auto`} onClick={() => setCamera(true)}>
            Use camera
          </button>
        )
      )}
      {hasPages && (
        <ol aria-label="Scanned pages" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pages.map((page, index) => (
            <li
              key={page.key}
              data-status={page.info ? "ready" : "working"}
              className="rounded-card border border-line bg-surface p-2"
            >
              <div
                className="relative mx-auto overflow-hidden rounded-sm bg-surface-band ring-1 ring-line"
                style={{
                  aspectRatio: page.info ? `${page.info.pages[0]!.width} / ${page.info.pages[0]!.height}` : "3 / 4",
                  maxWidth: "100%",
                }}
              >
                {page.info ? (
                  <PageCanvas docId={page.info.id} index={0} width={160} onScreen />
                ) : (
                  <span className="absolute inset-0 grid place-items-center text-sm text-ink-muted">
                    Straightening…
                  </span>
                )}
              </div>
              <p className="mt-2 text-center text-sm font-semibold">Page {index + 1}</p>
              <div className="flex flex-wrap justify-center">
                <IconButton
                  label={`Adjust corners of page ${index + 1}`}
                  disabled={!page.info}
                  onClick={() => setEditing(page.key)}
                >
                  <CornersIcon />
                </IconButton>
                <IconButton
                  label={`Move page ${index + 1} earlier`}
                  disabled={index === 0}
                  onClick={() => move(page.key, -1)}
                >
                  <ArrowIcon left />
                </IconButton>
                <IconButton
                  label={`Move page ${index + 1} later`}
                  disabled={index === pages.length - 1}
                  onClick={() => move(page.key, 1)}
                >
                  <ArrowIcon />
                </IconButton>
                <IconButton label={`Remove page ${index + 1}`} onClick={() => remove(page.key)}>
                  <CloseIcon />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
      )}
      <FileDrop onFiles={(files) => void addFiles(files)} accept={["image"]} compact={hasPages || camera} />
      {notices.length > 0 && (
        <ul aria-label="Photo messages" className="space-y-2">
          {notices.map((notice, i) => (
            <li key={i} className="rounded-card border-2 border-sticky-coral bg-sticky-pink/40 px-4 py-3">
              {notice}
            </li>
          ))}
        </ul>
      )}
      {result && "error" in result && <FailureAlert message={result.error} />}
      {hasPages && (
        <>
          <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
            <legend className="px-1 font-semibold">Look</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <Choice
                name={filterName}
                checked={filter === "colour"}
                onChange={() => changeFilter("colour")}
                title="Colour"
              >
                As photographed.
              </Choice>
              <Choice
                name={filterName}
                checked={filter === "grey"}
                onChange={() => changeFilter("grey")}
                title="Greyscale"
              >
                Shades of grey, smaller files.
              </Choice>
              <Choice
                name={filterName}
                checked={filter === "bw"}
                onChange={() => changeFilter("bw")}
                title="Black and white"
              >
                Crisp, like a photocopy. Best for text.
              </Choice>
            </div>
          </fieldset>
          <LayoutOptions layout={layout} onChange={setLayout} />
          <ActionBar status={busy ? "Straightening your pages…" : `${plural(pages.length, "page")}, in this order`}>
            <button
              type="button"
              ref={buttonRef}
              disabled={busy || making}
              className={primaryButton}
              onClick={() => void makePdf()}
            >
              {making ? "Making your PDF…" : "Make PDF"}
            </button>
          </ActionBar>
        </>
      )}
    </div>
  );
}

function CornersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
    >
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </svg>
  );
}

function ArrowIcon({ left = false }: { left?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d={left ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
