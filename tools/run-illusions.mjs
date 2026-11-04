import assert from 'node:assert/strict';
import { illusionScenario } from '../dist/scenario/src/illusions.js';
import { startScenarioTurn } from '../dist/scenario/src/casting.js';
import { advanceAtomicStep } from '../dist/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../dist/persistence/src/snapshot.js';
import { stateFingerprint } from '../dist/persistence/src/digest.js';
let state = startScenarioTurn(illusionScenario()), steps = 0;
const events = [];
while (!['planning', 'ended'].includes(state.phase)) {
 if (++steps > 1000) throw new Error('STEP_LIMIT');
 const direct = advanceAtomicStep(state), resumed = advanceAtomicStep(restoreSnapshot(encodeSnapshot(state)));
 assert.deepEqual(resumed, direct); state = resumed.state; events.push(...resumed.events);
}
assert.equal(state.creatures.find(c => c.id === 'survivor').hp, 10);
assert.equal(state.creatures.find(c => c.id === 'shock-victim').alive, false);
assert.equal(state.creatures.find(c => c.id === 'apparent-swarm').alive, false);
assert(events.some(e => e.type === 'DamageReversed'));
assert(state.damageLedger.every(d => d.remaining === 0));
assert.equal(state.corpses.length, 1);
console.log(JSON.stringify({ steps, turn: state.turn, survivorHp: 10, shockDeathPermanent: true, fingerprint: stateFingerprint(state) }));
