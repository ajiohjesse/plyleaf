import * as mupdf from "mupdf";
import { afterEach, describe, expect, test } from "vitest";
import { EngineError } from "~/engine/errors";
import { describe as describeDoc, openPdf, transform } from "~/engine/ops";
import { permissionValue } from "~/engine/transform";
import { A4, makePdf } from "../helpers/pdf";
import { qpdfCheck, qpdfEncryption, qpdfOpens } from "../helpers/qpdf";

const opened: mupdf.Document[] = [];
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy();
});
const plain = () => {
  const doc = openPdf(makePdf([A4, A4]));
  opened.push(doc);
  return doc;
};
const reopen = (bytes: Uint8Array) => {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  opened.push(doc);
  return doc;
};

test("permission values follow the PDF spec", () => {
  expect(permissionValue([])).toBe(-3904);
  expect(permissionValue(["print"])).toBe(-3900);
  expect(permissionValue(["print", "edit", "copy", "annotate", "form", "accessibility", "assemble", "print-hq"])).toBe(
    -4,
  );
});

describe("protecting", () => {
  test("a password to open, AES-256, that qpdf agrees on", async () => {
    const output = transform(plain(), { security: { encrypt: "aes-256", userPassword: "correct horse" } });
    expect(await qpdfEncryption(output, "correct horse")).toBe("password");
    await expect(qpdfEncryption(output)).rejects.toThrow("qpdf can't open the file");
    expect(await qpdfOpens(output, "correct horse")).toBe(true);
    expect(await qpdfOpens(output, "wrong")).toBe(false);
    expect(await qpdfCheck(output, "correct horse")).toBe(0);
    const doc = reopen(output);
    expect(doc.needsPassword()).toBe(true);
    expect(doc.getMetaData("encryption")).toContain("256-bit AES");
    // The user password opens it as a user (2), not as the owner (4), with everything allowed.
    expect(doc.authenticatePassword("correct horse")).toBe(2);
    expect(doc.hasPermission("copy")).toBe(true);
  });

  test("a password with letters from any language", async () => {
    const password = "pässwörd 日本 ✓";
    const output = transform(plain(), { security: { encrypt: "aes-256", userPassword: password } });
    expect(await qpdfOpens(output, password)).toBe(true);
    expect(reopen(output).authenticatePassword(password)).toBe(2);
  });

  test("permissions only: opens freely, but copying and editing aren't allowed", async () => {
    const output = transform(plain(), {
      security: { encrypt: "aes-256", ownerPassword: "boss", permissions: ["print", "print-hq"] },
    });
    expect(await qpdfEncryption(output)).toBe("restrictions");
    expect(await qpdfCheck(output)).toBe(0);
    const doc = reopen(output);
    expect(doc.needsPassword()).toBe(false);
    expect(doc.hasPermission("print")).toBe(true);
    expect(doc.hasPermission("copy")).toBe(false);
    expect(doc.hasPermission("edit")).toBe(false);
    expect(doc.authenticatePassword("boss")).toBe(4);
    const described = openPdf(output);
    opened.push(described);
    expect(describeDoc(described)).toMatchObject({
      encryption: expect.stringContaining("AES"),
      permissions: ["print", "print-hq"],
    });
  });

  test("an owner password is made up when none is given", async () => {
    const output = transform(plain(), { security: { encrypt: "aes-256", userPassword: "u" } });
    const doc = reopen(output);
    expect(doc.authenticatePassword("")).toBe(0);
    expect(doc.authenticatePassword("u")).toBe(2);
  });

  test("refuses a password with a comma", () => {
    expect(() => transform(plain(), { security: { encrypt: "aes-256", userPassword: "a,b" } })).toThrow(EngineError);
  });

  test("encrypt none takes restrictions away", async () => {
    const restricted = transform(plain(), { security: { encrypt: "aes-256", ownerPassword: "o", permissions: [] } });
    const doc = openPdf(restricted);
    opened.push(doc);
    const output = transform(doc, { security: { encrypt: "none" } });
    expect(await qpdfEncryption(output)).toBe("none");
  });

  test("other tools keep a document's restrictions", async () => {
    const restricted = transform(plain(), { security: { encrypt: "aes-256", ownerPassword: "o", permissions: [] } });
    const doc = openPdf(restricted);
    opened.push(doc);
    const output = transform(doc, { compress: "low" });
    expect(await qpdfEncryption(output)).toBe("restrictions");
    expect(reopen(output).hasPermission("copy")).toBe(false);
  });
});

describe("opening with a password", () => {
  const locked = () =>
    transform(plain(), {
      security: { encrypt: "aes-256", userPassword: "user pw", ownerPassword: "owner pw", permissions: ["print"] },
    });

  test("asks for one, refuses a wrong one, and says which one opened it", () => {
    const bytes = locked();
    const code = (password?: string) => {
      try {
        openPdf(bytes, password).destroy();
        return "opened";
      } catch (error) {
        return (error as EngineError).code;
      }
    };
    expect(code()).toBe("password-required");
    expect(code("nope")).toBe("wrong-password");
    const asUser = openPdf(bytes, "user pw");
    const asOwner = openPdf(bytes, "owner pw");
    opened.push(asUser, asOwner);
    expect(describeDoc(asUser)).toMatchObject({ unlockedWith: "user", permissions: ["print"] });
    expect(describeDoc(asOwner).unlockedWith).toBe("owner");
    expect(describeDoc(asOwner).permissions).toHaveLength(8);
  });

  test("a document opened with its password can be unlocked, or changed and kept protected", async () => {
    const doc = openPdf(locked(), "user pw");
    opened.push(doc);
    const unlocked = transform(doc, { security: { encrypt: "none" } }, "user pw");
    expect(await qpdfEncryption(unlocked)).toBe("none");
    expect(await qpdfCheck(unlocked)).toBe(0);
    const compressed = transform(doc, { compress: "low" }, "user pw");
    expect(await qpdfEncryption(compressed, "user pw")).toBe("password");
  });
});
