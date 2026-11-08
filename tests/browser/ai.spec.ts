import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { restoreMatchSession, encodeMatchSession, advanceMatchSession } from '../../packages/ai/src/session.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { stateFingerprint } from '../../packages/persistence/src/digest.js';
import { projectView } from '../../packages/views/src/index.js';
import type { Event } from '../../packages/engine/src/events.js';
for (const name of ['planning', 'ready', 'unbound-movement', 'unbound-attack', 'limited', 'complete-match']) {
  test(`Node and Chromium resume the ${name} AI session at every published boundary`, async ({ page }) => {
    test.setTimeout(60000);
    const initial = readFileSync(`tests/fixtures/ai-${name}.json`, 'utf8');
    let s = restoreMatchSession(initial);
    const fingerprints: string[] = [],
      events: Event[] = [];
    for (let n = 0; !s.outcome; n++) {
      if (n > 10000) throw Error('STEP_LIMIT');
      const before = s,
        transition =
          ['early', 'movement', 'late', 'end'].includes(s.state.phase) && s.atomicSteps < s.options.maxAtomicSteps
            ? advanceAtomicStep(s.state)
            : null;
      s = advanceMatchSession(s);
      if (transition && s.atomicSteps > before.atomicSteps) events.push(...transition.events);
      fingerprints.push(stateFingerprint(s.state));
    }
    await page.goto('/');
    const actual = await page.evaluate(
      async ({ root, initial }) => {
        const ai = await import(root + '/packages/ai/src/session.ts'),
          engine = await import(root + '/packages/engine/src/resolver.ts'),
          digest = await import(root + '/packages/persistence/src/digest.ts'),
          views = await import(root + '/packages/views/src/index.ts');
        let s = ai.restoreMatchSession(initial);
        const fingerprints: string[] = [],
          events: Event[] = [];
        for (let n = 0; !s.outcome; n++) {
          if (n > 10000) throw Error('STEP_LIMIT');
          s = ai.restoreMatchSession(ai.encodeMatchSession(s));
          const before = s,
            transition =
              ['early', 'movement', 'late', 'end'].includes(s.state.phase) && s.atomicSteps < s.options.maxAtomicSteps
                ? engine.advanceAtomicStep(s.state)
                : null;
          s = ai.advanceMatchSession(s);
          if (transition && s.atomicSteps > before.atomicSteps) events.push(...transition.events);
          fingerprints.push(digest.stateFingerprint(s.state));
        }
        return {
          snapshot: ai.encodeMatchSession(s),
          fingerprints,
          events,
          views: s.state.players.map((p: { id: string }) => views.projectView(s.state, p.id)),
        };
      },
      { root: '/@fs' + process.cwd(), initial },
    );
    expect(actual).toEqual({
      snapshot: encodeMatchSession(s),
      fingerprints,
      events,
      views: s.state.players.map(p => projectView(s.state, p.id)),
    });
  });
}
