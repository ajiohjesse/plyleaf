// Dates for the editor's date tool: today's date written the way the user's language writes it, or as ISO 8601.

export type DateFormat = "numeric" | "long" | "iso";

export const DATE_FORMATS: readonly DateFormat[] = ["numeric", "long", "iso"];

/**
 * `date` as text. "numeric": day, month and year in figures, in the order `locale` uses (04/11/2026, 11/04/2026);
 * "long": with the month's name (4 November 2026); "iso": 2026-11-04. Figures are always 0–9, which the standard
 * fonts have.
 */
export function formatDate(date: Date, format: DateFormat, locale?: string): string {
  if (format === "iso") {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const options: Intl.DateTimeFormatOptions =
    format === "numeric"
      ? { day: "2-digit", month: "2-digit", year: "numeric", numberingSystem: "latn" }
      : { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" };
  return new Intl.DateTimeFormat(locale, options).format(date);
}
