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
  expect(s).toEqual({ summoned: false, early: 'Cast Summon Cat failed', move: 'Moved 2', late: 'Hit Wizard' });
});

it('reports a slow spell that finishes this turn without a new CastStarted', () => {
  const s = lastTurnSummary([e('CastSucceeded', 'early', { action: 'Bind' })], 'w1', name);
  expect(s.early).toBe('Bind succeeded');
  expect(s.late).toBe('—');
});

it('reports a creature summoned last turn', () => {
  expect(lastTurnSummary([e('CreatureSummoned', 'early')], 'w1', name).summoned).toBe(true);
});
