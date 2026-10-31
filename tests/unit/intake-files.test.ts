import { describe, expect, test } from "vitest";
import { EngineError } from "~/engine/errors";
import { checkFiles, openFailureMessage, sniffKind } from "~/intake/files";
import { A4, makePdf } from "../helpers/pdf";

const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const pdf = (name = "doc.pdf") => new File([makePdf([A4])], name, { type: "application/pdf" });
const png = (name = "photo.png") => new File([bytes("\x89PNG\r\n\x1a\n rest of it")], name, { type: "image/png" });
const text = (name = "notes.txt") => new File(["just some text"], name, { type: "text/plain" });

describe("sniffKind", () => {
  test("finds a PDF header, even after leading junk", () => {
    expect(sniffKind(bytes("%PDF-1.7\n"), "a.bin", "")).toBe("pdf");
    expect(sniffKind(bytes("\r\n\0junk%PDF-1.4"), "a.bin", "")).toBe("pdf");
  });

  test("recognises common image formats by their signatures", () => {
    const heic = new Uint8Array([0, 0, 0, 24, ...bytes("ftypheic")]);
    for (const head of [
      bytes("\x89PNG\r\n\x1a\n"),
      bytes("\xff\xd8\xff\xe0"),
      bytes("GIF89a"),
      bytes("RIFF\0\0\0\0WEBPVP8 "),
      bytes("II*\0"),
      bytes("MM\0*"),
      heic,
    ]) {
      expect(sniffKind(head, "x", "")).toBe("image");
    }
  });

  test("trusts the name or type of a file with no header, so MuPDF can try to repair it", () => {
    expect(sniffKind(bytes("garbage"), "Report.PDF", "")).toBe("pdf");
    expect(sniffKind(bytes("garbage"), "report", "application/pdf")).toBe("pdf");
    expect(sniffKind(bytes("garbage"), "report.txt", "text/plain")).toBe("unknown");
  });

  test("goes by the bytes, not a misleading name", () => {
    expect(sniffKind(bytes("\x89PNG\r\n\x1a\n"), "scan.pdf", "application/pdf")).toBe("image");
  });
});

describe("checkFiles", () => {
  test("accepts PDFs in order and explains each file it leaves out", async () => {
    const a = pdf("a.pdf");
    const b = pdf("b.pdf");
    const result = await checkFiles([a, text(), png(), new File([], "empty.pdf"), b]);
    expect(result.accepted).toEqual([a, b]);
    expect(result.rejected).toEqual([
      "notes.txt isn't a PDF.",
      "photo.png is an image, not a PDF.",
      "empty.pdf is empty.",
    ]);
  });

  test("takes images when a tool accepts them", async () => {
    const image = png();
    const result = await checkFiles([image, text()], { accept: ["pdf", "image"] });
    expect(result.accepted).toEqual([image]);
    expect(result.rejected).toEqual(["notes.txt isn't a PDF or an image."]);
  });

  test("keeps only the first file for a single-file tool", async () => {
    const first = pdf("first.pdf");
    const result = await checkFiles([text(), first, pdf("second.pdf")], { multiple: false });
    expect(result.accepted).toEqual([first]);
    expect(result.rejected).toEqual([
      "notes.txt isn't a PDF.",
      "second.pdf was left out: this tool works on one file at a time.",
    ]);
  });

  test("reports a file it can't read", async () => {
    const unreadable = pdf("gone.pdf");
    unreadable.slice = () => {
      const blob = new Blob(["x"]);
      blob.arrayBuffer = () => Promise.reject(new DOMException("moved", "NotReadableError"));
      return blob;
    };
    expect((await checkFiles([unreadable])).rejected).toEqual(["gone.pdf couldn't be read."]);
  });
});

test("openFailureMessage says what went wrong in plain words", () => {
  expect(openFailureMessage("a.pdf", new EngineError("invalid-file", "x"))).toBe(
    "a.pdf couldn't be opened. It may be damaged, or not really a PDF.",
  );
  expect(openFailureMessage("a.pdf", new EngineError("password-required", "x"))).toBe(
    "a.pdf is protected with a password. Plyleaf can't open protected PDFs yet.",
  );
  const generic = "Something went wrong opening a.pdf. Try again, or try a smaller file.";
  expect(openFailureMessage("a.pdf", new EngineError("engine-failure", "x"))).toBe(generic);
  expect(openFailureMessage("a.pdf", new Error("worker died"))).toBe(generic);
});
