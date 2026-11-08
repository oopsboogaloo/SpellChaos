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

it('#28: a solid wall may be built under an airborne creature but not under a grounded one or as Energy', async () => {
  const { legalWallPlacement } = await import('../packages/geometry/src/occupancy.js');
  const flyer = { id: 'f', centre: h(9, 5), size: 3, height: 'air' as const }, walker = { ...flyer, id: 'w', height: 'ground' as const };
  const stone = { id: 's', edge: { a: h(9, 5), b: h(10, 5) }, material: 'stone' as const, hp: 8, maxHp: 8, burning: null };
  const arena = (c: object) => ({ board: { columns: 30, rows: 30 }, walls: [], creatures: [c] }) as Parameters<typeof legalWallPlacement>[0];
  expect(legalWallPlacement(arena(flyer), stone)).toBe(true);
  expect(legalWallPlacement(arena(walker), stone)).toBe(false);
  expect(legalWallPlacement(arena(flyer), { ...stone, material: 'energy' })).toBe(false);
});

it('#38: every grapple attempt reports exactly one outcome, and a too-large target is reported as ineligible', async () => {
  const { resolveCombatAction } = await import('../packages/engine/src/combat.js');
  const { summonProfile } = await import('../packages/content/src/summons.js');
  const outcomes = ['GrappleIneligible', 'GrappleMissed', 'GrappleResisted', 'HoldFormed'];
  for (const [size, seed] of [[1, 1], [1, 2], [1, 3], [6, 1]] as const) {
    const s = match(); s.phase = 'early'; s.random.resolution = seed;
    s.creatures.push(createCreature('vine', 'a', h(8), summonProfile('Summon Plant', 2)!), createCreature('prey', 'b', h(9), { size, con: 4 }));
    const events: Event[] = [];
    resolveCombatAction(s, s.creatures.find(c => c.id === 'vine')!, { type: 'Grapple', targetId: 'prey' }, events);
    const reported = events.filter(e => outcomes.includes(e.type)).map(e => e.type);
    expect(reported).toHaveLength(1);
    if (size === 6) expect(reported).toEqual(['GrappleIneligible']);
    if (reported[0] === 'HoldFormed') expect(s.holds).toHaveLength(1);
  }
});
