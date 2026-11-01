// PDF metadata: edit fields, or remove all of it.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { watchEgress } from "../helpers/egress";
import { asPayload } from "../helpers/files";
import { metadataPdf } from "../helpers/pdf";
import { qpdfCheck } from "../helpers/qpdf";

const SECRET = "metadata-canary-e4j";

async function openTool(page: Page) {
  await page.goto("/pdf-metadata");
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
  await page
    .getByLabel("Choose a file")
    .setInputFiles(
      asPayload({ name: `${SECRET}-q3.pdf`, mimeType: "application/pdf", bytes: Array.from(metadataPdf()) }),
    );
  await expect(page.getByLabel("Title")).toHaveValue("Quarterly secrets");
}

async function download(page: Page) {
  await expect(page.getByRole("heading", { name: "Done — your file is ready" })).toBeFocused();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  return { name: saved.suggestedFilename(), bytes: new Uint8Array(await readFile((await saved.path())!)) };
}

test("edits the title and removes the author, without sending the file anywhere", async ({
  page,
  context,
  baseURL,
}) => {
  const egress = await watchEgress(context, { origin: new URL(baseURL!).origin, secrets: [SECRET] });
  await openTool(page);
  await expect(page.getByLabel("Author")).toHaveValue("Jane Example");
  await expect(page.getByText("Created", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await page.getByLabel("Title").fill("Q3 summary");
  await page.getByLabel("Author").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  const { name, bytes } = await download(page);
  expect(name).toBe(`${SECRET}-q3-metadata.pdf`);
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  expect(doc.getMetaData("info:Title")).toBe("Q3 summary");
  expect(doc.getMetaData("info:Author") ?? "").toBe("");
  expect(doc.getMetaData("info:Creator")).toBe("Writer 9");
  expect(await qpdfCheck(bytes)).toBe(0);
  await page.waitForLoadState("networkidle");
  expect(egress.problems()).toEqual([]);
});

test("removes all metadata", async ({ page }) => {
  await openTool(page);
  await page.getByRole("button", { name: "Remove all metadata" }).click();
  const { name, bytes } = await download(page);
  expect(name).toBe(`${SECRET}-q3-no-metadata.pdf`);
  const text = new TextDecoder("latin1").decode(bytes);
  for (const leftover of ["Quarterly", "Jane", "Writer 9", "xmpmeta"]) expect(text).not.toContain(leftover);
  expect(await qpdfCheck(bytes)).toBe(0);
});

test("is linked from the home page", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /metadata/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/pdf-metadata$/);
  await expect(page.getByRole("heading", { level: 1, name: "PDF metadata" })).toBeVisible();
});
