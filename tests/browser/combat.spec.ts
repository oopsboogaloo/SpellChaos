import { test, expect } from '@playwright/test';
import { combatScenario } from '../../packages/scenario/src/combat.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { encodeSnapshot } from '../../packages/persistence/src/snapshot.js';

test('Node and Chromium reproduce multiattacks, Guard and poison through every saved boundary', async ({ page }) => {
  let state = combatScenario();
  const initial = encodeSnapshot(state),
    events = [];
  while (!['planning', 'ended'].includes(state.phase)) {
    const result = advanceAtomicStep(state);
    state = result.state;
    events.push(...result.events);
  }
  await page.goto('/?dev');
  const actual = await page.evaluate(
    async ({ root, initial }) => {
      const persistence = await import(root + '/packages/persistence/src/snapshot.ts');
      const resolver = await import(root + '/packages/engine/src/resolver.ts');
      let state = persistence.restoreSnapshot(initial);
      const events = [];
      for (let steps = 0; !['planning', 'ended'].includes(state.phase); steps++) {
        if (steps > 1000) throw new Error('STEP_LIMIT');
        const result = resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(state)));
        state = result.state;
        events.push(...result.events);
      }
      return { snapshot: persistence.encodeSnapshot(state), events };
    },
    { root: '/@fs' + process.cwd(), initial },
  );
  expect(actual).toEqual({ snapshot: encodeSnapshot(state), events });
  expect(events.some(e => e.type === 'AttackHit' && e.phase === 'movement')).toBe(true);
});
