import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { restoreSnapshot, encodeSnapshot } from '../packages/persistence/src/snapshot.js';
import { stateFingerprint } from '../packages/persistence/src/digest.js';
import { applyCommand } from '../packages/engine/src/index.js';

it('permanent foundation fixture restores and continues from its accepted command history', () => {
  const fixture = readFileSync('tests/fixtures/foundation.json', 'utf8').trim();
  const state = restoreSnapshot(fixture);
  expect(restoreSnapshot(encodeSnapshot(state))).toEqual(state);
  expect(stateFingerprint(restoreSnapshot(fixture))).toBe(stateFingerprint(state));
  const result = applyCommand(state, {
    matchId: 'match',
    playerId: 'ai',
    turn: 1,
    commandId: 'c2',
    expectedRevision: 1,
    type: 'LockTurn',
  });
  expect(result.state.phase).toBe('ready');
  expect(stateFingerprint(result.state)).not.toBe(stateFingerprint(state));
});
