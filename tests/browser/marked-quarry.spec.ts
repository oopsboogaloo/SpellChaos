import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { restoreSnapshot, encodeSnapshot } from '../../packages/persistence/src/snapshot.js';
import { startScenarioTurn } from '../../packages/scenario/src/casting.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { projectView } from '../../packages/views/src/index.js';
for (const name of ['planning', 'marked', 'attack'])
  test(`Node and Chromium agree on quarry ${name} continuation`, async ({ page }) => {
    const initial = encodeSnapshot(restoreSnapshot(readFileSync(`tests/fixtures/quarry-${name}.json`, 'utf8')));
    let s = restoreSnapshot(initial);
    if (s.phase === 'planning') s = startScenarioTurn(s);
    const events = [];
    for (let n = 0; !['planning', 'ended'].includes(s.phase); n++) {
      if (n > 1000) throw new Error('STEP_LIMIT');
      const r = advanceAtomicStep(s);
      s = r.state;
      events.push(...r.events);
    }
    await page.goto('/?dev');
    const actual = await page.evaluate(
      async ({ root, initial }) => {
        const persistence = await import(root + '/packages/persistence/src/snapshot.ts');
        const scenario = await import(root + '/packages/scenario/src/casting.ts');
        const resolver = await import(root + '/packages/engine/src/resolver.ts');
        const views = await import(root + '/packages/views/src/index.ts');
        let s = persistence.restoreSnapshot(initial);
        if (s.phase === 'planning') s = scenario.startScenarioTurn(s);
        const events = [];
        for (let n = 0; !['planning', 'ended'].includes(s.phase); n++) {
          if (n > 1000) throw new Error('STEP_LIMIT');
          const r = resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(s)));
          s = r.state;
          events.push(...r.events);
        }
        return { snapshot: persistence.encodeSnapshot(s), events, view: views.projectView(s, 'b') };
      },
      { root: '/@fs' + process.cwd(), initial },
    );
    expect(actual).toEqual({ snapshot: encodeSnapshot(s), events, view: projectView(s, 'b') });
    expect(s.creatures.find(c => c.id === 'hunter')!.quarryTargetId).toBe('prey');
  });
