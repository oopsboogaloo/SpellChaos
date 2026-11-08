/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { Page } from '@playwright/test';

/** Opens the game Menu with its Turn controls and Advanced orders sections expanded. */
export async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.evaluate(() => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>('.menu-drawer > details'))
      if (d.querySelector('summary')?.textContent !== 'New match') d.open = true;
  });
}
