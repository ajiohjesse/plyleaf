import { expect, test } from "vitest";
import { keepRatio, snapAngle, square } from "~/editor/constrain";
import { drawnShape, MIN_IMAGE_SIDE, MIN_SHAPE_SIDE, resizeImage, resizeShape } from "~/editor/items";

test("snapping keeps a line's length and turns it to the nearest 15°", () => {
  const level = snapAngle(100, 3);
  expect(level.dy).toBe(0);
  expect(level.dx).toBeCloseTo(Math.hypot(100, 3), 4);
  const upright = snapAngle(-2, -50);
  expect(upright.dx).toBe(0);
  expect(upright.dy).toBeCloseTo(-Math.hypot(2, 50), 4);
  const diagonal = snapAngle(70, 74);
  expect(Math.atan2(diagonal.dy, diagonal.dx)).toBeCloseTo(Math.PI / 4, 5);
  const thirty = snapAngle(100, 60);
  expect((Math.atan2(thirty.dy, thirty.dx) * 180) / Math.PI).toBeCloseTo(30, 4);
  expect(Math.hypot(thirty.dx, thirty.dy)).toBeCloseTo(Math.hypot(100, 60), 4);
  expect(snapAngle(0, 0)).toEqual({ dx: 0, dy: 0 });
});

test("a square drag takes the longer side, in the directions dragged", () => {
  expect(square(30, 80)).toEqual({ dx: 80, dy: 80 });
  expect(square(-90, 20)).toEqual({ dx: -90, dy: 90 });
  expect(square(-10, -40)).toEqual({ dx: -40, dy: -40 });
});

test("keeping a ratio follows whichever side changed more", () => {
  expect(keepRatio(300, 100, 2)).toEqual({ width: 300, height: 150 });
  expect(keepRatio(100, 300, 2)).toEqual({ width: 600, height: 300 });
  expect(keepRatio(200, 100, 2)).toEqual({ width: 200, height: 100 });
});

test("drawing with Shift makes squares, circles and 15° lines; without it, what was dragged", () => {
  const from = { x: 100, y: 100 };
  expect(drawnShape({ shape: "rectangle" }, from, { x: 160, y: 130 })).toEqual({
    x: 100,
    y: 100,
    width: 60,
    height: 30,
  });
  expect(drawnShape({ shape: "rectangle" }, from, { x: 160, y: 130 }, true)).toEqual({
    x: 100,
    y: 100,
    width: 60,
    height: 60,
  });
  // Dragged up and left from the first corner: the square still grows that way.
  expect(drawnShape({ shape: "ellipse" }, from, { x: 70, y: 40 }, true)).toEqual({
    x: 40,
    y: 40,
    width: 60,
    height: 60,
  });
  const line = drawnShape({ shape: "line" }, from, { x: 200, y: 104 }, true);
  expect(line).toMatchObject({ x: 100, y: 100, height: 0 });
  expect(line.width).toBeCloseTo(100.08, 2);
  expect(drawnShape({ shape: "arrow" }, from, { x: 200, y: 104 })).toEqual({ x: 100, y: 100, width: 100, height: 4 });
});

test("resizing a box is free, and keeps the starting proportions with Shift", () => {
  const start = { width: 100, height: 50 };
  expect(resizeShape({ shape: "rectangle" }, 130, 90)).toEqual({ width: 130, height: 90 });
  expect(resizeShape({ shape: "rectangle" }, 130, 90, start)).toEqual({ width: 180, height: 90 });
  expect(resizeShape({ shape: "ellipse" }, 1, 1)).toEqual({ width: MIN_SHAPE_SIDE, height: MIN_SHAPE_SIDE });
  const line = resizeShape({ shape: "line" }, 98, -101, { width: 50, height: 0 });
  expect(line.width).toBeCloseTo(-line.height, 5);
});

test("pictures keep their shape when resized, and stretch only with Shift", () => {
  const picture = { width: 200, height: 100 };
  expect(resizeImage(picture, 100)).toEqual({ width: 100, height: 50 });
  expect(resizeImage(picture, 240, 160)).toEqual({ width: 320, height: 160 });
  expect(resizeImage(picture, 240, 160, true)).toEqual({ width: 240, height: 160 });
  expect(resizeImage(picture, 1, 1, true)).toEqual({ width: MIN_IMAGE_SIDE, height: MIN_IMAGE_SIDE });
  expect(resizeImage(picture, 1)).toEqual({ width: MIN_IMAGE_SIDE * 2, height: MIN_IMAGE_SIDE });
});
