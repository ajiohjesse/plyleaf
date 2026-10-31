import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categories, filterTools, tools, type Tool } from "~/data/tools";

describe("tool catalogue", () => {
  it("has unique, URL-safe slugs", () => {
    const slugs = tools.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("puts every tool in a known category and leaves no category empty", () => {
    const ids = categories.map((c) => c.id);
    const used = new Set(tools.map((t) => t.category));
    for (const tool of tools) expect(ids).toContain(tool.category);
    for (const id of ids) expect(used).toContain(id);
  });

  it("has a page for every available tool, and marks every tool with a page available", () => {
    for (const tool of tools) {
      const page = existsSync(new URL(`../../src/pages/${tool.slug}.astro`, import.meta.url));
      expect(page, `src/pages/${tool.slug}.astro`).toBe(!!tool.available);
    }
  });
});

describe("filterTools", () => {
  const sample: Tool[] = [
    { slug: "merge-pdf", name: "Merge PDF", description: "Combine files.", category: "organize", keywords: ["join"] },
    { slug: "sign-pdf", name: "Sign PDF", description: "Add a signature.", category: "edit-sign" },
    { slug: "resume", name: "Résumé tool", description: "Accents.", category: "convert" },
  ];

  it("returns everything for an empty or blank query", () => {
    expect(filterTools(sample, "")).toHaveLength(3);
    expect(filterTools(sample, "   ")).toHaveLength(3);
  });

  it("matches name, description and keywords, ignoring case", () => {
    expect(filterTools(sample, "MERGE").map((t) => t.slug)).toEqual(["merge-pdf"]);
    expect(filterTools(sample, "signature").map((t) => t.slug)).toEqual(["sign-pdf"]);
    expect(filterTools(sample, "join").map((t) => t.slug)).toEqual(["merge-pdf"]);
  });

  it("requires every word to match", () => {
    expect(filterTools(sample, "pdf combine").map((t) => t.slug)).toEqual(["merge-pdf"]);
    expect(filterTools(sample, "pdf nothing")).toEqual([]);
  });

  it("ignores accents", () => {
    expect(filterTools(sample, "resume").map((t) => t.slug)).toEqual(["resume"]);
  });

  it("finds real tools by common search words", () => {
    expect(filterTools(tools, "jpg").map((t) => t.slug)).toContain("jpg-to-pdf");
    expect(filterTools(tools, "password").map((t) => t.slug)).toEqual(["protect-pdf", "unlock-pdf"]);
  });
});
