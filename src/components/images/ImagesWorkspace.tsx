import { useEffect, useId, useRef, useState } from "react";
import { engine } from "~/engine/client";
import { fitFor, type Layout, type Margin, type Orientation, type PageSize } from "~/convert/images";
import { outputName } from "~/download/download";
import { operationFailureMessage } from "~/intake/files";
import { DownloadPanel } from "~/components/download/DownloadPanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { IntakeNotices } from "~/components/intake/IntakePanel";
import { useIntake } from "~/components/intake/useIntake";
import { FileOrder } from "~/components/workspace/FileOrder";
import { ActionBar, Choice, FailureAlert, plural, primaryButton, type Result } from "~/components/workspace/parts";

const ACCEPT = ["image"] as const;

/**
 * The Images to PDF workspace: add images (JPG, PNG, WebP, HEIC, GIF, TIFF), put them in order, choose the page size,
 * and make one PDF with a page per image. Images open as pages in the engine, so changing the layout and making the
 * PDF again is instant.
 */
export function ImagesWorkspace() {
  const [state, intake] = useIntake({ accept: ACCEPT });
  const [layout, setLayout] = useState<Layout>({ size: "image", orientation: "auto", margin: "none" });
  const [making, setMaking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const ready = state.documents.filter((doc) => doc.status === "ready");
  const pageCount = ready.reduce((sum, doc) => sum + doc.info.pageCount, 0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (returning) buttonRef.current?.focus();
  }, [returning]);

  async function convert() {
    setMaking(true);
    setResult(null);
    setReturning(false);
    try {
      const bytes = await engine.assemble(
        ready.flatMap((doc) =>
          doc.info.pages.map((info, page) => {
            const fit = fitFor(info, layout);
            return { doc: doc.info.id, page, ...(fit && { fit }) };
          }),
        ),
      );
      setResult({
        file: new Blob([bytes], { type: "application/pdf" }),
        name: outputName(ready[0]!.name, ready.length > 1 ? "images" : ""),
      });
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
          detail={plural(pageCount, "page")}
          onStartOver={() => {
            setResult(null);
            setReturning(true);
          }}
          startOverLabel="Back to your images"
        />
      </div>
    );
  }

  const hasFiles = state.documents.length > 0;
  return (
    <div className="space-y-4" data-files={hasFiles || undefined} data-busy={state.busy || making || undefined}>
      {hasFiles && <FileOrder documents={state.documents} intake={intake} />}
      <FileDrop onFiles={(files) => void intake.add(files)} accept={ACCEPT} compact={hasFiles} />
      <IntakeNotices state={state} intake={intake} />
      {result && "error" in result && <FailureAlert message={result.error} />}
      {hasFiles && <LayoutOptions layout={layout} onChange={setLayout} />}
      {hasFiles && (
        <ActionBar
          status={
            state.busy
              ? "Opening your images…"
              : ready.length === 0
                ? "Add an image to make a PDF."
                : `${plural(ready.length, "image")} · ${plural(pageCount, "page")}, in this order`
          }
        >
          <button
            type="button"
            ref={buttonRef}
            disabled={ready.length === 0 || state.busy || making}
            className={primaryButton}
            onClick={() => void convert()}
          >
            {making ? "Making your PDF…" : "Convert to PDF"}
          </button>
        </ActionBar>
      )}
    </div>
  );
}

function LayoutOptions({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }) {
  const name = useId();
  const ids = { orientation: useId(), margin: useId() };
  const set = (change: Partial<Layout>) => onChange({ ...layout, ...change });
  const selectClass =
    "mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none";
  const sizes: { value: PageSize; title: string; text: string }[] = [
    { value: "image", title: "Same as image", text: "Each page is its image's size." },
    { value: "a4", title: "A4", text: "210 × 297 mm, images fitted in." },
    { value: "letter", title: "US Letter", text: "8.5 × 11 in, images fitted in." },
  ];

  return (
    <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
      <legend className="px-1 font-semibold">Page size</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {sizes.map((size) => (
          <Choice
            key={size.value}
            name={name}
            checked={layout.size === size.value}
            onChange={() => set({ size: size.value })}
            title={size.title}
          >
            {size.text}
          </Choice>
        ))}
      </div>
      {layout.size !== "image" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.orientation} className="font-semibold">
              Orientation
            </label>
            <select
              id={ids.orientation}
              value={layout.orientation}
              onChange={(event) => set({ orientation: event.target.value as Orientation })}
              className={selectClass}
            >
              <option value="auto">Match each image</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
          <div>
            <label htmlFor={ids.margin} className="font-semibold">
              Margin
            </label>
            <select
              id={ids.margin}
              value={layout.margin}
              onChange={(event) => set({ margin: event.target.value as Margin })}
              className={selectClass}
            >
              <option value="none">None</option>
              <option value="small">Small (¼ in, 6 mm)</option>
              <option value="large">Large (½ in, 13 mm)</option>
            </select>
          </div>
        </div>
      )}
    </fieldset>
  );
}
