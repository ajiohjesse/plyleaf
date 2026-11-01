import { expect, test } from "vitest";
import { pageNumberEdits, DEFAULT_NUMBERS } from "~/pagetools/numbers";
import { DEFAULT_STYLE, fillTokens, marksOnPages, placedText } from "~/pagetools/stamping";

const PAGE = { width: 600, height: 800 };

test("text goes in from the page's edges by the margin, aligned to its side", () => {
  const style = { ...DEFAULT_STYLE, size: 10 };
  const topLeft = placedText(PAGE, { vertical: "top", horizontal: "left" }, 20, style, "A");
  expect([topLeft.x, topLeft.y, topLeft.align]).toEqual([20, 27.2, "left"]);
  const bottomRight = placedText(PAGE, { vertical: "bottom", horizontal: "right" }, 20, style, "A");
  expect([bottomRight.x, bottomRight.y, bottomRight.align]).toEqual([580, 777.8, "right"]);
  const middle = placedText(PAGE, { vertical: "middle", horizontal: "center" }, 20, style, "A");
  expect([middle.x, middle.y, middle.align]).toEqual([300, 403.6, "center"]);
});

test("tokens are filled, others left as typed", () => {
  expect(
    fillTokens("{page} of {pages} · {file} · {date} · {other}", { page: 2, pages: 9, file: "a.pdf", date: "d" }),
  ).toBe("2 of 9 · a.pdf · d · {other}");
});

test("pages from a page on are counted from the first number", () => {
  const pages = [PAGE, PAGE, PAGE, PAGE];
  const counted = marksOnPages(pages, { from: 2, startAt: 1 }, (_, count, last) => [
    { ...placedText(PAGE, DEFAULT_NUMBERS.position, 0, DEFAULT_STYLE, `${count}/${last}`) },
  ]);
  expect(counted.pages.map(({ page, marks }) => [page, (marks[0] as { text: string }).text])).toEqual([
    [1, "1/3"],
    [2, "2/3"],
    [3, "3/3"],
  ]);
  // A start past the end still numbers the last page.
  expect(marksOnPages(pages, { from: 9, startAt: 5 }, () => []).pages.map((entry) => entry.page)).toEqual([3]);
});

test("page numbers in a format, on every page", () => {
  const edits = pageNumberEdits([PAGE, { width: 300, height: 400 }], {
    ...DEFAULT_NUMBERS,
    style: DEFAULT_STYLE,
    template: "Page {page} of {pages}",
    startAt: 10,
  });
  expect(
    edits.pages.map(({ marks }) => marks.map((mark) => (mark.type === "text" ? [mark.text, mark.x] : null))),
  ).toEqual([[["Page 10 of 11", 300]], [["Page 11 of 11", 150]]]);
});
