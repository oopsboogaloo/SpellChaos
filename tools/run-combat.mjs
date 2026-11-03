import assert from 'node:assert/strict';
import { combatScenario } from '../dist/scenario/src/combat.js';
import { advanceAtomicStep } from '../dist/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../dist/persistence/src/snapshot.js';
import { stateFingerprint } from '../dist/persistence/src/digest.js';
let state=combatScenario(),steps=0;const events=[];
while(!['planning','ended'].includes(state.phase)){
 if(++steps>1000)throw new Error('STEP_LIMIT');
 const direct=advanceAtomicStep(state),resumed=advanceAtomicStep(restoreSnapshot(encodeSnapshot(state)));
 assert.deepEqual(resumed,direct);state=resumed.state;events.push(...resumed.events);
}
assert(events.some(e=>e.type==='AttackHit'&&e.phase==='early'));
assert(events.some(e=>e.type==='AttackHit'&&e.phase==='movement'));
assert(events.some(e=>e.type==='DamageApplied'&&e.phase==='end'));
console.log(JSON.stringify({steps,turn:state.turn,hp:state.creatures.map(c=>c.hp),fingerprint:stateFingerprint(state),events},null,2));
