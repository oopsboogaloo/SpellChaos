import { expect, it } from 'vitest';
import { applyCommand, createCreature, createMatch } from '../packages/engine/src/index.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { forceMove } from '../packages/engine/src/casting.js';
import { startScenarioTurn } from '../packages/scenario/src/casting.js';
import type { GameState, Order } from '../packages/domain/src/state.js';
import type { Event } from '../packages/engine/src/events.js';

const h = (q: number, r = 10) => ({ q, r });
function match(): GameState {
  const s = createMatch('rules', ['a', 'b'], 11);
  s.creatures[0]!.centre = h(5); s.creatures[1]!.centre = h(20, 20);
  return s;
}
function order(s: GameState, o: Partial<Order> & { creatureId: string }): GameState {
  return applyCommand(s, { type: 'SetOrder', matchId: s.matchId, playerId: 'a', turn: s.turn, commandId: `o-${s.revision}`, expectedRevision: s.revision, order: { path: [], early: null, late: null, ...o } }).state;
}
function until(s: GameState, done: (s: GameState) => boolean, events: Event[] = []): GameState {
  for (let n = 0; !done(s); n++) { if (n > 2000) throw new Error('STEP_LIMIT'); const r = advanceAtomicStep(s); s = r.state; events.push(...r.events); }
  return s;
}
const finished = (s: GameState) => ['planning', 'ended'].includes(s.phase);
const wall = (material: 'thorns' | 'death', a: number, b: number) => ({ id: `${material}-${a}`, edge: { a: h(a), b: h(b) }, material, hp: 20, maxHp: 20, burning: null }) as GameState['walls'][number];

it('#25: a forced move does not use up a Subdued creature\'s one chosen action', () => {
  let s = match(); s.creatures[0]!.subdued = true;
  s = until(startScenarioTurn(order(s, { creatureId: 'wizard-0', late: 'Defend' })), x => x.phase === 'early' && x.cursor.initialized);
  forceMove(s, s.creatures[0]!, h(6), []);
  const events: Event[] = [];
  until(s, finished, events);
  expect(events.some(e => e.type === 'ActionResolved' && e.creatureId === 'wizard-0' && e.action === 'Defend')).toBe(true);
});

it('#26: an unresolved Dash cannot pay for costly steps beyond normal Move', () => {
  let s = match(); s.walls.push(wall('thorns', 6, 7));
  s = until(startScenarioTurn(order(s, { creatureId: 'wizard-0', early: 'Dash', path: [h(6), h(7), h(8)] })), x => x.phase === 'movement' && !x.cursor.initialized);
  s.dashed = [];
  s = until(s, x => x.phase === 'late');
  expect(s.movementSpent.find(m => m.creatureId === 'wizard-0')?.amount ?? 0).toBeLessThanOrEqual(2);
  expect(s.creatures[0]!.centre).toEqual(h(6));
});

it('#27: an illusory undead crossing a Death wall is not healed', () => {
  let s = match();
  s.creatures.push(createCreature('shade', 'a', h(8), { kind: 'illusion', creatorId: 'wizard-0', undead: true, size: 2, con: 3, hp: 1, maxHp: 6 }));
  s.walls.push(wall('death', 8, 9));
  s = until(startScenarioTurn(order(s, { creatureId: 'shade', path: [h(9)] })), finished);
  const shade = s.creatures.find(c => c.id === 'shade')!;
  expect(shade.centre).toEqual(h(9));
  expect(shade.hp).toBe(1);
});
