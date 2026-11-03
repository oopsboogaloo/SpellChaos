import assert from 'node:assert/strict';
import { castingScenario,startScenarioTurn } from '../dist/scenario/src/casting.js';
import { advanceAtomicStep } from '../dist/engine/src/resolver.js';
import { encodeSnapshot,restoreSnapshot } from '../dist/persistence/src/snapshot.js';
import { stateFingerprint } from '../dist/persistence/src/digest.js';
let state=castingScenario(),steps=0;const events=[];
for(let turn=1;turn<=2;turn++){
 state=startScenarioTurn(state);
 while(!['planning','ended'].includes(state.phase)){
  if(++steps>1000)throw new Error('STEP_LIMIT');
  const direct=advanceAtomicStep(state),resumed=advanceAtomicStep(restoreSnapshot(encodeSnapshot(state)));
  assert.deepEqual(resumed,direct);state=resumed.state;events.push(...resumed.events);
 }
 if(turn===1){assert.equal(state.casts.length,1);assert.equal(state.casts[0].originId,'origin-cat');}
}
assert.equal(state.casts.length,0);assert.equal(state.turn,3);assert.equal(state.creatures[0].mana,90);
assert(events.some(e=>e.type==='CastStarted'&&e.turn===1&&e.phase==='late'));
assert(events.some(e=>['CastSucceeded','CastFailed'].includes(e.type)&&e.turn===2&&e.phase==='early'));
console.log(JSON.stringify({steps,turn:state.turn,mana:state.creatures[0].mana,balance:state.balanceUnits/2,fingerprint:stateFingerprint(state),events},null,2));
