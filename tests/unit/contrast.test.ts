import { describe, expect, it } from "vitest";
import { contrastRatio, INK, parseHex, readableOn, relativeLuminance } from "~/lib/contrast";

describe("parseHex", () => {
  it("parses long and short forms", () => {
    expect(parseHex("#3d4ef5")).toEqual([61, 78, 245]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
  });

  it("rejects anything else", () => {
    expect(() => parseHex("red")).toThrow("Not a hex colour");
    expect(() => parseHex("#12345")).toThrow("Not a hex colour");
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    // #767676 on white is the well-known 4.54:1 grey.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#3d4ef5", "#ffffff")).toBe(contrastRatio("#ffffff", "#3d4ef5"));
  });
});

describe("readableOn", () => {
  it("picks dark ink on light colours and white on dark ones, always readable", () => {
    expect(readableOn("#ffd43b")).toBe(INK);
    expect(readableOn("#ffffff")).toBe(INK);
    expect(readableOn("#000000")).toBe("#ffffff");
    expect(readableOn("#1d3fa8")).toBe("#ffffff");
    const colours = ["#ff0000", "#00ff00", "#0000ff", "#808080", "#ffb3c1", "#3d4ef5"];
    expect(colours.filter((colour) => contrastRatio(readableOn(colour), colour) < 4.5)).toEqual([]);
  });
});
