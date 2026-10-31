import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "~/lib/contrast";

const css = readFileSync(new URL("../../src/styles/global.css", import.meta.url), "utf8");

/** Reads the hex custom properties declared directly inside the first block matching `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block in global.css`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map((m) => [m[1], m[2]]));
}

const light = tokens(":root");
const dark = { ...light, ...tokens('[data-theme="dark"]') };

// [foreground, background]: every pair the UI puts text on. AA body text needs 4.5:1.
const textPairs: [string, string][] = [
  ["ink", "surface"],
  ["ink", "surface-band"],
  ["ink-muted", "surface"],
  ["ink-muted", "surface-band"],
  ["primary", "surface"],
  ["primary", "surface-band"],
  ["on-primary", "primary"],
  ["on-primary", "primary-hover"],
  ["footer-ink", "footer-bg"],
];
// Sticky notes are always light, so they carry the light theme's ink in both themes.
const stickies = ["sticky-yellow", "sticky-pink", "sticky-coral", "sticky-lavender", "sticky-mint"];

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s theme tokens", (_name, theme) => {
  it.each(textPairs)("%s on %s meets AA (4.5:1)", (fg, bg) => {
    expect(theme[fg], `--${fg}`).toBeDefined();
    expect(theme[bg], `--${bg}`).toBeDefined();
    expect(contrastRatio(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps lines and the focus ring visible (3:1 non-text)", () => {
    expect(contrastRatio(theme["primary"]!, theme["surface"]!)).toBeGreaterThanOrEqual(3);
  });
});

describe("sticky notes", () => {
  it.each(stickies)("ink on %s meets AA", (sticky) => {
    expect(contrastRatio(light["ink"]!, light[sticky]!)).toBeGreaterThanOrEqual(4.5);
  });
});
