/// <reference lib="dom" />
import { test, expect } from '@playwright/test';
import { openMenu } from './menu.js';

test('the planning timer counts down and resolves the turn under deadline rules when it expires', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status')).toContainText('Turn 1');
  await openMenu(page);
  await game.getByText('New match', { exact: true }).click();
  await game.getByLabel('AI difficulty').selectOption('hard');
  await game.getByLabel('Planning timer').selectOption('30');
  await game.getByRole('button', { name: 'Start new match' }).click();
  await expect(game.getByLabel('Planning time left')).toContainText('0:30');
  await page.clock.fastForward(10_000);
  await expect(game.getByLabel('Planning time left')).toContainText('0:20');
  await page.clock.fastForward(21_000);
  await expect(game.getByLabel('Planning time left')).toHaveCount(0);
  await expect(game.getByRole('status')).not.toContainText('planning');
});

test('a timer set to Off shows no countdown', async ({ page }) => {
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await openMenu(page);
  await game.getByText('New match', { exact: true }).click();
  await game.getByLabel('Planning timer').selectOption('0');
  await game.getByRole('button', { name: 'Start new match' }).click();
  await expect(game.getByRole('status')).toContainText('Turn 1');
  await expect(game.getByLabel('Planning time left')).toHaveCount(0);
});
