import assert from 'node:assert/strict';
import { reanimationScenario } from '../dist/scenario/src/reanimation.js';
import { startScenarioTurn } from '../dist/scenario/src/casting.js';
import { advanceAtomicStep } from '../dist/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../dist/persistence/src/snapshot.js';
import { stateFingerprint } from '../dist/persistence/src/digest.js';
for (const skeletal of [false, true]) {
  let state = reanimationScenario(skeletal),
    steps = 0;
  for (let turn = 0; turn < 2; turn++) {
    state = startScenarioTurn(state);
    while (!['planning', 'ended'].includes(state.phase)) {
      if (++steps > 1000) throw new Error('STEP_LIMIT');
      const direct = advanceAtomicStep(state),
        resumed = advanceAtomicStep(restoreSnapshot(encodeSnapshot(state)));
      assert.deepEqual(resumed, direct);
      state = resumed.state;
    }
    if (turn === 0) assert.equal(state.casts[0].action.targetId, 'corpse:fallen-snake');
  }
  const servant = state.creatures.find(c => c.kind === 'reanimated');
  assert(servant);
  assert.equal(servant.undeadClass, skeletal ? 'skeleton' : 'zombie');
  assert.equal(servant.bindingLevel, 2);
  assert.equal(servant.restorationUsed, true);
  assert.equal(servant.attacks[0].shots[0].secondary.length, 0);
  assert.equal(state.corpses[0].restorationUsed, true);
  console.log(
    JSON.stringify({
      skeletal,
      steps,
      turn: state.turn,
      bindingLevel: servant.bindingLevel,
      fingerprint: stateFingerprint(state),
    }),
  );
}
