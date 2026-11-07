import { describe, expect, test } from "vitest";
import { alreadyRedacted, redactionOver, toEdits, type Item } from "~/editor/items";
import { findMatches, queryExpression, type PageChar, type SearchQuery } from "~/redact/search";

/** A line of characters 6 points wide each, from x = 0, on a line `row` (12 points tall). */
const line = (text: string, row = 0): PageChar[] =>
  Array.from(text, (char, i) => ({ char, box: [i * 6, row * 12, i * 6 + 6, row * 12 + 12] }));

function found(lines: string[], query: SearchQuery) {
  const expression = queryExpression(query)!;
  return findMatches(
    lines.map((text, row) => line(text, row)),
    new RegExp(expression.source, expression.flags),
  );
}

describe("search to redact", () => {
  test("words, across a line's end, and each line's own box", () => {
    const [match] = found(["Paid to Ada", "Lovelace on Monday"], { kind: "words", text: "ada lovelace" });
    expect(match!.text).toBe("Ada Lovelace");
    expect(match!.boxes).toEqual([
      [48, 0, 66, 12],
      [0, 12, 48, 24],
    ]);
  });

  test("typed words are matched literally, not as a pattern", () => {
    expect(found(["costs $5.00 (or 5x00)"], { kind: "words", text: "5.00 (or" })).toHaveLength(1);
    expect(found(["5x00"], { kind: "words", text: "5.00" })).toEqual([]);
    expect(queryExpression({ kind: "words", text: "   " })).toBeNull();
  });

  test("whole words and case", () => {
    expect(found(["Anna and Ann"], { kind: "words", text: "ann", wholeWords: true }).map((m) => m.text)).toEqual([
      "Ann",
    ]);
    expect(found(["Anna and Ann"], { kind: "words", text: "ann", matchCase: true })).toEqual([]);
  });

  test.each([
    ["email", "Write to ada.l+pdf@mail.example.co.uk today", ["ada.l+pdf@mail.example.co.uk"]],
    ["phone", "Call +44 20 7946 0958 or (555) 123-4567, room 12", ["+44 20 7946 0958", "(555) 123-4567"]],
    [
      "number",
      "Card 4111 1111 1111 1111, IBAN GB82 WEST 1234 5698 7654 32, ref 12",
      ["4111 1111 1111 1111", "1234 5698 7654 32"],
    ],
    [
      "date",
      "Born 12/03/1990, signed 2026-11-04 and 4 November 2026, or Nov 4, 2026",
      ["12/03/1990", "2026-11-04", "4 November 2026", "Nov 4, 2026"],
    ],
  ] as const)("%s pattern", (pattern, text, expected) => {
    expect(found([text], { kind: "pattern", pattern }).map((m) => m.text)).toEqual(expected);
  });

  test("a redaction over found text is padded, kept on the page, and not made twice", () => {
    const item = redactionOver(0, [0.5, 10, 50, 22], { width: 100, height: 100 }, "Ada");
    expect(item).toMatchObject({ kind: "redact", x: 0, y: 9, width: 51, height: 14, text: "Ada" });
    expect(alreadyRedacted([item], 0, [0.5, 10, 50, 22])).toBe(true);
    expect(alreadyRedacted([item], 1, [0.5, 10, 50, 22])).toBe(false);
    expect(alreadyRedacted([item], 0, [0.5, 10, 60, 22])).toBe(false);
  });

  test("redactions become each page's redact boxes", () => {
    const items: Item[] = [
      { id: "a", kind: "redact", page: 1, x: 10, y: 20, width: 30, height: 40 },
      { id: "b", kind: "whiteout", page: 1, x: 0, y: 0, width: 5, height: 5, color: [1, 1, 1] },
    ];
    const edits = toEdits(items);
    expect(edits.pages).toHaveLength(1);
    expect(edits.pages[0]!.redact).toEqual([[10, 20, 40, 60]]);
    expect(edits.pages[0]!.marks).toHaveLength(1);
  });
});
