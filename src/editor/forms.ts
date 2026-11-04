// Filling in a PDF's interactive form: the values the user has given, by field name (a field's widgets share one),
// and the engine's field values for those that changed.
import type { FieldValue, FormField } from "~/engine/types";

/** A text or choice field's text or option, a check box's tick, a radio group's chosen state ("Off" for none). */
export type FieldInput = string | boolean;

/** Fields the user can fill in here. Signatures and push buttons aren't values; read-only fields stay as they are. */
export const fillable = (field: FormField) => !field.readOnly && field.type !== "signature" && field.type !== "button";

/** A field's value as the file has it. */
export function startingValue(field: FormField): FieldInput {
  if (field.type === "checkbox") return field.value !== "Off" && field.value !== "";
  if (field.type === "radio") return field.value || "Off";
  return field.value;
}

/** What a field shows now: what the user gave it, or what the file has. */
export const currentValue = (field: FormField, values: ReadonlyMap<string, FieldInput>): FieldInput =>
  values.get(field.name) ?? startingValue(field);

/** The names of the fields the user changed. */
export function changedFields(fields: readonly FormField[], values: ReadonlyMap<string, FieldInput>): string[] {
  const changed = new Set<string>();
  for (const field of fields) {
    if (!fillable(field)) continue;
    const value = values.get(field.name);
    if (value !== undefined && value !== startingValue(field)) changed.add(field.name);
  }
  return [...changed];
}

/**
 * The engine's values for the changed fields, one per widget: the same text for each of a text field's widgets, and
 * for a radio group, the button that's now on.
 */
export function fieldEdits(fields: readonly FormField[], values: ReadonlyMap<string, FieldInput>): FieldValue[] {
  const changed = new Set(changedFields(fields, values));
  return fields.flatMap((field): FieldValue[] => {
    if (!changed.has(field.name) || !fillable(field)) return [];
    const value = values.get(field.name)!;
    const { page, index } = field;
    if (field.type === "radio") return value === field.onState ? [{ page, index, value: true }] : [];
    if (field.type === "checkbox") return [{ page, index, value: value === true }];
    return [{ page, index, value: String(value) }];
  });
}
