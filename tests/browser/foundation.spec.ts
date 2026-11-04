import { test, expect } from '@playwright/test';
import { createMatch, applyCommand } from '../../packages/engine/src/index.js';
import { encodeSnapshot } from '../../packages/persistence/src/snapshot.js';

test('browser shell locks, restores and resets its demo state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Spell Chaos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lock demo order' }).click();
  await expect(page.getByText('Turn 1 · planning · revision 1')).toBeVisible();
  await page.getByRole('button', { name: 'Save and restore demo' }).click();
  await expect(page.getByRole('button', { name: 'Lock demo order' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('Turn 1 · planning · revision 0')).toBeVisible();
});

test('browser and Node produce identical serialized state after restore and continuation', async ({ page }) => {
  const command = { matchId: 'match', playerId: 'human', turn: 1, expectedRevision: 0, commandId: 'c1', type: 'LockTurn' };
  const expected = encodeSnapshot(applyCommand(createMatch('match', ['human', 'ai'], 1), command).state);
  await page.goto('/');
  const actual = await page.evaluate(async ({ root, command }) => {
    const engine = await import(root + '/packages/engine/src/index.ts');
    const persistence = await import(root + '/packages/persistence/src/snapshot.ts');
    const initial = persistence.restoreSnapshot(persistence.encodeSnapshot(engine.createMatch('match', ['human', 'ai'], 1)));
    return persistence.encodeSnapshot(engine.applyCommand(initial, command).state);
  }, { root: '/@fs' + process.cwd(), command });
  expect(actual).toBe(expected);
});
