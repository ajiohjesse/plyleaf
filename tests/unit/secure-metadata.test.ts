import { expect, test } from "vitest";
import { parsePdfDate } from "~/secure/metadata";

test("reads PDF dates with and without offsets", () => {
  expect(parsePdfDate("D:20250102030405Z")?.toISOString()).toBe("2025-01-02T03:04:05.000Z");
  expect(parsePdfDate("D:20250102030405+01'00'")?.toISOString()).toBe("2025-01-02T02:04:05.000Z");
  expect(parsePdfDate("D:20250102030405-05'30")?.toISOString()).toBe("2025-01-02T08:34:05.000Z");
  expect(parsePdfDate("D:2025")?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  expect(parsePdfDate("20251231")?.toISOString()).toBe("2025-12-31T00:00:00.000Z");
});

test("anything else isn't a date", () => {
  expect(parsePdfDate("yesterday")).toBeNull();
  expect(parsePdfDate("")).toBeNull();
});
