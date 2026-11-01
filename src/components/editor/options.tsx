// The options that float under the toolbar for the tool in use or the item selected.
import { useId, useState } from "react";
import type { Rgb } from "~/engine/types";
import { FONTS } from "~/editor/fonts";
import {
  fromHex,
  MAX_LINE_WIDTH,
  MAX_TEXT_SIZE,
  MIN_LINE_WIDTH,
  MIN_TEXT_SIZE,
  toHex,
  MAX_INK_WIDTH,
  MIN_INK_WIDTH,
  type InkStyle,
  type MarkupStyle,
  type ShapeStyle,
  type TextStyle,
} from "~/editor/items";
import { TrashIcon } from "./icons";
import { MARKUP_NAMES } from "./MarkupBox";
import { SHAPE_NAMES } from "./ShapeBox";

export const fieldClass =
  "rounded-lg border-2 border-line bg-surface px-2 py-1.5 text-base focus:border-primary focus:outline-none";

/**
 * The floating panel. One row that scrolls sideways on a phone rather than wrapping over the page. With an item
 * selected it ends with Delete.
 */
export function OptionsPanel({
  legend,
  onRemove,
  children,
}: {
  legend: string;
  onRemove: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="absolute inset-x-0 top-full mt-2 min-w-0 rounded-card border border-line bg-surface shadow-sticky">
      <legend className="sr-only">{legend}</legend>
      <div className="flex items-center gap-x-3 overflow-x-auto px-3 py-2 whitespace-nowrap">
        {children}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1 rounded-pill px-3 text-sm font-semibold hover:bg-ink/10"
          >
            <TrashIcon />
            Delete
          </button>
        )}
      </div>
    </fieldset>
  );
}

export function ToggleButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="grid min-w-9 shrink-0 place-items-center rounded-lg border-2 border-line px-1.5 py-1 text-lg hover:border-primary aria-pressed:border-primary aria-pressed:bg-sticky-lavender/40"
    >
      {children}
    </button>
  );
}

export function ColourField({ label, value, onChange }: { label: string; value: Rgb; onChange: (rgb: Rgb) => void }) {
  const id = useId();
  return (
    <span className="flex items-center gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <input
        id={id}
        type="color"
        value={toHex(value)}
        onChange={(event) => onChange(fromHex(event.target.value))}
        className="h-9 w-11 cursor-pointer rounded-lg border-2 border-line bg-surface p-0.5"
      />
    </span>
  );
}

/** A number field that only reports values in range; what's typed shows until it loses focus. */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text ?? String(value)}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value.trim() !== "" && Number.isFinite(next) && next >= min && next <= max) onChange(next);
        }}
        onBlur={() => setText(null)}
        className={`${fieldClass} w-18`}
      />
    </span>
  );
}

/** Font, size, bold, italic and colour for the selected text, or for new text. */
export function TextOptions({
  style,
  onChange,
  onRemove,
}: {
  style: TextStyle;
  onChange: (patch: Partial<TextStyle>) => void;
  onRemove: (() => void) | undefined;
}) {
  const fontId = useId();
  return (
    <OptionsPanel legend="Text options" onRemove={onRemove}>
      <label htmlFor={fontId} className="sr-only">
        Font
      </label>
      <select
        id={fontId}
        value={style.font}
        onChange={(event) => onChange({ font: event.target.value as TextStyle["font"] })}
        className={fieldClass}
      >
        {FONTS.map((font) => (
          <option key={font.id} value={font.id}>
            {font.label}
          </option>
        ))}
      </select>
      <NumberField
        label="Size"
        value={style.size}
        min={MIN_TEXT_SIZE}
        max={MAX_TEXT_SIZE}
        onChange={(size) => onChange({ size })}
      />
      <span className="flex items-center gap-1">
        <ToggleButton label="Bold" pressed={style.bold} onClick={() => onChange({ bold: !style.bold })}>
          <span className="font-bold">B</span>
        </ToggleButton>
        <ToggleButton label="Italic" pressed={style.italic} onClick={() => onChange({ italic: !style.italic })}>
          <span className="font-serif italic">I</span>
        </ToggleButton>
      </span>
      <ColourField label="Colour" value={style.color} onChange={(color) => onChange({ color })} />
    </OptionsPanel>
  );
}

const SHAPES: ShapeStyle["shape"][] = ["rectangle", "ellipse", "line", "arrow"];

