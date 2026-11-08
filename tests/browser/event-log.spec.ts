/// <reference lib="dom" />
import { test, expect } from '@playwright/test';

test('a resolved turn appears in the filtered event log and earlier turns can be reviewed', async ({ page }) => {
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status')).toContainText('Turn 1');
  const log = game.getByRole('region', { name: 'Event log' });
  await expect(log).toContainText('No events yet');
  for (const turn of [1, 2]) {
    await game.getByRole('button', { name: 'Lock turn', exact: true }).click();
    await game.getByRole('button', { name: 'Pause', exact: true }).click();
    await game.getByRole('button', { name: 'Resolve turn', exact: true }).click();
    await expect(game.getByRole('status')).toContainText(`Turn ${turn + 1}`, { timeout: 30000 });
  }
  await expect(log.getByLabel('Review turn')).toHaveValue('2');
  await expect(log.getByRole('listitem').first()).toBeVisible();
  await log.getByLabel('Review turn').selectOption('1');
  await expect(log.getByRole('listitem').first()).toContainText(/locks in|early|late|movement/);
  // Every entry is written as text, never as raw engine data.
  for (const text of await log.getByRole('listitem').allTextContents()) expect(text).not.toMatch(/[{}]/);
});
