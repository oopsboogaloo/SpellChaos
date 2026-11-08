import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { restoreSnapshot, encodeSnapshot } from '../../packages/persistence/src/snapshot.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { projectView } from '../../packages/views/src/index.js';

for (const name of ['roar-middle', 'frighten', 'gaze-slow', 'gaze-restraint']) {
  test(`Node and Chromium agree on ${name} at every saved power boundary`, async ({ page }) => {
    const initial = encodeSnapshot(restoreSnapshot(readFileSync(`tests/fixtures/powers-${name}.json`, 'utf8')));
    let s = restoreSnapshot(initial);
    const events = [];
    for (let n = 0; !['planning', 'ended'].includes(s.phase); n++) {
      if (n > 1000) throw new Error('STEP_LIMIT');
      const r = advanceAtomicStep(s);
      s = r.state;
      events.push(...r.events);
    }
    await page.goto('/');
    const actual = await page.evaluate(
      async ({ root, initial }) => {
        const persistence = await import(root + '/packages/persistence/src/snapshot.ts');
        const resolver = await import(root + '/packages/engine/src/resolver.ts');
        const views = await import(root + '/packages/views/src/index.ts');
        let state = persistence.restoreSnapshot(initial);
        const events = [];
        for (let n = 0; !['planning', 'ended'].includes(state.phase); n++) {
          if (n > 1000) throw new Error('STEP_LIMIT');
          const r = resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(state)));
          state = r.state;
          events.push(...r.events);
        }
        return { snapshot: persistence.encodeSnapshot(state), events, view: views.projectView(state, 'b') };
      },
      { root: '/@fs' + process.cwd(), initial },
    );
    expect(actual).toEqual({ snapshot: encodeSnapshot(s), events, view: projectView(s, 'b') });
  });
}