/** Which shape, its outline (colour and width) and inside, for the selected shape or new ones. */
export function ShapeOptions({
  style,
  onChange,
  onRemove,
  /** A shape already drawn can't become another kind (a box isn't a line). */
  fixedKind,
}: {
  style: ShapeStyle;
  onChange: (patch: Partial<ShapeStyle>) => void;
  onRemove: (() => void) | undefined;
  fixedKind: boolean;
}) {
  const line = style.shape === "line" || style.shape === "arrow";
  return (
    <OptionsPanel legend="Shape options" onRemove={onRemove}>
      {!fixedKind && (
        <span className="flex items-center gap-1">
          {SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              aria-pressed={style.shape === shape}
              onClick={() => onChange({ shape })}
              className="min-h-9 shrink-0 rounded-lg border-2 border-line px-2.5 text-sm font-semibold hover:border-primary aria-pressed:border-primary aria-pressed:bg-sticky-lavender/40"
            >
              {SHAPE_NAMES[shape]}
            </button>
          ))}
        </span>
      )}
      <ColourField
        label={line ? "Colour" : "Outline"}
        value={style.stroke ?? [0, 0, 0]}
        onChange={(stroke) => onChange({ stroke })}
      />
      {!line && (
        <ToggleButton
          label="No outline"
          pressed={style.stroke === null}
          onClick={() => onChange({ stroke: style.stroke ? null : [0, 0, 0] })}
        >
          <span className="text-sm">None</span>
        </ToggleButton>
      )}
      <NumberField
        label="Width"
        value={style.lineWidth}
        min={MIN_LINE_WIDTH}
        max={MAX_LINE_WIDTH}
        step={0.5}
        onChange={(lineWidth) => onChange({ lineWidth })}
      />
      {!line && (
        <>
          <ToggleButton
            label="Fill"
            pressed={style.fill !== null}
            onClick={() => onChange({ fill: style.fill ? null : [1, 0.83, 0.23] })}
          >
            <span className="text-sm">Fill</span>
          </ToggleButton>
          {style.fill && <ColourField label="Fill colour" value={style.fill} onChange={(fill) => onChange({ fill })} />}
        </>
      )}
    </OptionsPanel>
  );
}

/** The cover colour of whiteout: white, or the colour of the page it covers. */
export function WhiteoutOptions({
  color,
  onChange,
  onRemove,
}: {
  color: Rgb;
  onChange: (color: Rgb) => void;
  onRemove: (() => void) | undefined;
}) {
  return (
    <OptionsPanel legend="Whiteout options" onRemove={onRemove}>
      <ColourField label="Cover colour" value={color} onChange={onChange} />
      <p className="text-sm text-ink-muted">Covers what&apos;s underneath. It isn&apos;t removed from the file.</p>
    </OptionsPanel>
  );
}

const MARKUP_STYLES: MarkupStyle[] = ["highlight", "underline", "strikeout"];

/** Highlight, underline or strike out, and the colour, for the selected markup or new markup. */
export function MarkupOptions({
  style,
  color,
  onStyle,
  onColour,
  onRemove,
}: {
  style: MarkupStyle;
  color: Rgb;
  onStyle: (style: MarkupStyle) => void;
  onColour: (color: Rgb) => void;
  onRemove: (() => void) | undefined;
}) {
  return (
    <OptionsPanel legend="Markup options" onRemove={onRemove}>
      <span className="flex items-center gap-1">
        {MARKUP_STYLES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={style === option}
            onClick={() => onStyle(option)}
            className="min-h-9 shrink-0 rounded-lg border-2 border-line px-2.5 text-sm font-semibold hover:border-primary aria-pressed:border-primary aria-pressed:bg-sticky-lavender/40"
          >
            {MARKUP_NAMES[option]}
          </button>
        ))}
      </span>
      <ColourField label="Colour" value={color} onChange={onColour} />
    </OptionsPanel>
  );
}

/** Colour, thickness and see-through for the selected stroke or new ones. */
export function InkOptions({
  style,
  onChange,
  onRemove,
}: {
  style: InkStyle;
  onChange: (patch: Partial<InkStyle>) => void;
  onRemove: (() => void) | undefined;
}) {
  return (
    <OptionsPanel legend="Drawing options" onRemove={onRemove}>
      <ColourField label="Colour" value={style.color} onChange={(color) => onChange({ color })} />
      <NumberField
        label="Thickness"
        value={style.width}
        min={MIN_INK_WIDTH}
        max={MAX_INK_WIDTH}
        step={0.5}
        onChange={(width) => onChange({ width })}
      />
      <ToggleButton
        label="See-through, like a highlighter"
        pressed={style.opacity < 1}
        onClick={() => onChange({ opacity: style.opacity < 1 ? 1 : 0.5 })}
      >
        <span className="text-sm">See-through</span>
      </ToggleButton>
    </OptionsPanel>
  );
}
