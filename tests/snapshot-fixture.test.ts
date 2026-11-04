import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { restoreSnapshot, encodeSnapshot } from '../packages/persistence/src/snapshot.js';
import { stateFingerprint } from '../packages/persistence/src/digest.js';
import { applyCommand } from '../packages/engine/src/index.js';

it('loads the permanent schema-1 fixture and continues from its accepted command history', () => {
  const fixture = readFileSync('tests/fixtures/foundation-v1.json', 'utf8').trim();
  const state = restoreSnapshot(fixture);
  expect(encodeSnapshot(state)).toBe(fixture);
  expect(stateFingerprint(restoreSnapshot(fixture))).toBe(stateFingerprint(state));
  const result = applyCommand(state, { matchId: 'match', playerId: 'ai', turn: 1, commandId: 'c2', expectedRevision: 1, type: 'LockTurn' });
  expect(result.state.phase).toBe('ready');
  expect(stateFingerprint(result.state)).not.toBe(stateFingerprint(state));
});
