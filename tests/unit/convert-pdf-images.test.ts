import { expect, test } from "vitest";
import { extractedImageName, imageSize, pageImageName } from "~/convert/pdf-images";
import { pagesInRanges } from "~/organize/ranges";

test("image sizes follow the resolution", () => {
  expect(imageSize({ width: 595, height: 842 }, 72)).toEqual({ width: 595, height: 842, capped: false });
  expect(imageSize({ width: 595, height: 842 }, 150)).toEqual({ width: 1240, height: 1755, capped: false });
  expect(imageSize({ width: 612, height: 792 }, 300)).toEqual({ width: 2550, height: 3300, capped: false });
});

test("a page too big for the resolution is scaled down to 8192 px", () => {
  // A 2 × 1 m poster at 300 dpi would be 23622 px wide.
  expect(imageSize({ width: 5669, height: 2835 }, 300)).toEqual({ width: 8192, height: 4097, capped: true });
});

test("names pad the page number so files sort in order", () => {
  expect(pageImageName("report.pdf", 2, 12, "jpeg")).toBe("report-page-03.jpg");
  expect(pageImageName("report.pdf", 0, 9, "png")).toBe("report-page-1.png");
  expect(pageImageName("scan.pdf", 99, 100, "webp")).toBe("scan-page-100.webp");
});

test("pages in ranges come out once each, in page order", () => {
  expect(
    pagesInRanges([
      { first: 5, last: 6 },
      { first: 1, last: 2 },
      { first: 2, last: 3 },
    ]),
  ).toEqual([0, 1, 2, 4, 5]);
});

test("extracted images are named by page and order", () => {
  expect(extractedImageName("report.pdf", 2, 12, 1, "jpeg")).toBe("report-page-03-image-2.jpg");
  expect(extractedImageName("scan.pdf", 0, 1, 0, "png")).toBe("scan-page-1-image-1.png");
});
