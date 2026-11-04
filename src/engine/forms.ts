// Interactive (AcroForm) forms: the fields a document's pages have, and filling them in. MuPDF sets a field's value
// and redraws its widgets' appearances, so every reader (and flattening) shows what was filled in.
import * as mupdf from "mupdf";
import { EngineError } from "./errors";
import type { Box, FieldValue, FormField, FormFieldType } from "./types";

const TYPES: Record<string, FormFieldType> = {
  text: "text",
  checkbox: "checkbox",
  radiobutton: "radio",
  combobox: "combobox",
  listbox: "listbox",
  signature: "signature",
  button: "button",
};

/** Every form field widget on every page, in page order and then the page's own order. */
export function formFields(pdf: mupdf.PDFDocument): FormField[] {
  const fields: FormField[] = [];
  for (let index = 0; index < pdf.countPages(); index++) {
    const page = pdf.loadPage(index);
    try {
      const [x0, y0] = page.getBounds();
      page.getWidgets().forEach((widget, i) => {
        const type = TYPES[widget.getFieldType()];
        if (!type) return;
        const [left, top, right, bottom] = widget.getBounds();
        const box: Box = [left - x0, top - y0, right - x0, bottom - y0];
        const field: FormField = {
          page: index,
          index: i,
          name: widget.getName(),
          label: tooltip(widget) || widget.getName(),
          type,
          box,
          value: widget.getValue(),
          readOnly: widget.isReadOnly(),
        };
        if (type === "checkbox" || type === "radio") field.onState = onState(widget);
        if (type === "combobox" || type === "listbox") {
          const labels = widget.getOptions(false);
          const values = widget.getOptions(true);
          field.options = labels.map((label, k) => ({ value: values[k] ?? label, label }));
        }
        if (type === "text") {
          field.multiline = widget.isMultiline();
          field.maxLength = widget.getMaxLen();
          field.password = widget.isPassword();
        }
        fields.push(field);
      });
    } finally {
      page.destroy();
    }
  }
  return fields;
}

/** The field's tooltip (/TU), looked for up its parents, or "". */
function tooltip(widget: mupdf.PDFWidget): string {
  let object = widget.getObject();
  for (let depth = 0; depth < 32 && object.isDictionary(); depth++) {
    const tu = object.get("TU");
    if (tu.isString()) return tu.asString().trim();
    object = object.get("Parent");
  }
  return "";
}

/** The name of a check box's or radio button's "on" appearance: whatever isn't Off. */
function onState(widget: mupdf.PDFWidget): string {
  const states: string[] = [];
  const ap = widget.getObject().get("AP");
  for (const key of ["N", "D"]) {
    const dict = ap.isDictionary() ? ap.get(key) : null;
    if (dict?.isDictionary()) dict.forEach((_, name) => states.push(String(name)));
  }
  return states.find((state) => state !== "Off") ?? "Yes";
}

/** Fills in form fields. Read-only fields, signatures and push buttons are left as they are. */
export function fillFields(pdf: mupdf.PDFDocument, values: readonly FieldValue[]) {
  const byPage = new Map<number, FieldValue[]>();
  for (const value of values) {
    if (!Number.isInteger(value.page) || value.page < 0 || value.page >= pdf.countPages()) {
      throw new EngineError("invalid-argument", `There's no page ${value.page}`);
    }
    byPage.set(value.page, [...(byPage.get(value.page) ?? []), value]);
  }
  for (const [index, pageValues] of byPage) {
    const page = pdf.loadPage(index);
    try {
      const widgets = page.getWidgets();
      for (const { index: i, value } of pageValues) {
        const widget = widgets[i];
        if (!widget) throw new EngineError("invalid-argument", `Page ${index} has no form field ${i}`);
        fill(widget, value);
      }
    } finally {
      page.destroy();
    }
  }
}

function fill(widget: mupdf.PDFWidget, value: string | boolean) {
  if (widget.isReadOnly()) return;
  const type = TYPES[widget.getFieldType()];
  if (type === "text" && typeof value === "string") {
    const max = widget.getMaxLen();
    widget.setTextValue(max > 0 ? Array.from(value).slice(0, max).join("") : value);
  } else if ((type === "combobox" || type === "listbox") && typeof value === "string") {
    widget.setChoiceValue(value);
  } else if (type === "checkbox" && typeof value === "boolean") {
    const on = widget.getValue() !== "Off" && widget.getValue() !== "";
    if (on !== value) widget.toggle();
  } else if (type === "radio" && value === true) {
    // Turning one on turns the others in its group off.
    if (widget.getValue() !== onState(widget)) widget.toggle();
  } else {
    return;
  }
  widget.update();
}
