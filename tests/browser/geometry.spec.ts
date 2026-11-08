import { test, expect } from '@playwright/test';
import { traceRay } from '../../packages/geometry/src/ray.js';
import { startingPositions } from '../../packages/engine/src/spawn.js';

test('geometry preview changes size and flags clipped footprints on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?dev');
  await page.getByRole('combobox', { name: 'Size', exact: true }).selectOption('10');
  await expect(page.getByRole('status')).toHaveText('61 occupied hexes · Legal footprint');
  await page.getByRole('spinbutton', { name: 'Column', exact: true }).fill('0');
  await page.getByRole('spinbutton', { name: 'Row', exact: true }).fill('0');
  await expect(page.getByRole('status')).toHaveText('61 occupied hexes · Footprint extends beyond arena');
  await page.getByRole('combobox', { name: 'Players', exact: true }).selectOption('2');
  await expect(page.getByRole('img', { name: 'Hex arena with footprint and numbered wizard starts' })).toBeVisible();
  await page.screenshot({ path: 'test-results/geometry-phone.png', fullPage: true });
});

test('exact boundary rays and seeded starts are identical in browser and Node', async ({ page }) => {
  await page.goto('/?dev');
  const actual = await page.evaluate(async root => {
    const ray = await import(root + '/packages/geometry/src/ray.ts');
    const spawn = await import(root + '/packages/engine/src/spawn.ts');
    return { ray: ray.traceRay({ q: 0, r: 0 }, { q: 1, r: 1 }, 'left'), starts: spawn.startingPositions(8, 123) };
  }, '/@fs' + process.cwd());
  expect(actual).toEqual({ ray: traceRay({ q: 0, r: 0 }, { q: 1, r: 1 }, 'left'), starts: startingPositions(8, 123) });
});
