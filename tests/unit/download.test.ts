import { afterEach, expect, test, vi } from "vitest";
import { canSaveAs, outputName, saveAs } from "~/download/download";

test("names output after the source file and what the tool did", () => {
  expect(outputName("report.pdf", "merged")).toBe("report-merged.pdf");
  expect(outputName("Report.PDF", "rotated")).toBe("Report-rotated.pdf");
  expect(outputName("holiday photo.jpeg", "converted")).toBe("holiday photo-converted.pdf");
  expect(outputName("notes.final.pdf", "")).toBe("notes.final.pdf");
  expect(outputName("scan.pdf", "pages", "zip")).toBe("scan-pages.zip");
});

test("makes names every file system accepts", () => {
  expect(outputName('a<b>c:d"e/f\\g|h?i*j.pdf', "x")).toBe("a-b-c-d-e-f-g-h-i-j-x.pdf");
  expect(outputName("tab\there\nnewline.pdf", "x")).toBe("tab here newline-x.pdf");
  expect(outputName("  ..hidden.. .pdf", "x")).toBe("hidden-x.pdf");
  expect(outputName("???.pdf", "x")).toBe("document-x.pdf");
  expect(outputName("", "")).toBe("document.pdf");
  expect(outputName("CON.pdf", "")).toBe("CON-file.pdf");
  expect(outputName("con.pdf", "merged")).toBe("con-merged.pdf");
  // Long names are cut by characters, never in the middle of one.
  const long = outputName(`${"é".repeat(150)}.pdf`, "x");
  expect(long).toBe(`${"é".repeat(100)}-x.pdf`);
  expect(outputName(`${"😀".repeat(120)}.pdf`, "")).toBe(`${"😀".repeat(100)}.pdf`);
});

afterEach(() => vi.unstubAllGlobals());

function stubPicker(behaviour: "save" | "cancel") {
  const written: Blob[] = [];
  const calls: unknown[] = [];
  vi.stubGlobal("window", {
    showSaveFilePicker: async (options: unknown) => {
      calls.push(options);
      if (behaviour === "cancel") throw new DOMException("The user aborted a request.", "AbortError");
      return {
        createWritable: async () => ({
          write: async (data: Blob) => void written.push(data),
          close: async () => {},
        }),
      };
    },
  });
  return { written, calls };
}

test("saves where the user picks, and reports a closed dialog", async () => {
  expect(canSaveAs()).toBe(false);
  const file = new Blob(["%PDF-"], { type: "application/pdf" });

  const saved = stubPicker("save");
  expect(canSaveAs()).toBe(true);
  expect(await saveAs(file, "report-merged.pdf")).toBe(true);
  expect(saved.written).toEqual([file]);
  expect(saved.calls).toEqual([
    {
      suggestedName: "report-merged.pdf",
      types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
    },
  ]);

  const cancelled = stubPicker("cancel");
  expect(await saveAs(file, "report-merged.pdf")).toBe(false);
  expect(cancelled.written).toEqual([]);
});
