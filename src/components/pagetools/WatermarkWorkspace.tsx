import { useEffect, useId, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { unsupportedCharacters } from "~/editor/fonts";
import type { ReadyDocument } from "~/intake/intake";
import { DEFAULT_STYLE, type TextStyle } from "~/pagetools/stamping";
import { DEFAULT_WATERMARK, watermarkEdits, type WatermarkOptions } from "~/pagetools/watermark";
import { prepareImage, type PreparedImage } from "~/components/editor/prepareImage";
import { ActionBar, Choice, FailureAlert, plural, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";
import { fieldClass, PagePreview, panelClass, PositionGrid, StyleFields, WholeNumberField } from "./fields";

/** The Watermark workspace: words or a picture over every page, see-through and turned, with a preview. */
export function WatermarkWorkspace() {
  return <SingleFileTool Options={WatermarkOptionsPanel} />;
}

const TEXT_STYLE: TextStyle = { ...DEFAULT_STYLE, size: 64, bold: true, color: [0.85, 0.11, 0.18] };
const ANGLES = [0, 45, 90, -45];

type Picture = PreparedImage & { name: string; url: string };

async function watermark(doc: ReadyDocument, options: WatermarkOptions, picture: Picture | null): Promise<Outcome> {
  const edits = watermarkEdits(doc.info.pages, options);
  const bytes = await engine.transform(doc.info.id, {
    edits: options.content.kind === "image" && picture ? { ...edits, images: [picture.bytes] } : edits,
  });
  const marked = doc.info.pageCount - Math.min(options.from, doc.info.pageCount) + 1;
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "watermarked"),
    detail: `${plural(marked, "page")} watermarked.`,
  };
}

function WatermarkOptionsPanel({ doc, run, working, buttonRef }: ToolProps) {
  const pageCount = doc.info.pageCount;
  const [kind, setKind] = useState<"text" | "image">("text");
  const [text, setText] = useState("CONFIDENTIAL");
  const [style, setStyle] = useState(TEXT_STYLE);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [pictureWidth, setPictureWidth] = useState(50);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [rest, setRest] = useState(DEFAULT_WATERMARK);
  const set = (patch: Partial<typeof rest>) => setRest((current) => ({ ...current, ...patch }));
  const ids = { kind: useId(), text: useId(), opacity: useId(), angle: useId(), picture: useId(), width: useId() };
  useEffect(
    () => () => {
      if (picture) URL.revokeObjectURL(picture.url);
    },
    [picture],
  );

  const options: WatermarkOptions = {
    ...rest,
    content:
      kind === "text"
        ? { kind, text, style }
        : { kind, width: pictureWidth / 100, aspect: picture ? picture.height / picture.width : 1 },
  };
  const shown = Math.min(rest.from, pageCount) - 1;
  const preview = watermarkEdits(doc.info.pages, options).pages.find((entry) => entry.page === shown);
  const ready = kind === "text" ? text.trim() !== "" : picture !== null;
  const missing = kind === "text" ? unsupportedCharacters(text) : [];

  async function pick(file: File) {
    setPictureError(null);
    try {
      const prepared = await prepareImage(file);
      setPicture({ ...prepared, name: file.name, url: URL.createObjectURL(new Blob([prepared.bytes])) });
    } catch {
      setPictureError(`${file.name} couldn't be read as a picture here. Try a JPG or PNG.`);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <fieldset className={panelClass}>
          <legend className="px-1 font-semibold">Watermark</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice name={ids.kind} checked={kind === "text"} onChange={() => setKind("text")} title="Words">
              Like CONFIDENTIAL or DRAFT.
            </Choice>
            <Choice name={ids.kind} checked={kind === "image"} onChange={() => setKind("image")} title="Picture">
              A logo or seal, JPG or PNG.
            </Choice>
          </div>
          {kind === "text" ? (
            <>
              <div>
                <label htmlFor={ids.text} className="font-semibold">
                  Words
                </label>
                <input
                  id={ids.text}
                  type="text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className={fieldClass}
                />
                {missing.length > 0 && (
                  <p className="mt-1 text-sm font-semibold">
                    {missing.join(" ")} can&apos;t be shown in the standard fonts and will be left out.
                  </p>
                )}
              </div>
              <StyleFields style={style} onChange={setStyle} />
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={ids.picture} className="font-semibold">
                  Picture
                </label>
                <input
                  id={ids.picture}
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void pick(file);
                  }}
                  className="mt-1 block w-full text-sm file:mr-3 file:rounded-pill file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-on-primary"
                />
              </div>
              <WholeNumberField
                label="Width (% of the page)"
                value={pictureWidth}
                min={5}
                max={100}
                onChange={setPictureWidth}
              />
            </div>
          )}
          {pictureError && <FailureAlert message={pictureError} />}
        </fieldset>
        <section className={panelClass} aria-label="Look and pages">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={ids.opacity} className="font-semibold">
                See-through
              </label>
              <select
                id={ids.opacity}
                value={rest.opacity}
                onChange={(event) => set({ opacity: Number(event.target.value) })}
                className={fieldClass}
              >
                {[0.15, 0.3, 0.5, 0.75, 1].map((opacity) => (
                  <option key={opacity} value={opacity}>
                    {opacity === 1 ? "Solid" : `${Math.round(opacity * 100)}% strong`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.angle} className="font-semibold">
                Angle
              </label>
              <select
                id={ids.angle}
                value={rest.rotate}
                onChange={(event) => set({ rotate: Number(event.target.value) })}
                className={fieldClass}
              >
                {ANGLES.map((angle) => (
                  <option key={angle} value={angle}>
                    {angle === 0 ? "Level" : angle === 90 ? "Upright (90°)" : `${angle}°`}
                  </option>
                ))}
              </select>
            </div>
            <WholeNumberField
              label="From page"
              value={rest.from}
              min={1}
              max={pageCount}
              onChange={(from) => set({ from })}
            />
          </div>
        </section>
        <section className={`${panelClass} sm:grid sm:grid-cols-[auto_1fr] sm:gap-6 sm:space-y-0`} aria-label="Preview">
          <div className="space-y-3">
            <PositionGrid value={rest.position} onChange={(position) => set({ position })} />
            <WholeNumberField
              label="Margin (points)"
              value={rest.margin}
              min={0}
              max={200}
              onChange={(margin) => set({ margin })}
            />
          </div>
          <div>
            <p className="font-semibold">Page {shown + 1}</p>
            <PagePreview
              docId={doc.info.id}
              index={shown}
              page={doc.info.pages[shown]!}
              marks={preview?.marks ?? []}
              images={picture ? [picture.url] : []}
            />
          </div>
        </section>
      </div>
      <ActionBar
        status={
          working
            ? "Adding the watermark…"
            : !ready
              ? kind === "text"
                ? "Type the words for the watermark."
                : "Choose a picture for the watermark."
              : `On pages ${rest.from}–${pageCount}, over what's there.`
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={working || !ready}
          className={primaryButton}
          onClick={() => run(() => watermark(doc, options, picture))}
        >
          {working ? "Adding…" : "Add watermark"}
        </button>
      </ActionBar>
    </>
  );
}
