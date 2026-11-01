import { expect, test } from "vitest";
import { fitFor, type Layout } from "~/convert/images";

const photo = { width: 400, height: 300 };
const portrait = { width: 300, height: 400 };
const layout = (change: Partial<Layout>): Layout => ({ size: "a4", orientation: "auto", margin: "none", ...change });

test("keeps the image's own size", () => {
  expect(fitFor(photo, layout({ size: "image" }))).toBeUndefined();
});

test("turns the page to match the image by default", () => {
  expect(fitFor(photo, layout({}))).toEqual({ width: 842, height: 595, margin: 0 });
  expect(fitFor(portrait, layout({ size: "letter" }))).toEqual({ width: 612, height: 792, margin: 0 });
  // A square image goes on a portrait page.
  expect(fitFor({ width: 100, height: 100 }, layout({}))).toEqual({ width: 595, height: 842, margin: 0 });
});

test("a chosen orientation applies to every image", () => {
  expect(fitFor(photo, layout({ orientation: "portrait" }))).toEqual({ width: 595, height: 842, margin: 0 });
  expect(fitFor(portrait, layout({ orientation: "landscape", size: "letter" }))).toEqual({
    width: 792,
    height: 612,
    margin: 0,
  });
});

test("margins are a quarter or half an inch", () => {
  expect(fitFor(portrait, layout({ margin: "small" }))?.margin).toBe(18);
  expect(fitFor(portrait, layout({ margin: "large" }))?.margin).toBe(36);
});
