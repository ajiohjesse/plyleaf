// Steps for the shared controls (src/components/workspace/controls.tsx).
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Picks an option of a Select by its visible label. With a mouse the Select is our own list; on a touch screen it's the
 * device's picker (a native <select>), so this works in every project.
 */
export async function choose(page: Page, field: Locator, option: string) {
  // While our list is open it carries the field's label too, so keep to the control itself.
  const control = field.and(page.getByRole("combobox"));
  if (await control.evaluate((element) => element.tagName === "SELECT")) {
    await control.selectOption({ label: option });
    return;
  }
  await control.click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(control).toHaveText(option);
}

/** Checks which option a Select shows, by its label, on either kind of Select. */
export async function expectChosen(page: Page, field: Locator, option: string) {
  const control = field.and(page.getByRole("combobox"));
  if (await control.evaluate((element) => element.tagName === "SELECT")) {
    await expect(control.locator("option:checked")).toHaveText(option);
  } else {
    await expect(control).toHaveText(option);
  }
}
