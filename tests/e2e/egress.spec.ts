// GOAL P3 and M1's done-when: no user file bytes leave the browser. Every request the pages and their workers make is
// watched while files are opened, shown, combined and saved, and nothing may go elsewhere or carry a body.
import { expect, test, type Page } from "@playwright/test";
import { watchEgress } from "../helpers/egress";
import { asPayload, dropFiles, pasteFiles, pdfFile } from "../helpers/files";
import { A4, LETTER } from "../helpers/pdf";

// The harness pages are only built for local E2E runs, not deployed.
test.skip(!!process.env["BASE_URL"], "needs the test-harness build");

// A name that can't turn up in a request by chance, so it showing up anywhere means the file's details went out.
const SECRET = "egress-canary-q7x";

async function openHarness(page: Page, name: string) {
  await page.goto(`/test-harness/${name}`);
  await expect(page.locator("label[data-listening]")).toHaveCount(1);
}

const fileList = (page: Page) => page.getByRole("list", { name: "Your files" }).getByRole("listitem");

test("no file leaves the browser while it's opened, shown, combined and saved", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const egress = await watchEgress(context, { origin, secrets: [SECRET] });
  // Stand in for the native save dialog so every browser takes the Save as path too.
  await page.addInitScript(() => {
    Object.assign(window, {
      showSaveFilePicker: async () => ({
        createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      }),
    });
  });

  // Open through the picker, a drop and a paste, plus a damaged file, and render every page.
  await openHarness(page, "thumbnails");
  await page.getByLabel("Choose files").setInputFiles(asPayload(pdfFile(`${SECRET}-picked.pdf`, [A4, LETTER])));
  await dropFiles(page, "main", [pdfFile(`${SECRET}-dropped.pdf`)]);
  await pasteFiles(page, [pdfFile(`${SECRET}-pasted.pdf`, [A4, A4])]);
  await page.getByLabel("Choose files").setInputFiles({
    name: `${SECRET}-damaged.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 and nothing"),
  });
  await expect(page.getByRole("list", { name: "File messages" })).toContainText("couldn't be opened");
  await expect(page.locator('canvas[data-state="ready"]')).toHaveCount(5);

  // Combine, download and save as.
  await openHarness(page, "download");
  await page
    .getByLabel("Choose files")
    .setInputFiles([pdfFile(`${SECRET}-a.pdf`, [A4, LETTER]), pdfFile(`${SECRET}-b.pdf`)].map(asPayload));
  await expect(fileList(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Combine into one PDF" }).click();
  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "Save as…" }).click();
  await expect(page.getByRole("status")).toHaveText(`Saved ${SECRET}-a-combined.pdf.`);
  await page.waitForLoadState("networkidle");

  expect(egress.problems()).toEqual([]);
  // The watch did see the engine load: the worker script, and the WASM that the worker itself fetches.
  const paths = egress.requests.map((request) => new URL(request.url()).pathname);
  expect(paths).toContainEqual(expect.stringMatching(/\/worker-[^/]*\.js$/));
  expect(paths).toContainEqual(expect.stringMatching(/\.wasm$/));
});

test("the watch catches requests that could carry a file, from the page or a worker", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const egress = await watchEgress(context, { origin, secrets: [SECRET] });
  // A worker loaded from a URL, the way the engine's is.
  await context.route(/\/leaky-worker\.js$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `fetch("/from-worker", { method: "PUT", body: "%PDF-1.7" }).finally(() => postMessage("sent"));`,
    }),
  );
  await page.goto("/");
  const elsewhere = origin.replace("localhost", "127.0.0.1");
  expect(elsewhere).not.toBe(origin);

  await page.evaluate(
    async ({ secret, other }) => {
      const quietly = (request: Promise<unknown>) => request.catch(() => {});
      await quietly(fetch("/upload", { method: "POST", body: new Blob(["%PDF-1.7"]) }));
      await quietly(fetch(`/files?name=${secret}.pdf`));
      await quietly(fetch(`${other}/`, { mode: "no-cors" }));
      navigator.sendBeacon("/beacon", "%PDF-1.7");
      const worker = new Worker("/leaky-worker.js", { type: "module" });
      await new Promise((resolve) => worker.addEventListener("message", resolve));
      // Playwright can't see inside these, so starting one is itself a problem.
      new Worker(URL.createObjectURL(new Blob(["postMessage(1)"], { type: "text/javascript" }))).terminate();
      await quietly(navigator.serviceWorker.register("/sw.js"));
    },
    { secret: SECRET, other: elsewhere },
  );

  await expect
    .poll(() => egress.problems())
    .toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^POST .*\/upload: can carry a body$/),
        expect.stringMatching(new RegExp(`^GET .*/files\\?name=${SECRET}\\.pdf: contains "${SECRET}"$`)),
        `GET ${elsewhere}/: another origin`,
        expect.stringMatching(/^POST .*\/beacon: can carry a body$/),
        expect.stringMatching(/^PUT .*\/from-worker: can carry a body$/),
        "Worker from a blob: URL",
        "service worker /sw.js",
      ]),
    );
});
