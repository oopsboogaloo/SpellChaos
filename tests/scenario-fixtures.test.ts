import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { GameState } from '../packages/domain/src/state.js';
import { VERSION } from '../packages/domain/src/state.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import type { Event } from '../packages/engine/src/events.js';
import { encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { startScenarioTurn } from '../packages/scenario/src/casting.js';

// Every permanent snapshot fixture is a current-schema regression scenario.
// Saves have no backward compatibility before release (owner decision, 7 November 2026):
// when the schema changes, fixtures are upgraded in the same change, and old saves are refused.
const fixtures = readdirSync('tests/fixtures')
  .filter(f => f.endsWith('.json'))
  .filter(f => 'schemaVersion' in JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8')));

function resolveTurn(initial: GameState, restoreEachStep: boolean): { state: GameState; events: Event[] } {
  let s = initial.phase === 'planning' ? startScenarioTurn(initial) : initial;
  const events: Event[] = [];
  for (let n = 0; !['planning', 'ended'].includes(s.phase); n++) {
    if (n > 5000) throw new Error('STEP_LIMIT');
    if (restoreEachStep) s = restoreSnapshot(encodeSnapshot(s));
    const r = advanceAtomicStep(s);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

it('the fixture set contains only current-schema snapshots', () => {
  expect(fixtures.length).toBeGreaterThan(80);
  for (const f of fixtures) {
    const raw = JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'));
    expect({ f, schema: raw.schemaVersion, rules: raw.rulesVersion, content: raw.contentVersion }).toEqual({
      f,
      schema: VERSION.schema,
      rules: VERSION.rules,
      content: VERSION.content,
    });
  }
});

it.each(fixtures)(
  '%s restores byte-identically and continues identically when restored at every atomic step',
  f => {
    const text = readFileSync(`tests/fixtures/${f}`, 'utf8').trim();
    const s = restoreSnapshot(text);
    expect(encodeSnapshot(s)).toBe(text);
    if (s.phase === 'ended') return;
    const direct = resolveTurn(s, false),
      restored = resolveTurn(s, true);
    expect(encodeSnapshot(restored.state)).toBe(encodeSnapshot(direct.state));
    expect(restored.events).toEqual(direct.events);
  },
  60000,
);

it('snapshots from any other schema, rules or content version are refused rather than reinterpreted', () => {
  const raw = JSON.parse(readFileSync(`tests/fixtures/${fixtures[0]}`, 'utf8'));
  for (const change of [
    { schemaVersion: VERSION.schema - 1 },
    { schemaVersion: VERSION.schema + 1 },
    { rulesVersion: 'unknown' },
    { contentVersion: 'unknown' },
  ])
    expect(() => restoreSnapshot(JSON.stringify({ ...raw, ...change }))).toThrow();
});
