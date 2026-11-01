import { expect, test } from "vitest";
import { describe as describeDoc, openPdf, transform } from "~/engine/ops";
import { truncatedPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

test("a damaged file comes out whole: qpdf finds fault with the original, not the copy", async () => {
  const damaged = truncatedPdf(3);
  expect(await qpdfCheck(damaged)).not.toBe(0);
  const doc = openPdf(damaged);
  expect(describeDoc(doc).repaired).toBe(true);
  const repaired = transform(doc, {});
  doc.destroy();
  expect(await qpdfCheck(repaired)).toBe(0);
  const reopened = openPdf(repaired);
  expect(describeDoc(reopened)).toMatchObject({ repaired: false });
  expect(reopened.countPages()).toBe(3);
  reopened.destroy();
});
