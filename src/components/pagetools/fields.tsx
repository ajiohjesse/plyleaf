// Pieces the page tools share: where on the page, how the text looks, which pages, and a preview of a page with it.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { LINE_HEIGHT, type Mark, type PageInfo } from "~/engine/types";
import { cssFont, FONTS } from "~/editor/fonts";
import { fromHex, toHex } from "~/editor/items";
import type { Horizontal, Position, TextStyle, Vertical } from "~/pagetools/stamping";
import { thumbnails } from "~/thumbnails/thumbnails";
import { baselineRatio } from "~/components/editor/measure";
import { PageCanvas } from "~/components/thumbnails/PageCanvas";

const VERTICALS: Vertical[] = ["top", "middle", "bottom"];
const HORIZONTALS: Horizontal[] = ["left", "center", "right"];
const NAMES = { top: "Top", middle: "Middle", bottom: "Bottom", left: "left", center: "centre", right: "right" };

export const fieldClass =
  "mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none";
export const panelClass = "space-y-3 rounded-card border border-line bg-surface p-4";

/** Nine places on a page as a grid of radio buttons, laid out like the page. `rows` leaves some out. */
export function PositionGrid({
  value,
  onChange,
  rows = VERTICALS,
}: {
  value: Position;
  onChange: (position: Position) => void;
  rows?: readonly Vertical[];
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="font-semibold">Position</legend>
      <div className="mt-2 grid w-36 grid-cols-3 gap-1.5 rounded-lg border-2 border-line bg-surface-band p-1.5">
        {rows.map((vertical) =>
          HORIZONTALS.map((horizontal) => (
            <label
              key={`${vertical}-${horizontal}`}
              className="relative grid h-9 cursor-pointer place-items-center rounded-md bg-surface ring-1 ring-line has-checked:bg-primary has-checked:ring-primary has-focus-visible:outline-3 has-focus-visible:outline-primary"
            >
              {/* Invisible but filling the cell, so a press anywhere on it (by finger or test) lands on the radio. */}
              <input
                type="radio"
                name={name}
                className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0"
                aria-label={`${NAMES[vertical]} ${NAMES[horizontal]}`}
                checked={value.vertical === vertical && value.horizontal === horizontal}
                onChange={() => onChange({ vertical, horizontal })}
              />
              <span aria-hidden="true" className="pointer-events-none h-1 w-4 rounded-full bg-ink-muted/60" />
            </label>
          )),
        )}
      </div>
    </fieldset>
  );
}

/** Font, size, bold and colour. */
export function StyleFields({ style, onChange }: { style: TextStyle; onChange: (style: TextStyle) => void }) {
  const ids = { font: useId(), size: useId(), colour: useId() };
  const [sizeText, setSizeText] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor={ids.font} className="font-semibold">
          Font
        </label>
        <select
          id={ids.font}
          value={style.font}
          onChange={(event) => onChange({ ...style, font: event.target.value as TextStyle["font"] })}
          className={fieldClass}
        >
          {FONTS.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={ids.size} className="font-semibold">
          Size
        </label>
        <input
          id={ids.size}
          type="number"
          inputMode="numeric"
          min={4}
          max={200}
          value={sizeText ?? String(style.size)}
          onChange={(event) => {
            setSizeText(event.target.value);
            const size = Number(event.target.value);
            if (event.target.value.trim() && size >= 4 && size <= 200) onChange({ ...style, size });
          }}
          onBlur={() => setSizeText(null)}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor={ids.colour} className="font-semibold">
          Colour
        </label>
        <input
          id={ids.colour}
          type="color"
          value={toHex(style.color)}
          onChange={(event) => onChange({ ...style, color: fromHex(event.target.value) })}
          className="mt-1 block h-11 w-full cursor-pointer rounded-lg border-2 border-line bg-surface p-1"
        />
      </div>
      <label className="flex items-end gap-2 pb-2.5 font-semibold">
        <input
          type="checkbox"
          checked={style.bold}
          onChange={(event) => onChange({ ...style, bold: event.target.checked })}
          className="size-5 accent-primary"
        />
        Bold
      </label>
    </div>
  );
}

/** A whole-number field that only reports values in range; what's typed shows until it loses focus. */
export function WholeNumberField({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={text ?? String(value)}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value.trim() && Number.isInteger(next) && next >= min && next <= max) onChange(next);
        }}
        onBlur={() => setText(null)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={fieldClass}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Previews are at most this wide (CSS pixels). */
const PREVIEW_WIDTH = 340;

/**
 * A page with marks drawn over it the way the engine will draw them: text by its baseline, aligned, turned and see-
 * through as asked, in the browser's stand-in for its standard font.
 */
export function PagePreview({
  docId,
  index,
  page,
  marks,
  images = [],
}: {
  docId: string;
  index: number;
  page: PageInfo;
  marks: readonly Mark[];
  /** URLs of the images image marks draw, by index. */
  images?: readonly string[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(PREVIEW_WIDTH);
  useLayoutEffect(() => {
    const element = wrapRef.current!;
    const measure = () => setAvailable(Math.max(1, Math.min(PREVIEW_WIDTH, element.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => thumbnails.forget(docId), [docId]);
  const scale = Math.min(available / page.width, (PREVIEW_WIDTH * 1.3) / page.height);
  const width = Math.round(page.width * scale);
  const height = Math.round(page.height * scale);

  return (
    <div ref={wrapRef} className="grid place-items-center rounded-lg bg-surface-band p-3">
      <div
        className="relative overflow-hidden bg-surface shadow-sticky ring-1 ring-line"
        style={{ width, height }}
        data-preview
      >
        <PageCanvas docId={docId} index={index} width={width} onScreen />
        {marks.map((mark, i) => {
          if (mark.type === "text") {
            const font = cssFont(mark.font, mark.bold, mark.italic);
            const ascent = baselineRatio(font) * mark.size * scale;
            const shift = mark.align === "center" ? "-50%" : mark.align === "right" ? "-100%" : "0";
            const origin = mark.align === "center" ? "50%" : mark.align === "right" ? "100%" : "0";
            return (
              <span
                key={i}
                aria-hidden="true"
                className="pointer-events-none absolute whitespace-pre"
                style={{
                  left: mark.x * scale,
                  top: mark.y * scale - ascent,
                  fontSize: mark.size * scale,
                  lineHeight: LINE_HEIGHT,
                  color: toHex(mark.color),
                  opacity: mark.opacity ?? 1,
                  ...font,
                  transform: `translateX(${shift}) rotate(${-(mark.rotate ?? 0)}deg)`,
                  transformOrigin: `${origin} ${ascent}px`,
                }}
              >
                {mark.text}
              </span>
            );
          }
          if (mark.type === "image" && images[mark.image]) {
            return (
              <img
                key={i}
                src={images[mark.image]}
                alt=""
                className="pointer-events-none absolute"
                style={{
                  left: mark.x * scale,
                  top: mark.y * scale,
                  width: mark.width * scale,
                  height: mark.height * scale,
                  opacity: mark.opacity ?? 1,
                  transform: `rotate(${-(mark.rotate ?? 0)}deg)`,
                }}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
