// A PDF's interactive form fields, over its rendered page: real inputs the user fills in (text, check boxes, radio
// buttons, choices), and a "Sign here" button on each empty signature field. What's filled in goes into the fields
// themselves when the PDF is saved.
import { memo } from "react";
import type { FormField } from "~/engine/types";
import { currentValue, type FieldInput } from "~/editor/forms";

/**
 * Fields are drawn on the page in the PDF's own colours, so they're the page's white with a pale blue tint (as most
 * readers mark fields), opaque so the value the file had doesn't show through.
 */
const FIELD_BACKGROUND = "color-mix(in srgb, #3d4ef5 10%, #ffffff)";

interface Props {
  fields: readonly FormField[];
  values: ReadonlyMap<string, FieldInput>;
  /** CSS pixels per point. */
  scale: number;
  /** With another tool in use, the fields are shown but don't take presses or focus. */
  active: boolean;
  /** Keeps radio groups of different documents apart. */
  group: string;
  onChange: (name: string, value: FieldInput) => void;
  onSign: (field: FormField) => void;
}

export const FormFields = memo(function FormFields({ fields, values, scale, active, group, onChange, onSign }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0" inert={!active} data-form-fields>
      {fields.map((field) => {
        if (field.readOnly || field.type === "button") return null;
        if (field.type === "signature" && field.value !== "") return null;
        const [x0, y0, x1, y1] = field.box;
        const box: React.CSSProperties = {
          position: "absolute",
          left: x0 * scale,
          top: y0 * scale,
          width: Math.max(1, (x1 - x0) * scale),
          height: Math.max(1, (y1 - y0) * scale),
        };
        const key = `${field.page}:${field.index}`;
        return (
          <div key={key} style={box} className="pointer-events-auto" data-field={field.name}>
            <Field
              field={field}
              value={currentValue(field, values)}
              scale={scale}
              group={group}
              {...{ onChange, onSign }}
            />
          </div>
        );
      })}
    </div>
  );
});

function Field({
  field,
  value,
  scale,
  group,
  onChange,
  onSign,
}: {
  field: FormField;
  value: FieldInput;
  scale: number;
  group: string;
  onChange: (name: string, value: FieldInput) => void;
  onSign: (field: FormField) => void;
}) {
  const height = (field.box[3] - field.box[1]) * scale;
  const control = "block size-full min-w-0 border-0 text-black outline-1 -outline-offset-1 outline-primary/50";
  const style = { background: FIELD_BACKGROUND };
  // Text sized to the field, as readers size "auto" text, but never larger than 12 points.
  const fontSize = Math.max(6, Math.min(12, (height / scale) * 0.62)) * scale;

  if (field.type === "signature") {
    return (
      <button
        type="button"
        onClick={() => onSign(field)}
        className="grid size-full place-items-center rounded-sm border-2 border-dashed border-primary bg-primary/10 text-primary hover:bg-primary/20"
        style={{ fontSize: Math.max(10, Math.min(14, height * 0.4)) }}
      >
        <span className="font-semibold">Sign here</span>
        <span className="sr-only">: {field.label}</span>
      </button>
    );
  }
  if (field.type === "checkbox" || field.type === "radio") {
    const on = field.type === "checkbox" ? value === true : value === field.onState;
    return (
      <label className="grid size-full cursor-pointer place-items-center" style={style}>
        <input
          type={field.type}
          name={field.type === "radio" ? `${group}:${field.name}` : undefined}
          aria-label={field.type === "radio" ? `${field.label}: ${field.onState}` : field.label}
          checked={on}
          onChange={(event) => onChange(field.name, field.type === "checkbox" ? event.target.checked : field.onState!)}
          className="m-0 accent-black"
          style={{ width: "80%", height: "80%" }}
        />
      </label>
    );
  }
  if (field.type === "combobox" || field.type === "listbox") {
    return (
      <select
        aria-label={field.label}
        value={String(value)}
        size={field.type === "listbox" ? Math.max(2, field.options?.length ?? 2) : undefined}
        onChange={(event) => onChange(field.name, event.target.value)}
        className={`${control} px-1`}
        style={{ ...style, fontSize }}
      >
        {field.type === "combobox" && <option value="">{value === "" ? "" : "(none)"}</option>}
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  const common = {
    "aria-label": field.label,
    value: String(value),
    maxLength: field.maxLength ? field.maxLength : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(field.name, event.target.value),
    className: `${control} px-[0.2em]`,
    style: { ...style, fontSize: field.multiline ? Math.min(fontSize, 10 * scale) : fontSize },
    spellCheck: false,
  };
  return field.multiline ? (
    <textarea {...common} className={`${common.className} resize-none py-[0.1em] leading-tight`} />
  ) : (
    <input type={field.password ? "password" : "text"} autoComplete="off" {...common} />
  );
}
