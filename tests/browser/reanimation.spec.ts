import { test, expect } from '@playwright/test';
import { reanimationScenario } from '../../packages/scenario/src/reanimation.js';
import { startScenarioTurn } from '../../packages/scenario/src/casting.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { encodeSnapshot } from '../../packages/persistence/src/snapshot.js';

for (const skeletal of [false, true]) test(`Node and Chromium restore and resolve the same ${skeletal ? 'skeleton' : 'zombie'}`, async ({ page }) => {
 let state = reanimationScenario(skeletal);
 const initial = encodeSnapshot(state), events = [];
 for (let turn = 0; turn < 2; turn++) {
  state = startScenarioTurn(state);
  for (let n = 0; state.phase !== 'planning'; n++) {
   if (n > 1000) throw new Error('STEP_LIMIT');
   const r = advanceAtomicStep(state); state = r.state; events.push(...r.events);
  }
 }
 expect(state.creatures.some(c => c.kind === 'reanimated')).toBe(true);
 await page.goto('/');
 const actual = await page.evaluate(async ({ root, initial }) => {
  const persistence = await import(root + '/packages/persistence/src/snapshot.ts');
  const resolver = await import(root + '/packages/engine/src/resolver.ts');
  const scenario = await import(root + '/packages/scenario/src/casting.ts');
  let s = persistence.restoreSnapshot(initial); const events = [];
  for (let turn = 0; turn < 2; turn++) {
   s = scenario.startScenarioTurn(s);
   for (let n = 0; s.phase !== 'planning'; n++) {
    if (n > 1000) throw new Error('STEP_LIMIT');
    const r = resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(s)));
    s = r.state; events.push(...r.events);
   }
  }
  return { snapshot: persistence.encodeSnapshot(s), events };
 }, { root: '/@fs' + process.cwd(), initial });
 expect(actual).toEqual({ snapshot: encodeSnapshot(state), events });
});
