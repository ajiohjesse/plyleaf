import { expect, test } from "vitest";
import { A4, makePdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

// A control for the outside check every M4 test relies on: it passes a good file and fails a broken one.
test("qpdf --check passes a sound PDF and fails a damaged one", async () => {
  expect(await qpdfCheck(makePdf([A4]))).toBe(0);
  const bytes = makePdf([A4, A4], { save: "" });
  const text = new TextDecoder("latin1").decode(bytes);
  const broken = new TextEncoder().encode(text.replace(/stream\r?\n[\s\S]*?endstream/, "stream\nGARBAGE\nendstream"));
  expect(await qpdfCheck(broken)).not.toBe(0);
});
