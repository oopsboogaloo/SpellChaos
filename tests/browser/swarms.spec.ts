import { test, expect } from '@playwright/test';
import { swarmScenario } from '../../packages/scenario/src/swarms.js';
import { startScenarioTurn } from '../../packages/scenario/src/casting.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { encodeSnapshot } from '../../packages/persistence/src/snapshot.js';
import { projectView } from '../../packages/views/src/index.js';

test('Node and Chromium agree on swarm movement, coverage and per-victim attack continuation', async ({ page }) => {
  let state = startScenarioTurn(swarmScenario());
  const initial = encodeSnapshot(state),
    events = [];
  for (let n = 0; state.phase !== 'planning'; n++) {
    if (n > 1000) throw new Error('STEP_LIMIT');
    const result = advanceAtomicStep(state);
    state = result.state;
    events.push(...result.events);
  }
  await page.goto('/?dev');
  const actual = await page.evaluate(
    async ({ root, initial }) => {
      const persistence = await import(root + '/packages/persistence/src/snapshot.ts');
      const resolver = await import(root + '/packages/engine/src/resolver.ts');
      const views = await import(root + '/packages/views/src/index.ts');
      let s = persistence.restoreSnapshot(initial);
      const events = [];
      for (let n = 0; s.phase !== 'planning'; n++) {
        if (n > 1000) throw new Error('STEP_LIMIT');
        const r = resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(s)));
        s = r.state;
        events.push(...r.events);
      }
      return { snapshot: persistence.encodeSnapshot(s), events, view: views.projectView(s, 'opponent') };
    },
    { root: '/@fs' + process.cwd(), initial },
  );
  expect(actual).toEqual({ snapshot: encodeSnapshot(state), events, view: projectView(state, 'opponent') });
  expect(actual.view.creatures.find((c: { id: string; restrained: boolean }) => c.id === 'covered')!.restrained).toBe(
    true,
  );
});
