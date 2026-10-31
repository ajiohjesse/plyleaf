import { expect, test } from "vitest";
import { cropFromMargins, dragCrop, FULL, isFull, marginsOf, MIN_SIDE } from "~/organize/crop";

/** Rounds away floating-point noise so frames compare exactly. */
const rounded = (crop: object) =>
  Object.fromEntries(Object.entries(crop).map(([key, value]) => [key, Math.round((value as number) * 1e9) / 1e9]));
const expectFrame = (actual: object, expected: Record<string, number>) =>
  expect(rounded(actual)).toMatchObject(rounded(expected));
const MIDDLE = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

test("moves the frame, keeping it on the page", () => {
  expectFrame(dragCrop(MIDDLE, "move", 0.1, -0.1), { x: 0.3, y: 0.1, width: 0.6, height: 0.6 });
  expectFrame(dragCrop(MIDDLE, "move", 0.5, 0.5), { x: 0.4, y: 0.4 });
  expectFrame(dragCrop(MIDDLE, "move", -1, -1), { x: 0, y: 0 });
});

test("resizes from each edge and corner, the opposite side staying put", () => {
  expectFrame(dragCrop(MIDDLE, "w", 0.1, 0), { x: 0.3, width: 0.5 });
  expectFrame(dragCrop(MIDDLE, "e", 0.1, 0), { x: 0.2, width: 0.7 });
  expectFrame(dragCrop(MIDDLE, "n", 0, -0.1), { y: 0.1, height: 0.7 });
  expectFrame(dragCrop(MIDDLE, "s", 0, -0.1), { y: 0.2, height: 0.5 });
  expectFrame(dragCrop(MIDDLE, "nw", -0.1, -0.1), { x: 0.1, y: 0.1, width: 0.7, height: 0.7 });
  expectFrame(dragCrop(MIDDLE, "se", 0.1, 0.1), { x: 0.2, y: 0.2, width: 0.7, height: 0.7 });
  // An edge drag ignores the other axis.
  expectFrame(dragCrop(MIDDLE, "e", 0.1, 0.3), { y: 0.2, height: 0.6 });
});

test("never leaves the page or shrinks below the smallest side", () => {
  expectFrame(dragCrop(MIDDLE, "w", -1, 0), { x: 0, width: 0.8 });
  expectFrame(dragCrop(MIDDLE, "e", 1, 0), { width: 0.8 });
  expectFrame(dragCrop(MIDDLE, "w", 1, 0), { x: 0.8 - MIN_SIDE, width: MIN_SIDE });
  expectFrame(dragCrop(MIDDLE, "s", 0, -1), { height: MIN_SIDE });
  expectFrame(dragCrop(FULL, "ne", 0.5, -0.5), { x: 0, y: 0, width: 1, height: 1 });
});

test("turns margins into a frame and back", () => {
  expectFrame(marginsOf(MIDDLE), { top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 });
  expectFrame(cropFromMargins({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.05 })!, {
    x: 0.05,
    y: 0.1,
    width: 0.75,
    height: 0.6,
  });
  expect(cropFromMargins({ top: 0.5, right: 0, bottom: 0.48, left: 0 })).toBeNull();
  expect(cropFromMargins({ top: -0.1, right: 0, bottom: 0, left: 0 })).toBeNull();
  expect(cropFromMargins({ top: Number.NaN, right: 0, bottom: 0, left: 0 })).toBeNull();
});

test("knows when the frame is the whole page", () => {
  expect(isFull(FULL)).toBe(true);
  expect(isFull(MIDDLE)).toBe(false);
});
