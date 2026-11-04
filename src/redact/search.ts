// Finding text to redact: a search (words, or a pattern such as email addresses) run over a page's characters, each
// match coming back as the boxes of the lines it's on. Pure, so it's tested without MuPDF.
import type { Box } from "~/engine/types";

/** A character of a page's text and the box it fills, in points from the shown page's top-left. */
export interface PageChar {
  char: string;
  box: Box;
}

/** What to look for: words typed by the user, or one of the patterns. */
export type SearchQuery =
  { kind: "words"; text: string; matchCase?: boolean; wholeWords?: boolean } | { kind: "pattern"; pattern: PatternId };

export type PatternId = "email" | "phone" | "number" | "date";

/** Patterns for things often redacted, with what the redact tool calls them. */
export const PATTERNS: readonly { id: PatternId; label: string; source: string }[] = [
  { id: "email", label: "Email addresses", source: String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)+` },
  {
    id: "phone",
    label: "Phone numbers",
    // An optional +country code, then at least 7 digits in groups split by spaces, dots, dashes or brackets.
    source: String.raw`(?<![\w+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){1,4}(?![\w])`,
  },
  {
    id: "number",
    label: "Account numbers",
    // Eight or more digits, maybe in groups (card numbers, IBANs' digits, account and ID numbers).
    source: String.raw`(?<![\w])(?:[A-Z]{2}\d{2}[ -]?)?\d{4}(?:[ -]?\d{2,4}){1,7}(?![\w])`,
  },
  {
    id: "date",
    label: "Dates",
    source: String.raw`(?<![\w])(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})(?![\w])`,
  },
];

/**
 * The regular expression for a query, as source and flags (to go to the engine worker), or null for one that can't
 * match anything (no words typed).
 */
export function queryExpression(query: SearchQuery): { source: string; flags: string } | null {
  if (query.kind === "pattern") {
    const pattern = PATTERNS.find((candidate) => candidate.id === query.pattern);
    if (!pattern) return null;
    // Patterns ignore case for their letters (month names, IBAN country codes).
    return { source: pattern.source, flags: pattern.id === "date" || pattern.id === "number" ? "giu" : "gu" };
  }
  const words = query.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  // Words may be split across lines, or by more than one space.
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(String.raw`\s+`);
  const source = query.wholeWords ? String.raw`(?<![\p{L}\p{N}_])${escaped}(?![\p{L}\p{N}_])` : escaped;
  return { source, flags: query.matchCase ? "gu" : "giu" };
}

/** A match: what it says, and a box for each line it's on. */
export interface TextMatch {
  text: string;
  boxes: Box[];
}

/**
 * Runs a regular expression over a page's lines (each a list of characters) and gives each match's boxes. Lines are
 * joined with line breaks, so words searched for are found across a line's end.
 */
export function findMatches(lines: readonly (readonly PageChar[])[], expression: RegExp): TextMatch[] {
  const chars: (PageChar & { line: number })[] = [];
  let text = "";
  lines.forEach((line, i) => {
    if (i > 0) {
      text += "\n";
      chars.push({ char: "\n", box: [0, 0, 0, 0], line: -1 });
    }
    for (const char of line) {
      // A character MuPDF gives as more than one code unit (outside the BMP, or a ligature) maps every unit to it.
      for (let unit = 0; unit < char.char.length; unit++) chars.push({ ...char, line: i });
      text += char.char;
    }
  });
  const global = expression.global ? expression : new RegExp(expression.source, `${expression.flags}g`);
  global.lastIndex = 0;
  const matches: TextMatch[] = [];
  for (const match of text.matchAll(global)) {
    if (match[0].trim() === "") continue;
    const start = match.index;
    const covered = chars.slice(start, start + match[0].length);
    const byLine = new Map<number, Box>();
    for (const { line, box, char } of covered) {
      // Line breaks and spaces have no ink to cover; a space between words in one line is covered by its neighbours.
      if (line < 0 || char.trim() === "") continue;
      const known = byLine.get(line);
      byLine.set(line, known ? union(known, box) : [...box]);
    }
    if (byLine.size === 0) continue;
    matches.push({ text: match[0].replace(/\s+/g, " "), boxes: [...byLine.values()] });
  }
  return matches;
}

export function union(a: Box, b: Box): Box {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Whether two boxes overlap (touching edges don't count). */
export function overlap(a: Box, b: Box): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}
