import { test, expect } from '@playwright/test';
import { createMatch, applyCommand, applySystemCommand, systemCommand } from '../../packages/engine/src/index.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { encodeSnapshot } from '../../packages/persistence/src/snapshot.js';

test('plans a Dash and resumes a saved checkpoint mid-movement', async ({ page }) => {
  await page.goto('/?dev');
  const preview = page.getByRole('region', { name: 'Turn resolution preview' });
  await preview.getByRole('button', { name: 'Plan Dash', exact: true }).click();
  await expect(preview.getByText('Dash planned', { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Commit scenario' }).click();
  const status = page.getByTestId('turn-preview-status');
  for (let i = 0; i < 30 && !(await status.innerText()).includes('position 6,5'); i++)
    await preview.getByRole('button', { name: 'Next engine step' }).click();
  await expect(status).toHaveText('Turn 1 · movement · position 6,5');
  await preview.getByRole('button', { name: 'Save checkpoint' }).click();
  await preview.getByRole('button', { name: 'Next engine step' }).click();
  await expect(status).toHaveText('Turn 1 · movement · position 7,5');
  await preview.getByRole('button', { name: 'Restore checkpoint' }).click();
  await expect(status).toHaveText('Turn 1 · movement · position 6,5');
  for (let i = 0; i < 40 && !(await status.innerText()).includes('Turn 2'); i++)
    await preview.getByRole('button', { name: 'Next engine step' }).click();
  await expect(status).toHaveText('Turn 2 · planning · position 9,5');
});

test('Node and Chromium resolve the same restored whole turn', async ({ page }) => {
  let state = createMatch('cross-runtime', ['p1', 'p2'], 3003);
  state.creatures[0]!.centre = { q: 5, r: 5 };
  state.creatures[1]!.centre = { q: 15, r: 15 };
  state = applyCommand(state, {
    matchId: state.matchId,
    playerId: 'p1',
    turn: 1,
    expectedRevision: 0,
    commandId: 'draft',
    type: 'SetOrder',
    order: {
      creatureId: 'wizard-0',
      path: [
        { q: 6, r: 5 },
        { q: 7, r: 5 },
      ],
      early: 'Defend',
      late: null,
    },
  }).state;
  for (const p of state.players)
    state = applyCommand(state, {
      matchId: state.matchId,
      playerId: p.id,
      turn: 1,
      expectedRevision: state.revision,
      commandId: `lock-${p.id}`,
      type: 'LockTurn',
    }).state;
  state = applySystemCommand(state, systemCommand(state, 'StartResolution', 'start')).state;
  const initial = encodeSnapshot(state);
  const events = [];
  while (state.phase !== 'planning') {
    const result = advanceAtomicStep(state);
    state = result.state;
    events.push(...result.events);
  }
  await page.goto('/?dev');
  const actual = await page.evaluate(
    async ({ root, initial }) => {
      const persistence = await import(root + '/packages/persistence/src/snapshot.ts');
      const resolver = await import(root + '/packages/engine/src/resolver.ts');
      let s = persistence.restoreSnapshot(initial);
      const events = [];
      for (let steps = 0; s.phase !== 'planning'; steps++) {
        if (steps > 1000) throw new Error('Step limit');
        const result = resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(s)));
        s = result.state;
        events.push(...result.events);
      }
      return { snapshot: persistence.encodeSnapshot(s), events };
    },
    { root: '/@fs' + process.cwd(), initial },
  );
  expect(actual).toEqual({ snapshot: encodeSnapshot(state), events });
});
