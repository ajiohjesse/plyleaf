// Document information as people read it. Pure, so it's unit-tested.
import type { MetadataField } from "~/engine/types";

/** The fields people edit, with what they mean. Dates are shown, not edited. */
export const EDITABLE_FIELDS: { field: MetadataField; label: string; hint?: string }[] = [
  { field: "Title", label: "Title", hint: "Shown in the browser tab or window title instead of the file name." },
  { field: "Author", label: "Author" },
  { field: "Subject", label: "Subject" },
  { field: "Keywords", label: "Keywords", hint: "Separated by commas." },
  { field: "Creator", label: "Made with", hint: "The app the document was written in." },
  { field: "Producer", label: "Converted to PDF by", hint: "The app that made the PDF." },
];

/**
 * A PDF date ("D:20250102030405+01'00'", most parts optional) as a Date, or null if it isn't one. A time without an
 * offset is taken as UTC, as most writers mean it.
 */
export function parsePdfDate(value: string): Date | null {
  const match = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?'?$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const [
    ,
    year,
    month = "01",
    day = "01",
    hour = "00",
    minute = "00",
    second = "00",
    sign,
    offsetH = "00",
    offsetM = "00",
  ] = match;
  const utc = Date.UTC(+year!, +month - 1, +day, +hour, +minute, +second);
  if (Number.isNaN(utc)) return null;
  const offset = (sign === "+" ? 1 : sign === "-" ? -1 : 0) * (+offsetH * 60 + +offsetM);
  return new Date(utc - offset * 60_000);
}

/** A PDF date for people, in their locale, or the raw value when it can't be read. */
export function formatPdfDate(value: string, locale?: string): string {
  const date = parsePdfDate(value);
  return date ? date.toLocaleString(locale, { dateStyle: "long", timeStyle: "short" }) : value;
}
