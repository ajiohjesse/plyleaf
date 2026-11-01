import { expect, test, type Page } from "@playwright/test";
import "../helpers/harness";
import { asPayload, dropFiles, pasteFiles, pdfFile, type FileSpec } from "../helpers/files";
import { A4, LETTER, makePdf } from "../helpers/pdf";

// The harness page is only built for local E2E runs, not deployed.
test.skip(!!process.env["BASE_URL"], "needs the test-harness build");

const textFile = (name: string): FileSpec => ({
  name,
  mimeType: "text/plain",
  bytes: Array.from(new TextEncoder().encode("not a pdf")),
});

async function openIntake(page: Page, name = "intake") {
  await page.goto(`/test-harness/${name}`);
  // The island has hydrated and is listening for drops and pastes on the page.
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
}

const fileList = (page: Page) => page.getByRole("list", { name: "Your files" }).getByRole("listitem");
const notices = (page: Page) => page.getByRole("list", { name: "File messages" }).getByRole("listitem");

test("opens picked PDFs in order and explains the files it can't take", async ({ page }) => {
  await openIntake(page);
  await page
    .getByLabel("Choose files")
    .setInputFiles([pdfFile("first.pdf", [A4, LETTER]), textFile("notes.txt"), pdfFile("second.pdf")].map(asPayload));

  await expect(fileList(page)).toHaveText([/first\.pdf\s*2 pages/, /second\.pdf\s*1 page ·/]);
  await expect(notices(page)).toHaveText(["notes.txt isn't a PDF."]);
  expect(await page.evaluate(() => window.harness.engine.stats().openDocuments)).toBe(2);

  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(notices(page)).toHaveCount(0);
});

test("takes files dropped anywhere on the page, or pasted", async ({ page }) => {
  await openIntake(page);
  await dropFiles(page, "main", [pdfFile("dropped.pdf")]);
  await expect(fileList(page)).toHaveText([/dropped\.pdf\s*1 page/]);

  // With files listed, the zone shrinks to an "add more" strip; pasting adds to the list.
  await expect(page.locator("label[for]")).toContainText("Add more PDFs");
  await pasteFiles(page, [pdfFile("pasted.pdf", [A4, A4, A4])]);
  await expect(fileList(page)).toHaveText([/dropped\.pdf/, /pasted\.pdf\s*3 pages/]);
});

test("highlights the drop zone while files are dragged over the page", async ({ page }) => {
  await openIntake(page);
  const zone = page.locator("label[for]");
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["x"], "x.pdf"));
    const event = new Event("dragenter", { bubbles: true });
    Object.defineProperty(event, "dataTransfer", { value: data });
    document.body.dispatchEvent(event);
  });
  await expect(zone).toHaveAttribute("data-dragging", "true");
  await expect(zone).toContainText("Drop to add");

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["x"], "x.pdf"));
    const event = new Event("dragleave", { bubbles: true });
    Object.defineProperty(event, "dataTransfer", { value: data });
    document.body.dispatchEvent(event);
  });
  await expect(zone).not.toHaveAttribute("data-dragging");
});

test("says why damaged, protected and empty files weren't added", async ({ page }) => {
  await openIntake(page);
  const damaged = { ...pdfFile("damaged.pdf"), bytes: Array.from(new TextEncoder().encode("%PDF-1.7 and nothing")) };
  const locked = {
    ...pdfFile("locked.pdf"),
    bytes: Array.from(makePdf([A4], { save: "encrypt=aes-256,user-password=secret" })),
  };
  const empty = { ...pdfFile("empty.pdf"), bytes: [] };
  await page.getByLabel("Choose files").setInputFiles([damaged, locked, empty].map(asPayload));

  await expect(notices(page)).toHaveText([
    "empty.pdf is empty.",
    "damaged.pdf couldn't be opened. It may be damaged, or not really a PDF.",
    "locked.pdf is protected with a password. Remove it with Unlock PDF first (you'll need the password).",
  ]);
  await expect(fileList(page)).toHaveCount(0);
});

test("removing a file closes it in the engine", async ({ page }) => {
  await openIntake(page);
  await page.getByLabel("Choose files").setInputFiles([pdfFile("a.pdf"), pdfFile("b.pdf")].map(asPayload));
  await expect(fileList(page)).toHaveCount(2);
  await expect(fileList(page).filter({ hasText: "Opening" })).toHaveCount(0);

  await page.getByRole("button", { name: "Remove a.pdf" }).click();
  await expect(fileList(page)).toHaveText([/b\.pdf/]);
  await expect.poll(() => page.evaluate(() => window.harness.engine.stats().openDocuments)).toBe(1);
});

test("a single-file tool keeps one file and swaps in a new one", async ({ page }) => {
  await openIntake(page, "intake-single");
  const input = page.getByLabel("Choose a file");
  await expect(input).not.toHaveAttribute("multiple");

  await input.setInputFiles([asPayload(pdfFile("old.pdf"))]);
  await expect(fileList(page)).toHaveText([/old\.pdf/]);
  await dropFiles(page, "main", [pdfFile("new.pdf"), pdfFile("extra.pdf")]);
  await expect(fileList(page)).toHaveText([/new\.pdf/]);
  await expect(notices(page)).toHaveText(["extra.pdf was left out: this tool works on one file at a time."]);
  await expect.poll(() => page.evaluate(() => window.harness.engine.stats().openDocuments)).toBe(1);
});

test("the picker is keyboard reachable and starts loading the engine on focus", async ({ page }) => {
  const wasm: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".wasm")) wasm.push(request.url());
  });
  await openIntake(page);
  await page.waitForLoadState("networkidle");
  expect(wasm).toEqual([]);

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Choose files")).toBeFocused();
  await expect.poll(() => wasm.length).toBeGreaterThan(0);
});
