import { unzipSync } from "fflate";
import { expect, test } from "vitest";
import { describeRange, everyN, parseRanges, rangeLength } from "~/organize/ranges";
import { partNames, zipFiles } from "~/organize/split";

const ok = (text: string, pageCount = 10) => {
  const result = parseRanges(text, pageCount);
  if (!result.ok) throw new Error(result.error);
  return result.ranges.map(({ first, last }) => [first, last]);
};
const error = (text: string, pageCount = 10) => {
  const result = parseRanges(text, pageCount);
  if (result.ok) throw new Error(`"${text}" parsed`);
  return result.error;
};

test("reads single pages, runs and open-ended runs, in the order typed", () => {
  expect(ok("1-3, 5, 8-")).toEqual([
    [1, 3],
    [5, 5],
    [8, 10],
  ]);
  expect(ok("-3")).toEqual([[1, 3]]);
  expect(ok("10")).toEqual([[10, 10]]);
  // Overlaps and repeats are kept: each range is its own part.
  expect(ok("4-6,1-5,4-6")).toEqual([
    [4, 6],
    [1, 5],
    [4, 6],
  ]);
});

test("takes any separator and dash people type", () => {
  expect(ok(" 1 - 3 ;5\n7 – 8  9—10 ")).toEqual([
    [1, 3],
    [5, 5],
    [7, 8],
    [9, 10],
  ]);
  expect(ok("2 -")).toEqual([[2, 10]]);
});

test("explains what's wrong", () => {
  expect(error("")).toBe("Type the pages, like 1-3, 5.");
  expect(error(" , ")).toBe("Type the pages, like 1-3, 5.");
  expect(error("1-3, a")).toBe("“a” isn't a page or a range, like 1-3.");
  expect(error("1-2-3")).toBe("“1-2-3” isn't a page or a range, like 1-3.");
  expect(error("-")).toBe("“-” isn't a page or a range, like 1-3.");
  expect(error("0-2")).toBe("Pages start at 1.");
  expect(error("4-12")).toBe("This file has 10 pages, so there's no page 12.");
  expect(error("2", 1)).toBe("This file has 1 page, so there's no page 2.");
  expect(error("5-3")).toBe("“5-3” goes backwards. Try 3-5.");
});

test("splits every N pages, the last part taking what's left", () => {
  expect(everyN(3, 10).map(({ first, last }) => [first, last])).toEqual([
    [1, 3],
    [4, 6],
    [7, 9],
    [10, 10],
  ]);
  expect(everyN(1, 2)).toEqual([
    { first: 1, last: 1 },
    { first: 2, last: 2 },
  ]);
  expect(everyN(20, 10)).toEqual([{ first: 1, last: 10 }]);
});

test("describes ranges", () => {
  expect(describeRange({ first: 4, last: 4 })).toBe("page 4");
  expect(describeRange({ first: 1, last: 3 })).toBe("pages 1–3");
  expect(rangeLength({ first: 2, last: 6 })).toBe(5);
});

test("names each part after its pages, never twice the same", () => {
  expect(
    partNames("Q3 report.pdf", [
      { first: 1, last: 3 },
      { first: 5, last: 5 },
      { first: 1, last: 3 },
      { first: 1, last: 3 },
    ]),
  ).toEqual([
    "Q3 report-pages-1-3.pdf",
    "Q3 report-page-5.pdf",
    "Q3 report-pages-1-3-2.pdf",
    "Q3 report-pages-1-3-3.pdf",
  ]);
});

test("zips files as they are", () => {
  const a = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);
  const b = new Uint8Array(5000).fill(7);
  const zip = zipFiles([
    { name: "a.pdf", bytes: a },
    { name: "b.pdf", bytes: b },
  ]);
  // Stored, not deflated: the zip is bigger than its contents.
  expect(zip.byteLength).toBeGreaterThan(a.byteLength + b.byteLength);
  const files = unzipSync(zip);
  expect(Object.keys(files)).toEqual(["a.pdf", "b.pdf"]);
  expect(files["a.pdf"]).toEqual(a);
  expect(files["b.pdf"]).toEqual(b);
});
