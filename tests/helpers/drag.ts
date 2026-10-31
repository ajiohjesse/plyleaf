// Keyboard dragging with dnd-kit in E2E tests.
import { expect, type Page } from "@playwright/test";

/**
 * Presses `key` until `text` is announced. Straight after "Picked up", dnd-kit is still measuring where things can be
 * dropped, and Chromium can deliver the first arrow key before it's ready, which dnd-kit then ignores. A press that
 * did count is announced well within the wait, so this never presses twice for one step.
 */
export async function pressUntilAnnounced(page: Page, key: string, text: string) {
  await expect(async () => {
    await page.keyboard.press(key);
    await expect(page.getByText(text)).toBeAttached({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}
