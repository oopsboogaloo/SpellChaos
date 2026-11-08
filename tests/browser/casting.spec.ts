import { test, expect } from '@playwright/test';
import { castingScenario, startScenarioTurn } from '../../packages/scenario/src/casting.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { encodeSnapshot } from '../../packages/persistence/src/snapshot.js';

test('steps a remote Slow cast and restores it between turns on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?dev');
  const panel = page.getByRole('region', { name: 'Casting preview' }),
    status = page.getByTestId('casting-status');
  await panel.getByRole('button', { name: 'Commit casting turn' }).click();
  for (let step = 0; step < 100 && !(await status.innerText()).startsWith('Turn 2'); step++)
    await panel.getByRole('button', { name: 'Step casting', exact: true }).click();
  await expect(status).toContainText('Turn 2 · planning · mana 85');
  await expect(page.getByTestId('casting-origin')).toHaveText('Casting Bind through origin-cat');
  await panel.getByRole('button', { name: 'Save casting checkpoint' }).click();
  await panel.getByRole('button', { name: 'Commit casting turn' }).click();
  for (let step = 0; step < 100 && !(await status.innerText()).startsWith('Turn 3'); step++)
    await panel.getByRole('button', { name: 'Step casting', exact: true }).click();
  await expect(status).toContainText('Turn 3 · planning · mana 90');
  await expect(page.getByTestId('casting-origin')).toHaveText('No active cast');
  await panel.getByRole('button', { name: 'Restore casting checkpoint' }).click();
  await expect(status).toContainText('Turn 2 · planning · mana 85');
  await expect(page.getByTestId('casting-origin')).toHaveText('Casting Bind through origin-cat');
});

test('Node and Chromium agree on two turns of remote casting with save/restore at every step', async ({ page }) => {
  let state = castingScenario();
  const initial = encodeSnapshot(state),
    events = [];
  for (let turn = 0; turn < 2; turn++) {
    state = startScenarioTurn(state);
    while (state.phase !== 'planning') {
      const r = advanceAtomicStep(state);
      state = r.state;
      events.push(...r.events);
    }
  }
  await page.goto('/?dev');
  const actual = await page.evaluate(
    async ({ root, initial }) => {
      const persistence = await import(root + '/packages/persistence/src/snapshot.ts');
      const resolver = await import(root + '/packages/engine/src/resolver.ts');
      const scenario = await import(root + '/packages/scenario/src/casting.ts');
      let s = persistence.restoreSnapshot(initial);
      const events = [];
      for (let turn = 0; turn < 2; turn++) {
        s = scenario.startScenarioTurn(s);
        for (let n = 0; s.phase !== 'planning'; n++) {
          if (n > 1000) throw new Error('STEP_LIMIT');
          const r = resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(s)));
          s = r.state;
          events.push(...r.events);
        }
      }
      return { snapshot: persistence.encodeSnapshot(s), events };
    },
    { root: '/@fs' + process.cwd(), initial },
  );
  expect(actual).toEqual({ snapshot: encodeSnapshot(state), events });
});
