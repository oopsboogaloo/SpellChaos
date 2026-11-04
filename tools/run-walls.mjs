import assert from 'node:assert/strict';
import { wallScenario } from '../dist/scenario/src/walls.js';
import { startScenarioTurn } from '../dist/scenario/src/casting.js';
import { advanceAtomicStep } from '../dist/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../dist/persistence/src/snapshot.js';
import { stateFingerprint } from '../dist/persistence/src/digest.js';
let state = startScenarioTurn(wallScenario()), steps = 0;
const events = [];
while (!['planning', 'ended'].includes(state.phase)) {
 if (++steps > 1000) throw new Error('STEP_LIMIT');
 const direct = advanceAtomicStep(state), resumed = advanceAtomicStep(restoreSnapshot(encodeSnapshot(state)));
 assert.deepEqual(resumed, direct); state = resumed.state; events.push(...resumed.events);
}
assert.deepEqual(state.creatures[0].centre,{q:8,r:5});
assert.equal(state.creatures[0].hp,4);
assert.equal(state.creatures.find(c=>c.id==='illusion').alive,false);
assert.equal(state.walls.find(w=>w.material==='crystal').hp,11);
assert(events.some(e=>e.type==='DamageReversed'));
console.log(JSON.stringify({steps,turn:state.turn,wizardHp:4,crystalHp:11,fingerprint:stateFingerprint(state)}));
