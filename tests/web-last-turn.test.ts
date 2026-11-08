import { expect, it } from 'vitest';
import { lastTurnSummary, type LogEvent } from '../apps/web/src/summaries.js';

const name = (id?: string) => (id === 'w2' ? 'Wizard' : 'Someone');
const e = (type: string, phase: string, extra: Partial<LogEvent> = {}): LogEvent => ({
  type,
  turn: 2,
  phase,
  creatureId: 'w1',
  ...extra,
});

it('reports a cast, a move and an attack in the phase each happened', () => {
  const s = lastTurnSummary(
    [
      e('CastStarted', 'early', { action: 'Summon Cat' }),
      e('CastFailed', 'early', { action: 'Summon Cat' }),
      e('CreatureMoved', 'movement'),
      e('CreatureMoved', 'movement'),
      e('AttackHit', 'late', { targetId: 'w2' }),
    ],
    'w1',
    name,
  );
  expect(s).toEqual({
    summoned: false,
    early: 'Cast Summon Cat failed',
    move: 'Moved 2',
    late: 'Hit Wizard',
    took: '',
  });
});

it('reports a slow spell that finishes this turn without a new CastStarted', () => {
  const s = lastTurnSummary([e('CastSucceeded', 'early', { action: 'Bind' })], 'w1', name);
  expect(s.early).toBe('Bind succeeded');
  expect(s.late).toBe('—');
});

it('reports a creature summoned last turn', () => {
  expect(lastTurnSummary([e('CreatureSummoned', 'early')], 'w1', name).summoned).toBe(true);
});

it('reports hits, misses and damage dealt per target, and damage taken by source', () => {
  const names = (id?: string) =>
    ({ w2: 'Wizard (enemy)', cat: 'Cat familiar', sh: 'Shepherd (enemy)', mu: 'Walking mushroom (enemy)' })[id ?? ''] ??
    'Someone';
  const s = lastTurnSummary(
    [
      e('AttackHit', 'early', { targetId: 'cat', critical: true }),
      e('DamageApplied', 'early', { creatureId: 'cat', sourceId: 'w1', amount: 4 }),
      e('AttackMissed', 'late', { targetId: 'w2' }),
      e('AttackHit', 'late', { targetId: 'w2' }),
      e('DamageApplied', 'late', { creatureId: 'w2', sourceId: 'w1' }),
      e('DamageApplied', 'late', { creatureId: 'w1', sourceId: 'sh', amount: 3 }),
      e('DamageApplied', 'late', { creatureId: 'w1', sourceId: 'mu', amount: 2 }),
      e('DamageApplied', 'end', { creatureId: 'w1', action: 'poison', amount: 1 }),
    ],
    'w1',
    names,
  );
  expect(s.early).toBe('Hit Cat familiar (4 dmg, critical)');
  // Enemy damage amounts are hidden by the rules, so only the hit and the miss are shown.
  expect(s.late).toBe('Hit Wizard (enemy) (1 missed)');
  expect(s.took).toBe('Took 6 damage: Shepherd 3, Walking mushroom 2, poison 1');
});
