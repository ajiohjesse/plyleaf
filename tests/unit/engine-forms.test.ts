import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { describe as describeDoc, formFields, openPdf, transform } from "~/engine/ops";
import type { FieldValue, FormField } from "~/engine/types";
import { FORM_FIELDS, interactiveFormPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const opened: mupdf.PDFDocument[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});
const open = (bytes: Uint8Array) => {
  const doc = openPdf(bytes);
  opened.push(doc);
  return doc;
};

const byName = (fields: FormField[], name: string) => fields.filter((field) => field.name === name);
/** A value for the (first) widget of field `name`, or the radio button whose on state is `name`'s value. */
function valueFor(fields: FormField[], name: string, value: string | boolean): FieldValue {
  const widget =
    typeof value === "string" && byName(fields, name)[0]?.type === "radio"
      ? byName(fields, name).find((field) => field.onState === value)!
      : byName(fields, name)[0]!;
  return { page: widget.page, index: widget.index, value: widget.type === "radio" ? true : value };
}

test("lists each widget with its kind, place, value and options", () => {
  const fields = formFields(open(interactiveFormPdf()));
  expect(fields.map((field) => [field.name, field.type])).toEqual([
    ["name", "text"],
    ["notes", "text"],
    ["ref", "text"],
    ["agree", "checkbox"],
    ["size", "radio"],
    ["size", "radio"],
    ["size", "radio"],
    ["country", "combobox"],
    ["colour", "listbox"],
    ["sig", "signature"],
  ]);
  const [name, notes, ref, agree, small] = fields;
  expect(name).toMatchObject({ label: "Full name", value: "", multiline: false, readOnly: false, maxLength: 0 });
  expect(name!.box).toEqual(FORM_FIELDS.name);
  expect(notes).toMatchObject({ multiline: true });
  expect(ref).toMatchObject({ value: "R-1", readOnly: true });
  expect(agree).toMatchObject({ value: "Off", onState: "Yes" });
  expect(byName(fields, "size").map((field) => field.onState)).toEqual(["S", "M", "L"]);
  expect(small!.box).toEqual(FORM_FIELDS.sizeS);
  expect(byName(fields, "country")[0]!.options).toEqual([
    { value: "Ghana", label: "Ghana" },
    { value: "Nigeria", label: "Nigeria" },
    { value: "Kenya", label: "Kenya" },
  ]);
  expect(byName(fields, "colour")[0]!.options).toEqual([
    { value: "r", label: "Red" },
    { value: "g", label: "Green" },
    { value: "b", label: "Blue" },
  ]);
});

test("fills in every kind of field, and other readers see the values", async () => {
  const doc = open(interactiveFormPdf());
  const fields = formFields(doc);
  const output = transform(doc, {
    edits: {
      pages: [],
      fields: [
        valueFor(fields, "name", "Ama Ørsted-Kwarteng"),
        valueFor(fields, "notes", "First line\nSecond line"),
        valueFor(fields, "agree", true),
        valueFor(fields, "size", "M"),
        valueFor(fields, "country", "Kenya"),
        valueFor(fields, "colour", "g"),
        // Read-only: left as it is.
        valueFor(fields, "ref", "changed"),
      ],
    },
  });
  expect(await qpdfCheck(output)).toBe(0);
  const filled = formFields(open(output));
  const value = (name: string) => byName(filled, name)[0]!.value;
  expect(value("name")).toBe("Ama Ørsted-Kwarteng");
  expect(value("notes")).toBe("First line\nSecond line");
  expect(value("agree")).toBe("Yes");
  expect(byName(filled, "size").map((field) => field.value)).toEqual(["M", "M", "M"]);
  expect(value("country")).toBe("Kenya");
  expect(value("colour")).toBe("g");
  expect(value("ref")).toBe("R-1");
  // The widgets' appearances show the values (text extraction leaves widgets out, so they're drawn in first).
  const shown = open(output);
  shown.bake(true, true);
  const text = shown.loadPage(0).toStructuredText("").asText();
  expect(text).toContain("Ama Ørsted-Kwarteng");
  expect(text).toContain("Kenya");
});

test("a check box can be turned off again, and a radio choice moves", () => {
  const doc = open(interactiveFormPdf());
  const fields = formFields(doc);
  const once = open(
    transform(doc, { edits: { pages: [], fields: [valueFor(fields, "agree", true), valueFor(fields, "size", "S")] } }),
  );
  const again = formFields(once);
  const twice = formFields(
    open(
      transform(once, {
        edits: { pages: [], fields: [valueFor(again, "agree", false), valueFor(again, "size", "L")] },
      }),
    ),
  );
  expect(byName(twice, "agree")[0]!.value).toBe("Off");
  expect(byName(twice, "size")[0]!.value).toBe("L");
});

test("filled and flattened: the values are part of the page and the fields are gone", async () => {
  const doc = open(interactiveFormPdf());
  const fields = formFields(doc);
  const output = transform(doc, {
    edits: { pages: [], fields: [valueFor(fields, "name", "Kofi Mensah"), valueFor(fields, "agree", true)] },
    flatten: "all",
  });
  expect(await qpdfCheck(output)).toBe(0);
  const flat = open(output);
  expect(describeDoc(flat)).toMatchObject({ formFields: 0 });
  const page = flat.loadPage(0);
  expect(page.toStructuredText("").asText()).toContain("Kofi Mensah");
  // The check box's filled square is drawn: dark pixels in the middle of its box.
  const pixmap = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, false);
  const [x0, y0] = FORM_FIELDS.agree;
  expect(pixmap.getPixels()[(y0 + 8) * pixmap.getStride() + x0 + 8]).toBeLessThan(60);
  // The empty signature field leaves nothing behind (no "sign here" flag).
  const [sx0, sy0, sx1, sy1] = FORM_FIELDS.sig;
  for (let y = sy0; y < sy1; y += 2) {
    for (let x = sx0; x < sx1; x += 2) expect(pixmap.getPixels()[y * pixmap.getStride() + x]).toBe(255);
  }
  pixmap.destroy();
});

test("a field that isn't on the page is refused", () => {
  const doc = open(interactiveFormPdf());
  expect(() => transform(doc, { edits: { pages: [], fields: [{ page: 0, index: 99, value: "x" }] } })).toThrow(
    /no form field/,
  );
  expect(() => transform(doc, { edits: { pages: [], fields: [{ page: 3, index: 0, value: "x" }] } })).toThrow(
    /no page/,
  );
});
