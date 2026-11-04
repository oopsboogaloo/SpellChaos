import { test, expect } from '@playwright/test';
import { illusionScenario } from '../../packages/scenario/src/illusions.js';
import { startScenarioTurn } from '../../packages/scenario/src/casting.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { encodeSnapshot } from '../../packages/persistence/src/snapshot.js';
import { projectView, projectEvents } from '../../packages/views/src/index.js';

test('Node and Chromium agree on illusion reversal, shock deaths and permitted views', async ({ page }) => {
 let state = startScenarioTurn(illusionScenario()); const initial = encodeSnapshot(state), events = [];
 for (let n = 0; state.phase !== 'planning'; n++) {
  if (n > 1000) throw new Error('STEP_LIMIT');
  const result = advanceAtomicStep(state); state = result.state; events.push(...result.events);
 }
 await page.goto('/');
 const actual = await page.evaluate(async ({ root, initial }) => {
  const persistence = await import(root + '/packages/persistence/src/snapshot.ts');
  const resolver = await import(root + '/packages/engine/src/resolver.ts');
  const views = await import(root + '/packages/views/src/index.ts');
  let s = persistence.restoreSnapshot(initial); const events = [];
  for (let n = 0; s.phase !== 'planning'; n++) {
   if (n > 1000) throw new Error('STEP_LIMIT');
   const r = resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(s)));
   s = r.state; events.push(...r.events);
  }
  return { snapshot: persistence.encodeSnapshot(s), view: views.projectView(s, 'human'), events: views.projectEvents(s, 'human', events) };
 }, { root: '/@fs' + process.cwd(), initial });
 expect(actual).toEqual({ snapshot: encodeSnapshot(state), view: projectView(state, 'human'), events: projectEvents(state, 'human', events) });
 expect(state.creatures.find(c => c.id === 'shock-victim')!.alive).toBe(false);
});
