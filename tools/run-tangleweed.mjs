import assert from 'node:assert/strict';
import { tangleweedScenario } from '../dist/scenario/src/tangleweed.js';
import { startScenarioTurn } from '../dist/scenario/src/casting.js';
import { advanceAtomicStep } from '../dist/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../dist/persistence/src/snapshot.js';
import { stateFingerprint } from '../dist/persistence/src/digest.js';
let state = startScenarioTurn(tangleweedScenario()), steps = 0;
const events = [];
while (!['planning', 'ended'].includes(state.phase)) {
 if (++steps > 1000) throw new Error('STEP_LIMIT');
 const direct = advanceAtomicStep(state), resumed = advanceAtomicStep(restoreSnapshot(encodeSnapshot(state)));
 assert.deepEqual(resumed, direct); state = resumed.state; events.push(...resumed.events);
}
assert.deepEqual(state.creatures[0].centre, {q:7,r:5});
assert.equal(state.tangleweed.length, 2);
assert.equal(state.tangleweed.find(w=>w.casterId==='mage').cells.length,1);
assert.deepEqual(state.tangleweed.find(w=>w.casterId==='mage').cells[0],{hex:{q:10,r:5},hp:6});
assert(events.some(e=>e.type==='TangleweedDamaged'));
console.log(JSON.stringify({steps,turn:state.turn,remainingPatches:state.tangleweed.length,fingerprint:stateFingerprint(state)}));
