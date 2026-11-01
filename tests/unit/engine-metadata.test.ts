import * as mupdf from "mupdf";
import { afterEach, expect, test } from "vitest";
import { describe as describeDoc, openPdf, transform } from "~/engine/ops";
import { metadataPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const opened: mupdf.PDFDocument[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});
const open = (bytes: Uint8Array) => {
  const doc = openPdf(bytes);
  opened.push(doc);
  return doc;
};

const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

test("reads the document information", () => {
  expect(describeDoc(open(metadataPdf())).metadata).toEqual({
    Title: "Quarterly secrets",
    Author: "Jane Example",
    Creator: "Writer 9",
    CreationDate: "D:20250102030405Z",
  });
});

test("changes and removes fields, and drops the stale XMP copy", async () => {
  const output = transform(open(metadataPdf()), {
    metadata: { set: { Title: "Résumé – 2026 ✓", Author: "", Keywords: "plans, budget" } },
  });
  expect(describeDoc(open(output)).metadata).toEqual({
    Title: "Résumé – 2026 ✓",
    Keywords: "plans, budget",
    Creator: "Writer 9",
    CreationDate: "D:20250102030405Z",
  });
  expect(text(output)).not.toContain("xmpmeta");
  expect(await qpdfCheck(output)).toBe(0);
});

test("removing leaves no information, XMP or private data behind", async () => {
  const output = transform(open(metadataPdf()), { metadata: "remove", compress: "low" });
  expect(describeDoc(open(output)).metadata).toEqual({});
  for (const leftover of ["Quarterly", "Jane", "Writer 9", "xmpmeta", "PieceInfo"]) {
    expect(text(output)).not.toContain(leftover);
  }
  expect(await qpdfCheck(output)).toBe(0);
});
