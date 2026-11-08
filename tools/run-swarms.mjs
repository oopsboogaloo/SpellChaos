import assert from 'node:assert/strict';
import { swarmScenario } from '../dist/scenario/src/swarms.js';
import { startScenarioTurn } from '../dist/scenario/src/casting.js';
import { advanceAtomicStep } from '../dist/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../dist/persistence/src/snapshot.js';
import { stateFingerprint } from '../dist/persistence/src/digest.js';
import { restrained } from '../dist/engine/src/status.js';
let state = startScenarioTurn(swarmScenario()),
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
const swarm = state.creatures.find(c => c.id === 'snake-swarm'),
  covered = state.creatures.find(c => c.id === 'covered');
assert.deepEqual(swarm.centre, { q: 11, r: 10 });
assert.deepEqual(covered.centre, { q: 13, r: 10 });
assert(restrained(state, covered));
assert.equal(events.filter(e => ['AttackHit', 'AttackMissed'].includes(e.type)).length, 2);
assert.equal(state.turn, 2);
console.log(JSON.stringify({ steps, turn: state.turn, covered: covered.id, fingerprint: stateFingerprint(state) }));
