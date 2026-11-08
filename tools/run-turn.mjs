import assert from 'node:assert/strict';
import { createMatch, applyCommand, applySystemCommand, systemCommand } from '../dist/engine/src/index.js';
import { advanceAtomicStep } from '../dist/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../dist/persistence/src/snapshot.js';
import { stateFingerprint } from '../dist/persistence/src/digest.js';
let state = createMatch('headless-demo', ['human', 'opponent'], 3003);
state.creatures[0].centre = { q: 5, r: 5 };
state.creatures[1].centre = { q: 15, r: 15 };
state = applyCommand(state, {
  matchId: state.matchId,
  playerId: 'human',
  turn: 1,
  expectedRevision: 0,
  commandId: 'draft',
  type: 'SetOrder',
  order: { creatureId: 'wizard-0', path: [6, 7, 8, 9].map(q => ({ q, r: 5 })), early: 'Dash', late: null },
}).state;
for (const p of state.players)
  state = applyCommand(state, {
    matchId: state.matchId,
    playerId: p.id,
    turn: 1,
    expectedRevision: state.revision,
    commandId: `lock-${p.id}`,
    type: 'LockTurn',
  }).state;
state = applySystemCommand(state, systemCommand(state, 'StartResolution', 'start')).state;
let steps = 0;
const events = [];
while (state.phase !== 'planning') {
  if (++steps > 1000) throw new Error('Step limit exceeded');
  const uninterrupted = advanceAtomicStep(state);
  const resumed = advanceAtomicStep(restoreSnapshot(encodeSnapshot(state)));
  assert.deepEqual(resumed, uninterrupted);
  state = resumed.state;
  events.push(...resumed.events);
}
assert.deepEqual(state.creatures[0].centre, { q: 9, r: 5 });
console.log(
  JSON.stringify(
    {
      steps,
      turn: state.turn,
      phase: state.phase,
      position: state.creatures[0].centre,
      fingerprint: stateFingerprint(state),
      events,
    },
    null,
    2,
  ),
);
