import { describe, expect, it } from "vitest";
import { formatDate } from "~/editor/dates";
import { changedFields, currentValue, fieldEdits, startingValue } from "~/editor/forms";
import { toEdits, type TickItem } from "~/editor/items";
import type { FormField } from "~/engine/types";
import { clearPaper, fittedSize, inkBounds, placedSize } from "~/sign/ink";

const field = (overrides: Partial<FormField>): FormField => ({
  page: 0,
  index: 0,
  name: "name",
  label: "name",
  type: "text",
  box: [0, 0, 100, 20],
  value: "",
  readOnly: false,
  ...overrides,
});

describe("form values", () => {
  const fields: FormField[] = [
    field({ name: "name", index: 0 }),
    // The same field on another page.
    field({ name: "name", index: 0, page: 1 }),
    field({ name: "agree", index: 1, type: "checkbox", value: "Off", onState: "Yes" }),
    field({ name: "size", index: 2, type: "radio", value: "S", onState: "S" }),
    field({ name: "size", index: 3, type: "radio", value: "S", onState: "M" }),
    field({ name: "ref", index: 4, value: "R-1", readOnly: true }),
    field({ name: "country", index: 5, type: "combobox", value: "Ghana" }),
  ];

  it("starts from what the file has", () => {
    expect(fields.map(startingValue)).toEqual(["", "", false, "S", "S", "R-1", "Ghana"]);
    expect(currentValue(fields[2]!, new Map([["agree", true]]))).toBe(true);
  });

  it("counts a field once however many widgets it has, and not when it's back as it was", () => {
    const values = new Map<string, string | boolean>([
      ["name", "Ama"],
      ["agree", false],
      ["size", "M"],
      ["ref", "changed"],
      ["country", "Ghana"],
    ]);
    expect(changedFields(fields, values)).toEqual(["name", "size"]);
  });

  it("sends a value to every widget of a changed field, and turns on the radio button chosen", () => {
    const values = new Map<string, string | boolean>([
      ["name", "Ama"],
      ["agree", true],
      ["size", "M"],
      ["ref", "changed"],
    ]);
    expect(fieldEdits(fields, values)).toEqual([
      { page: 0, index: 0, value: "Ama" },
      { page: 1, index: 0, value: "Ama" },
      { page: 0, index: 1, value: true },
      { page: 0, index: 3, value: true },
    ]);
  });
});

describe("ticks", () => {
  const tick = (symbol: TickItem["symbol"]): TickItem => ({
    id: "t",
    kind: "tick",
    page: 2,
    x: 100,
    y: 50,
    size: 20,
    symbol,
    color: [0, 0, 0],
  });

  it("are drawn as lines inside their square, or a dot in its middle", () => {
    const check = toEdits([tick("check")]).pages[0]!;
    expect(check.page).toBe(2);
    expect(check.marks).toHaveLength(2);
    for (const mark of check.marks) {
      if (mark.type !== "shape") throw new Error("not a shape");
      expect(mark.shape).toBe("line");
      for (const [x, y] of [
        [mark.x, mark.y],
        [mark.x + mark.width, mark.y + mark.height],
      ]) {
        expect(x).toBeGreaterThanOrEqual(100);
        expect(x).toBeLessThanOrEqual(120);
        expect(y).toBeGreaterThanOrEqual(50);
        expect(y).toBeLessThanOrEqual(70);
      }
    }
    expect(toEdits([tick("cross")]).pages[0]!.marks).toHaveLength(2);
    expect(toEdits([tick("dot")]).pages[0]!.marks).toEqual([
      {
        type: "shape",
        shape: "ellipse",
        x: 105,
        y: 55,
        width: 10,
        height: 10,
        stroke: null,
        fill: [0, 0, 0],
        lineWidth: 0,
      },
    ]);
  });
});

describe("dates", () => {
  const date = new Date(2026, 10, 4);
  it("are written in figures, in words or as ISO 8601", () => {
    expect(formatDate(date, "numeric", "en-GB")).toBe("04/11/2026");
    expect(formatDate(date, "numeric", "en-US")).toBe("11/04/2026");
    expect(formatDate(date, "long", "en-GB")).toBe("4 November 2026");
    expect(formatDate(date, "iso")).toBe("2026-11-04");
  });

  it("always use the figures 0 to 9", () => {
    expect(formatDate(date, "numeric", "ar-EG")).toMatch(/^[0-9/\s‏؜.-]+$/);
  });
});

describe("signature pictures", () => {
  /** A w × h RGBA picture, transparent but for the given opaque pixels. */
  function picture(w: number, h: number, ink: [number, number][]) {
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of ink) pixels[(y * w + x) * 4 + 3] = 255;
    return pixels;
  }

  it("are cut down to their ink, with a margin inside the picture", () => {
    const pixels = picture(10, 8, [
      [3, 2],
      [6, 5],
    ]);
    expect(inkBounds(pixels, 10, 8)).toEqual({ x: 3, y: 2, width: 4, height: 4 });
    expect(inkBounds(pixels, 10, 8, { margin: 5 })).toEqual({ x: 0, y: 0, width: 10, height: 8 });
    expect(inkBounds(picture(4, 4, []), 4, 4)).toBeNull();
  });

  it("lose the paper they were photographed on, but keep their ink and its soft edges", () => {
    const pixels = new Uint8ClampedArray([
      // paper
      250, 248, 240, 255,
      // ink
      20, 30, 90, 255,
      // an edge between them
      180, 180, 180, 255,
    ]);
    clearPaper(pixels);
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(255);
    expect(pixels[11]).toBeGreaterThan(0);
    expect(pixels[11]).toBeLessThan(255);
  });

  it("start at a signature's size on the page, and fit a signature field", () => {
    expect(placedSize(600, 200, "signature")).toEqual({ width: 108, height: 36 });
    // Very wide: held to the widest a signature starts.
    expect(placedSize(2000, 100, "signature")).toEqual({ width: 180, height: 9 });
    expect(placedSize(300, 300, "initials")).toEqual({ width: 24, height: 24 });
    const fitted = fittedSize(600, 200, { width: 180, height: 40 });
    expect(fitted.width).toBeCloseTo(108);
    expect(fitted.height).toBeCloseTo(36);
  });
});
