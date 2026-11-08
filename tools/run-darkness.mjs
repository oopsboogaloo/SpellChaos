import assert from 'node:assert/strict';
import { darknessScenario } from '../dist/scenario/src/darkness.js';
import { startScenarioTurn } from '../dist/scenario/src/casting.js';
import { advanceAtomicStep } from '../dist/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../dist/persistence/src/snapshot.js';
import { stateFingerprint } from '../dist/persistence/src/digest.js';
let state = startScenarioTurn(darknessScenario()),
  steps = 0;
const events = [];
while (!['planning', 'ended'].includes(state.phase)) {
  if (++steps > 1000) throw new Error('STEP_LIMIT');
  const direct = advanceAtomicStep(state),
    resumed = advanceAtomicStep(restoreSnapshot(encodeSnapshot(state)));
  assert.deepEqual(resumed, direct);
  state = resumed.state;
  events.push(...resumed.events);
}
assert.equal(state.creatures.find(c => c.id === 'hidden-unit').hp, 10);
assert.equal(state.darkness.length, 1);
assert(events.some(e => e.type === 'DarknessCreated'));
assert(events.some(e => e.type === 'AttackInvalid'));
console.log(JSON.stringify({ steps, turn: state.turn, hiddenUnitHp: 10, fingerprint: stateFingerprint(state) }));
