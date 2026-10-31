import { defineConfig, devices } from "@playwright/test";

const port = 4321;
// Set BASE_URL to test a deployed site (e.g. a Cloudflare preview) instead of a local production build.
const remote = process.env["BASE_URL"];

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: remote ?? `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  // E2E runs against the production build, the same static files we deploy.
  webServer: remote
    ? []
    : {
        command: `pnpm build && pnpm preview --port ${port}`,
        // Also build the test-harness pages (src/pages/test-harness), which production builds leave out.
        env: { PLYLEAF_TEST_HARNESS: "1" },
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env["CI"],
        timeout: 180_000,
      },
});
