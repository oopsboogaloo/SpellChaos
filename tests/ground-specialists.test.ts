import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMatch, createCreature, applyCommand } from '../packages/engine/src/index.js';
import { summonProfile } from '../packages/content/src/summons.js';
import { startScenarioTurn } from '../packages/scenario/src/casting.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { beginAttack, stepAttack, resolveCombatAction, hitModifiers } from '../packages/engine/src/combat.js';
import { beginPower, stepPower } from '../packages/engine/src/powers.js';
import { forceMove, startCast, completeCast } from '../packages/engine/src/casting.js';
import { canDrag } from '../packages/engine/src/drag.js';
import { hasRangedCover, pruneRootNetworks } from '../packages/engine/src/ground-traits.js';
import { movementAllowance } from '../packages/engine/src/orders.js';
import { addCondition, applyDamage } from '../packages/engine/src/damage.js';
import { ongoingDamage, cleanupDeaths, expireConditions } from '../packages/engine/src/lifecycle.js';
import { restrained } from '../packages/engine/src/status.js';
import { reverseIllusion } from '../packages/engine/src/illusions.js';
import { reanimatedProfile } from '../packages/engine/src/reanimation.js';
import { projectView } from '../packages/views/src/index.js';
import { encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import type { GameState, Order, Creature } from '../packages/domain/src/state.js';
import type { AttackAction, AttackDefinition } from '../packages/domain/src/combat.js';
import type { Event } from '../packages/engine/src/events.js';
const h = (q: number, r = 10) => ({ q, r });
const rows = [
  ['puma', 'Summon Cat', 7, 'Giant puma'],
  ['serpent', 'Summon Serpent', 8, 'The World Serpent'],
  ['forest', 'Summon Plant', 8, 'The Walking Forest'],
] as const;
type Profile = (typeof rows)[number][0];
const actor = (s: GameState) => s.creatures.find(c => c.id === 'actor')!;
const target = (s: GameState) => s.creatures.find(c => c.id === 'target')!;
function setup(name: Profile = 'puma') {
  const row = rows.find(r => r[0] === name)!,
    s = createMatch('ground-specialists', ['a', 'b'], 456);
  s.creatures[0]!.centre = h(2, 2);
  s.creatures[1]!.centre = h(16, 20);
  s.creatures.push(
    createCreature('actor', 'a', h(10), summonProfile(row[1], row[2])!),
    createCreature('target', 'b', h(name === 'puma' ? 13 : 14), { con: 10, intelligence: 1, incapacitated: true }),
  );
  for (const a of actor(s).attacks) for (const shot of a.shots) shot.crit = 0;
  return s;
}
function order(
  s: GameState,
  id: string,
  early: Order['early'] = null,
  late: Order['late'] = null,
  path: Order['path'] = [],
  extra: Pick<Partial<Order>, 'dragTargetId' | 'blinkIndex'> = {},
) {
  return applyCommand(s, {
    type: 'SetOrder',
    matchId: s.matchId,
    playerId: s.creatures.find(c => c.id === id)!.controller!,
    turn: s.turn,
    commandId: `order-${s.revision}`,
    expectedRevision: s.revision,
    order: { creatureId: id, path, early, late, ...extra },
  }).state;
}
function until(s: GameState, predicate: (s: GameState) => boolean) {
  for (let n = 0; !predicate(s); n++) {
    if (n > 1000) throw new Error('STEP_LIMIT');
    s = advanceAtomicStep(restoreSnapshot(encodeSnapshot(s))).state;
  }
  return s;
}
function run(s: GameState, restore = false) {
  const events: Event[] = [];
  for (let n = 0; !['planning', 'ended'].includes(s.phase); n++) {
    if (n > 1000) throw new Error('STEP_LIMIT');
    const r = advanceAtomicStep(restore ? restoreSnapshot(encodeSnapshot(s)) : s);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}
function hold(s: GameState) {
  s.holds.push({ grapplerId: 'actor', targetId: 'target', limb: 0 });
  return s;
}
const strike = (id = 'basic', targets: string[] = ['target']): AttackAction => ({
  type: 'Attack',
  attackId: id,
  targetIds: targets,
  ground: null,
  side: 'left',
});
function attack(s: GameState, a: AttackAction) {
  s.phase = 'early';
  const events: Event[] = [];
  beginAttack(s, actor(s), a, 'action');
  while (s.pendingAttack) stepAttack(s, events);
  return events;
}
function roots(s: GameState, seed = 3) {
  s.phase = 'early';
  s.random.resolution = seed;
  const events: Event[] = [];
  beginPower(s, actor(s), { type: 'RootNetwork' }, events);
  while (s.pendingPower) stepPower(s, events);
  return events;
}
function rootPending() {
  let s = setup('forest');
  s = until(startScenarioTurn(order(s, 'actor', { type: 'RootNetwork' })), s => s.pendingPower !== null);
  s.random.resolution = 3;
  return s;
}
function coverSetup() {
  const s = setup('forest');
  target(s).centre = h(15);
  target(s).controller = 'a';
  target(s).incapacitated = false;
  target(s).dex = 9;
  s.creatures.push(createCreature('archer', 'b', h(15, 4), summonProfile('Summon Archer', 2)!));
  s.creatures.find(c => c.id === 'archer')!.attacks[0]!.shots[0]!.crit = 0;
  return s;
}
const archer = (s: GameState) => s.creatures.find(c => c.id === 'archer')!;
it('Giant Puma Pounce adds two to its approved Bite after three approach steps', () => {
  let s = setup();
  actor(s).centre = h(6);
  target(s).centre = h(12);
  s = order(s, 'actor', null, strike(), [h(7), h(8), h(9)]);
  const ready = startScenarioTurn(s),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(target(a.state).hp).toBe(10);
});
it('Giant Puma grapples smaller bodies but cannot grapple an equal-sized one', () => {
  const s = setup();
  s.phase = 'early';
  s.random.resolution = 3;
  resolveCombatAction(s, actor(s), { type: 'Grapple', targetId: 'target' }, []);
  expect(s.holds).toHaveLength(1);
  s.holds = [];
  target(s).size = 5;
  s.random.resolution = 3;
  resolveCombatAction(s, actor(s), { type: 'Grapple', targetId: 'target' }, []);
  expect(s.holds).toEqual([]);
});
it.each([-1, 1])('Drag translates both footprints atomically in direction %i', direction => {
  let s = hold(setup());
  s = order(s, 'actor', null, null, [h(10 + direction), h(10 + 2 * direction)], { dragTargetId: 'target' });
  const ready = startScenarioTurn(s),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(actor(a.state).centre).toEqual(h(10 + 2 * direction));
  expect(target(a.state).centre).toEqual(h(13 + 2 * direction));
  expect(a.state.holds).toEqual([{ grapplerId: 'actor', targetId: 'target', limb: 0 }]);
  expect(a.events.filter(e => e.type === 'CreatureForcedMoved' && e.creatureId === 'target')).toHaveLength(2);
});
it('Drag costs half Move with positive rounding and ordinary Dash/Slowed budgets', () => {
  const s = hold(setup()),
    base: Order = { creatureId: 'actor', path: [], early: null, late: null, dragTargetId: 'target' };
  expect(movementAllowance(actor(s), base)).toBe(2);
  expect(movementAllowance(actor(s), { ...base, early: 'Dash' })).toBe(5);
  actor(s).slowed = true;
  expect(movementAllowance(actor(s), base)).toBe(1);
  expect(movementAllowance(actor(s), { ...base, early: 'Dash' })).toBe(2);
});
it('Drag cannot silently become free ordinary movement when its hold is lost', () => {
  let s = hold(setup());
  s = order(s, 'actor', null, null, [h(9)], { dragTargetId: 'target' });
  s = until(startScenarioTurn(s), s => s.phase === 'movement');
  s.holds = [];
  const a = run(s),
    b = run(s, true);
  expect(b).toEqual(a);
  expect(actor(a.state).centre).toEqual(h(10));
  expect(target(a.state).centre).toEqual(h(13));
});
it.each([3, 7])('planned Early Grapple makes Drag conditional without granting a hold (%i)', seed => {
  let s = setup();
  s = order(s, 'actor', { type: 'Grapple', targetId: 'target' }, null, [h(9), h(8)], { dragTargetId: 'target' });
  expect(s.holds).toEqual([]);
  s = until(
    startScenarioTurn(s),
    s => s.phase === 'early' && s.cursor.initialized && s.cursor.entries[s.cursor.index]?.creatureId === 'actor',
  );
  s.random.resolution = seed;
  s = advanceAtomicStep(s).state;
  expect(s.holds.length).toBe(seed === 3 ? 1 : 0);
  const a = run(s),
    b = run(s, true);
  expect(b).toEqual(a);
  expect(actor(a.state).centre).toEqual(h(seed === 3 ? 8 : 10));
  expect(target(a.state).centre).toEqual(h(seed === 3 ? 11 : 13));
});
it('Drag requires its capability, held identity, movement path and no Blink segment', () => {
  const s = hold(setup());
  expect(() => order(s, 'actor', null, null, [], { dragTargetId: 'target' })).toThrow('INVALID_DRAG_ORDER');
  expect(() => order(s, 'actor', null, null, [h(9)], { dragTargetId: 'missing' })).toThrow('INVALID_DRAG_ORDER');
  actor(s).blink = { range: 3 };
  expect(() => order(s, 'actor', null, null, [h(9)], { dragTargetId: 'target', blinkIndex: 0 })).toThrow(
    'INVALID_DRAG_ORDER',
  );
  delete actor(s).drag;
  expect(() => order(s, 'actor', null, null, [h(9)], { dragTargetId: 'target' })).toThrow('INVALID_DRAG_ORDER');
});
it('other restraints or a second holder stop Drag instead of becoming Escape', () => {
  for (const kind of ['source', 'target', 'holder'] as const) {
    const s = hold(setup());
    if (kind === 'source') actor(s).restrained = true;
    else if (kind === 'target') target(s).restrained = true;
    else {
      s.creatures.push(createCreature('holder', 'b', h(14), { grappleLimbs: 1 }));
      s.holds.push({ grapplerId: 'holder', targetId: 'target', limb: 0 });
    }
    expect(() => order(s, 'actor', null, null, [h(9)], { dragTargetId: 'target' })).toThrow('INVALID_DRAG_ORDER');
  }
});
it('the carried footprint cannot cross a solid wall even when incorporeal', () => {
  const s = hold(setup());
  target(s).incorporeal = true;
  s.walls.push({ id: 'wall', edge: { a: h(13), b: h(14) }, material: 'stone', hp: 20, maxHp: 20, burning: null });
  expect(() => order(s, 'actor', null, null, [h(11)], { dragTargetId: 'target' })).toThrow('INVALID_PATH');
});
it('a blocked carried destination stops both bodies and never reroutes', () => {
  let s = hold(setup());
  s.creatures.push(createCreature('blocker', 'b', h(14)));
  s = order(s, 'actor', null, null, [h(11)], { dragTargetId: 'target' });
  const r = run(startScenarioTurn(s), true);
  expect(actor(r.state).centre).toEqual(h(10));
  expect(target(r.state).centre).toEqual(h(13));
});
it('the whole carried footprint must remain inside the board', () => {
  const s = hold(setup());
  actor(s).centre = h(2, 4);
  target(s).centre = h(-1, 4);
  expect(() => order(s, 'actor', null, null, [h(1, 4), h(0, 4)], { dragTargetId: 'target' })).toThrow('INVALID_PATH');
});
it('Drag revalidates an obstruction after preparing the pair path', () => {
  let s = hold(setup());
  s.creatures.push(createCreature('blocker', 'b', h(20, 5)));
  s = until(
    startScenarioTurn(order(s, 'actor', null, null, [h(11)], { dragTargetId: 'target' })),
    s => s.phase === 'movement' && s.cursor.activePath !== null,
  );
  s.creatures.find(c => c.id === 'blocker')!.centre = h(14);
  const a = run(s),
    b = run(s, true);
  expect(b).toEqual(a);
  expect(actor(a.state).centre).toEqual(h(10));
  expect(target(a.state).centre).toEqual(h(13));
});
it('Drag triggers Guard for the Puma but never for its forcibly moved victim', () => {
  let s = hold(setup());
  s.creatures.push(createCreature('source-guard', 'b', h(10, 6)), createCreature('victim-guard', 'a', h(14, 8)));
  s = order(s, 'source-guard', { type: 'Guard', attackId: 'staff', targetId: 'actor', area: [] });
  s = order(s, 'victim-guard', { type: 'Guard', attackId: 'staff', targetId: 'target', area: [] });
  s = order(s, 'actor', null, null, [h(10, 9)], { dragTargetId: 'target' });
  const ready = startScenarioTurn(s),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(a.events.some(e => e.creatureId === 'source-guard' && ['AttackHit', 'AttackMissed'].includes(e.type))).toBe(
    true,
  );
  expect(a.events.some(e => e.creatureId === 'victim-guard' && ['AttackHit', 'AttackMissed'].includes(e.type))).toBe(
    false,
  );
});
it('Drag interrupts the victim cast without refunding the spent mana', () => {
  let s = hold(setup());
  target(s).incapacitated = false;
  Object.assign(target(s), { mana: 50, maxMana: 50, spellbook: ['Bind'], spellLevelCap: 7 });
  s = order(s, 'target', {
    type: 'Cast',
    spell: 'Bind',
    level: 7,
    variant: 'bound',
    targetId: 'actor',
    ground: null,
    side: 'left',
  });
  s = order(s, 'actor', null, null, [h(9)], { dragTargetId: 'target' });
  const ready = startScenarioTurn(s),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(target(a.state).mana).toBe(15);
  expect(a.events.filter(e => e.type === 'CastInterrupted' && e.creatureId === 'target')).toHaveLength(1);
});
it('Drag keeps only the voluntary approach trail and actual pair movement history', () => {
  let s = hold(setup());
  target(s).pounce = { attackId: 'staff', steps: 3, damage: 2 };
  s = until(
    startScenarioTurn(order(s, 'actor', null, null, [h(9)], { dragTargetId: 'target' })),
    s => actor(s).centre.q === 9,
  );
  expect(s.moved).toEqual(expect.arrayContaining(['actor', 'target']));
  expect(actor(s).pounceTrail).toEqual([h(10), h(9)]);
  expect(target(s).pounceTrail).toBeUndefined();
  expect(s.cursor.lastRestingCentre).toEqual(h(9));
});
it('World Serpent keeps Bite and Sweep as explicit alternative attacks', () => {
  const s = setup('serpent');
  expect(actor(s).attacks.map(a => a.id)).toEqual(['basic', 'tail-sweep']);
  attack(s, strike());
  expect(target(s).hp).toBe(10);
});
it('Tail Sweep hits every adjacent ally and enemy once with exact continuation', () => {
  let s = setup('serpent');
  s.creatures.push(createCreature('z-ally', 'a', h(10, 14), { con: 10, incapacitated: true }));
  s = order(s, 'actor', strike('tail-sweep', []));
  const ready = startScenarioTurn(s),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(target(a.state).hp).toBe(15);
  expect(a.state.creatures.find(c => c.id === 'z-ally')!.hp).toBe(15);
  expect(a.events.filter(e => e.type === 'AttackHit' && e.creatureId === 'actor')).toHaveLength(2);
});
// D25 (owner ruling 8 Nov 2026, #36): a sweep hits a swarm overlapping the attacker.
it('Sweep hits an overlapping swarm and an adjacent flyer, excludes distant bodies, and uses one roll per creature', () => {
  const s = setup('serpent');
  target(s).height = 'air';
  target(s).centre = h(10, 6);
  s.creatures.push(
    createCreature('large', 'b', h(15), { size: 3, con: 5, incapacitated: true }),
    createCreature('distant', 'b', h(18)),
    createCreature('covered', 'b', h(10), { swarm: true, originalSize: 1, size: 1, con: 10, incapacitated: true }),
  );
  const events = attack(s, strike('tail-sweep', []));
  // Ground melee reaches an adjacent flyer, at disadvantage (owner ruling 9 Nov 2026, #61).
  expect(events.filter(e => ['AttackHit', 'AttackMissed'].includes(e.type) && e.targetId === 'target')).toHaveLength(1);
  expect(events.some(e => e.targetId === 'distant')).toBe(false);
  expect(s.creatures.find(c => c.id === 'large')!.hp).toBe(10);
  expect(s.creatures.find(c => c.id === 'covered')!.hp).toBeLessThan(10);
  expect(events.filter(e => e.type === 'AttackHit' && e.targetId === 'large')).toHaveLength(1);
  expect(events.filter(e => e.type === 'AttackHit' && e.targetId === 'covered')).toHaveLength(1);
});
it('Sweep applies area physical rules to a swarm, while Branches remain discrete attacks', () => {
  for (const name of ['serpent', 'forest'] as const) {
    const s = setup(name);
    Object.assign(target(s), summonProfile('Summon Serpent', 4)!, { centre: h(16), incapacitated: true });
    attack(s, strike(name === 'serpent' ? 'tail-sweep' : 'basic', []));
    expect(target(s).hp).toBe(name === 'serpent' ? 16 : 21);
  }
});
it('Sweep cannot select a wall or ground impact as a substitute target', () => {
  const s = setup('serpent');
  s.walls.push({ id: 'wall', edge: { a: h(13), b: h(14) }, material: 'stone', hp: 20, maxHp: 20, burning: null });
  expect(() => order(s, 'actor', { ...strike('tail-sweep', []), structure: { kind: 'wall', id: 'wall' } })).toThrow(
    'INVALID_ATTACK_TARGETS',
  );
  expect(() => order(s, 'actor', { ...strike('tail-sweep', []), ground: h(14) })).toThrow('INVALID_ATTACK_TARGETS');
});
it('Sweep Guard uses the full sweep including an adjacent ally', () => {
  let s = setup('serpent');
  target(s).centre = h(15);
  target(s).incapacitated = false;
  target(s).hp = 3;
  s.creatures.push(createCreature('z-ally', 'a', h(10, 14), { con: 10, incapacitated: true }));
  s.walls.push({ id: 'fire', edge: { a: h(14), b: h(15) }, material: 'fire', hp: 20, maxHp: 20, burning: null });
  s = order(s, 'actor', { type: 'Guard', attackId: 'tail-sweep', targetId: 'target', area: [] });
  s = order(s, 'target', null, null, [h(14)]);
  const ready = startScenarioTurn(s),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(a.events.filter(e => e.type === 'AttackHit' && e.creatureId === 'actor')).toHaveLength(2);
  expect(a.state.creatures.find(c => c.id === 'z-ally')!.hp).toBe(15);
});
it('Bristles incapacitation stops the remaining physical Sweep victims', () => {
  const s = setup('serpent');
  actor(s).hp = 1;
  Object.assign(target(s), summonProfile('Summon Plant', 3)!, { centre: h(15), incapacitated: true });
  s.creatures.push(createCreature('z-victim', 'b', h(10, 14), { incapacitated: true }));
  attack(s, strike('tail-sweep', []));
  expect(actor(s).hp).toBe(0);
  expect(s.creatures.find(c => c.id === 'z-victim')!.hp).toBe(10);
});
it('a committed Sweep revalidates listed bodies instead of finding replacements', () => {
  let s = setup('serpent');
  s.creatures.push(
    createCreature('z-victim', 'b', h(10, 14), { incapacitated: true }),
    createCreature('latecomer', 'b', h(20, 5)),
  );
  s = until(startScenarioTurn(order(s, 'actor', strike('tail-sweep', []))), s => s.pendingAttack !== null);
  s = advanceAtomicStep(s).state;
  expect(s.pendingAttack!.victimIndex).toBe(1);
  s.creatures.find(c => c.id === 'z-victim')!.centre = h(20, 5);
  s.creatures.find(c => c.id === 'latecomer')!.centre = h(10, 14);
  const a = run(s),
    b = run(s, true);
  expect(b).toEqual(a);
  expect(a.state.creatures.find(c => c.id === 'latecomer')!.hp).toBe(10);
});
it('Constriction deals four physical at the application turn end and resumes exactly', () => {
  let s = hold(setup('serpent'));
  s = order(s, 'actor');
  const ready = startScenarioTurn(s),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(target(a.state).hp).toBe(16);
  expect(a.events.filter(e => e.type === 'DamageApplied' && e.creatureId === 'target')).toHaveLength(1);
});
it('Constriction uses the simultaneous snapshot even if Bleeding incapacitates its source', () => {
  const s = hold(setup('serpent'));
  actor(s).hp = 1;
  addCondition(s, actor(s), 'Bleeding', 'wizard-1', 1, null, 'con');
  ongoingDamage(s, []);
  expect(actor(s).hp).toBe(0);
  expect(target(s).hp).toBe(16);
  cleanupDeaths(s, []);
  expect(s.holds).toEqual([]);
});
it.each(['inactive', 'separated', 'air'] as const)('%s holders or targets do not create remote Constriction', kind => {
  const s = hold(setup('serpent'));
  if (kind === 'inactive') actor(s).incapacitated = true;
  else if (kind === 'separated') target(s).centre = h(18);
  else target(s).height = 'air';
  ongoingDamage(s, []);
  expect(target(s).hp).toBe(20);
});
it('Constriction respects physical defence and reversible illusion damage', () => {
  const s = hold(setup('serpent'));
  target(s).defences = [{ type: 'physical', multiplier: 0.25 }];
  ongoingDamage(s, []);
  expect(target(s).hp).toBe(19);
  const b = hold(setup('serpent'));
  Object.assign(actor(b), { kind: 'illusion', creatorId: 'wizard-0', knownIllusionBy: ['a'] });
  ongoingDamage(b, []);
  expect(target(b).hp).toBe(16);
  reverseIllusion(b, 'actor', []);
  expect(target(b).hp).toBe(20);
  target(b).intelligence = 0;
  ongoingDamage(b, []);
  expect(target(b).hp).toBe(20);
});
it('Walking Forest Branches hit only adjacent enemies and allow no substitute ally targets', () => {
  const s = setup('forest');
  s.creatures.push(
    createCreature('ally', 'a', h(10, 14), { con: 10, incapacitated: true }),
    createCreature('z-enemy', 'b', h(6), { con: 10, incapacitated: true }),
  );
  const events = attack(s, strike('basic', []));
  expect(target(s).hp).toBe(14);
  expect(s.creatures.find(c => c.id === 'z-enemy')!.hp).toBe(14);
  expect(s.creatures.find(c => c.id === 'ally')!.hp).toBe(20);
  expect(events.filter(e => e.type === 'AttackHit')).toHaveLength(2);
  expect(() => order(setup('forest'), 'actor', strike('basic', ['target']))).toThrow('INVALID_ATTACK_TARGETS');
});
it('Root Network applies physical-eight linked restraint without damage or a timer', () => {
  const s = setup('forest');
  roots(s);
  expect(target(s).conditions).toEqual([
    expect.objectContaining({
      kind: 'Restrained',
      potency: 8,
      resistance: 'physical',
      endsTurn: null,
      rootNetwork: true,
      requiresDamage: false,
      sourceId: 'actor',
    }),
  ]);
  expect(target(s).hp).toBe(20);
  expect(restrained(s, target(s))).toBe(true);
});
it('Root Network snapshots all eligible smaller ground enemies once', () => {
  const s = setup('forest');
  s.creatures.push(
    createCreature('ally', 'a', h(10, 14)),
    createCreature('air', 'b', h(10, 6), { height: 'air' }),
    createCreature('equal', 'b', h(3), { size: 8, con: 2 }),
    createCreature('z-victim', 'b', h(14, 6)),
  );
  s.phase = 'early';
  beginPower(s, actor(s), { type: 'RootNetwork' }, []);
  expect(s.pendingPower!.targets).toEqual(['target', 'z-victim']);
});
it('Root Network can fail physical resistance and does not use target Int', () => {
  const s = setup('forest');
  target(s).intelligence = 100;
  roots(s, 3);
  expect(restrained(s, target(s))).toBe(true);
  target(s).conditions = [];
  target(s).size = 7;
  target(s).centre = h(17);
  roots(s, 1);
  expect(target(s).conditions).toEqual([]);
});
it('physical Escape releases roots using Size against eight and does not use Int', () => {
  const s = setup('forest');
  roots(s);
  target(s).intelligence = 100;
  s.random.resolution = 3;
  resolveCombatAction(s, target(s), 'Escape', []);
  expect(restrained(s, target(s))).toBe(true);
  target(s).intelligence = 0;
  target(s).size = 8;
  s.random.resolution = 1;
  resolveCombatAction(s, target(s), 'Escape', []);
  expect(restrained(s, target(s))).toBe(false);
});
it('root links expire on separation, obstruction or source incapacitation', () => {
  for (const kind of ['separation', 'wall', 'incapacitated'] as const) {
    const s = setup('forest');
    roots(s);
    if (kind === 'separation') forceMove(s, target(s), h(18), []);
    else if (kind === 'wall') {
      s.walls.push({ id: 'wall', edge: { a: h(13), b: h(14) }, material: 'stone', hp: 20, maxHp: 20, burning: null });
      pruneRootNetworks(s);
    } else {
      actor(s).incapacitated = true;
      cleanupDeaths(s, []);
    }
    expect(target(s).conditions).toEqual([]);
  }
});
it('root sources can move away, ending their link without dragging the victim', () => {
  let s = rootPending();
  s = advanceAtomicStep(s).state;
  s = run(s, true).state;
  s = order(s, 'actor', null, null, [h(9)]);
  const ready = startScenarioTurn(s),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(actor(a.state).centre).toEqual(h(9));
  expect(target(a.state).centre).toEqual(h(14));
  expect(restrained(a.state, target(a.state))).toBe(false);
});
it('Root Network has physical contact blocked by crystal and cannot bypass a normal action budget', () => {
  const s = setup('forest');
  s.walls.push({ id: 'crystal', edge: { a: h(13), b: h(14) }, material: 'crystal', hp: 20, maxHp: 20, burning: null });
  roots(s);
  expect(target(s).conditions).toEqual([]);
  expect(() => order(setup('forest'), 'actor', { type: 'RootNetwork' }, { type: 'RootNetwork' })).toThrow(
    'ACTION_BUDGET',
  );
});
it('real roots can restrain Int0 constructs; illusory roots cannot', () => {
  for (const illusion of [false, true]) {
    const s = setup('forest');
    target(s).intelligence = 0;
    target(s).construct = true;
    if (illusion) Object.assign(actor(s), { kind: 'illusion', creatorId: 'wizard-0', knownIllusionBy: ['a'] });
    roots(s);
    expect(restrained(s, target(s))).toBe(!illusion);
  }
});
it('illusory roots and Branch damage retain reversible source provenance', () => {
  const s = setup('forest');
  Object.assign(actor(s), { kind: 'illusion', creatorId: 'wizard-0', knownIllusionBy: ['a'] });
  roots(s);
  expect(target(s).conditions[0]!.illusionId).toBe('actor');
  attack(s, strike('basic', []));
  expect(target(s).hp).toBe(14);
  reverseIllusion(s, 'actor', []);
  expect(target(s).hp).toBe(20);
  expect(target(s).conditions).toEqual([]);
});
it('Root Network does not infer or prune ordinary historical restraint', () => {
  const s = setup('forest');
  addCondition(s, target(s), 'Restrained', 'wizard-1', 5, 2, 'int');
  actor(s).incapacitated = true;
  pruneRootNetworks(s);
  expect(target(s).conditions).toHaveLength(1);
  expect(target(s).conditions[0]).not.toHaveProperty('rootNetwork');
});
it('Root Network has exact early/late continuation and normal summon readiness', () => {
  const s = rootPending();
  expect(run(s, true)).toEqual(run(s));
  const b = setup('forest');
  actor(b).readyTurn = 2;
  expect(() => order(b, 'actor', { type: 'RootNetwork' })).toThrow('INELIGIBLE_CREATURE');
});
it('ranged cover reaches two occupied-hex steps but excludes self, other teams, air and inactive sources', () => {
  const s = coverSetup(),
    a = archer(s).attacks[0]!;
  expect(hasRangedCover(s, archer(s), target(s), a)).toBe(true);
  target(s).centre = h(16);
  expect(hasRangedCover(s, archer(s), target(s), a)).toBe(false);
  target(s).centre = h(15);
  target(s).height = 'air';
  expect(hasRangedCover(s, archer(s), target(s), a)).toBe(false);
  target(s).height = 'ground';
  target(s).controller = 'b';
  expect(hasRangedCover(s, archer(s), target(s), a)).toBe(false);
  target(s).controller = 'a';
  actor(s).incapacitated = true;
  expect(hasRangedCover(s, archer(s), target(s), a)).toBe(false);
  actor(s).incapacitated = false;
  expect(hasRangedCover(s, archer(s), actor(s), a)).toBe(false);
});
it.each([false, true])('ranged cover changes production hit rolls and restores every boundary (%s)', cover => {
  let s = coverSetup();
  if (!cover) delete actor(s).rangedCover;
  s = order(s, 'target');
  s = order(s, 'archer', { type: 'Attack', attackId: 'basic', targetIds: ['target'], ground: null, side: 'left' });
  s = until(startScenarioTurn(s), s => s.pendingAttack?.attackerId === 'archer');
  s.random.resolution = 2;
  const a = run(s),
    b = run(s, true);
  expect(b).toEqual(a);
  expect(target(a.state).hp).toBe(cover ? 20 : 18);
});
it('cover applies to projectile/direct spells but not melee or automatic areas and never stacks', () => {
  const s = coverSetup(),
    a = archer(s).attacks[0]!;
  expect(hitModifiers(s, archer(s), target(s), a)[1]).toBe(true);
  s.creatures.push(createCreature('second-cover', 'a', h(17), { rangedCover: { range: 2 } }));
  expect(hitModifiers(s, archer(s), target(s), a)[1]).toBe(true);
  expect(hasRangedCover(s, archer(s), target(s), { ...a, mode: 'direct' })).toBe(true);
  expect(hasRangedCover(s, archer(s), target(s), { ...a, mode: 'melee' })).toBe(false);
  expect(hasRangedCover(s, archer(s), target(s), { ...a, mode: 'area' })).toBe(false);
});
it('creation-turn passive cover is immediate and illusory cover ignores Int0 attackers', () => {
  const s = coverSetup(),
    a = archer(s).attacks[0]!;
  actor(s).readyTurn = 2;
  expect(hasRangedCover(s, archer(s), target(s), a)).toBe(true);
  Object.assign(actor(s), { kind: 'illusion', creatorId: 'wizard-0', knownIllusionBy: ['a'] });
  archer(s).intelligence = 0;
  expect(hasRangedCover(s, archer(s), target(s), a)).toBe(false);
  archer(s).intelligence = 1;
  expect(hasRangedCover(s, archer(s), target(s), a)).toBe(true);
});
it.each(rows)(
  '%s supports all three summon variants with readiness and isolated capability data',
  (name, spell, level, species) => {
    for (const variant of ['bound', 'unbound', 'illusion'] as const) {
      const s = createMatch('summon-ground', ['a', 'b'], 456),
        wizard = s.creatures[0]!;
      wizard.centre = h(4);
      s.creatures[1]!.centre = h(16, 20);
      wizard.spellbook = [spell];
      s.phase = 'early';
      s.random.resolution = 1;
      startCast(s, wizard, { type: 'Cast', spell, level, variant, targetId: null, ground: h(8), side: 'left' }, []);
      completeCast(s, s.casts[0]!.id, []);
      const summoned = s.creatures.find(c => c.species === species)!;
      expect(summoned.readyTurn).toBe(2);
      expect(
        name === 'puma' ? summoned.drag : name === 'serpent' ? summoned.constriction : summoned.rootNetwork,
      ).toBeDefined();
      expect(summoned.kind).toBe(variant === 'illusion' ? 'illusion' : 'summon');
    }
  },
);
it.each(rows)('%s reanimation strips signature powers and retains approved basic body attacks', name => {
  const s = setup(name),
    body = createCreature('body', 'a', h(10), reanimatedProfile(actor(s), false));
  expect(body.drag).toBeUndefined();
  expect(body.pounce).toBeUndefined();
  expect(body.constriction).toBeUndefined();
  expect(body.rootNetwork).toBeUndefined();
  expect(body.rangedCover).toBeUndefined();
  expect(body.attacks.map(a => a.id)).toEqual(name === 'forest' ? [] : ['basic']);
});
it('the profiles retain approved defences and Walking Forest corpse exclusion', () => {
  const s = setup('serpent');
  expect(applyDamage(s, actor(s), [{ type: 'poison', amount: 4 }], [])).toBe(0);
  expect(applyDamage(s, actor(s), [{ type: 'cold', amount: 4 }], [])).toBe(2);
  expect(applyDamage(s, actor(s), [{ type: 'light', amount: 4 }], [])).toBe(6);
  const f = setup('forest');
  expect(applyDamage(f, actor(f), [{ type: 'physical', amount: 4 }], [])).toBe(1);
  expect(applyDamage(f, actor(f), [{ type: 'fire', amount: 4 }], [])).toBe(8);
  expect(actor(f).corpseEligible).toBe(false);
});
it('public capability copies do not expose private Drag orders or root cursors', () => {
  let s = hold(setup());
  s = order(s, 'actor', null, null, [h(9)], { dragTargetId: 'target' });
  const view = projectView(s, 'b'),
    shown = view.creatures.find(c => c.id === 'actor')!;
  expect(view.orders.some(o => o.creatureId === 'actor')).toBe(false);
  expect(shown.drag).toEqual({ moveDivisor: 2 });
  shown.drag!.moveDivisor = 99 as 2;
  expect(actor(s).drag!.moveDivisor).toBe(2);
  const r = rootPending();
  expect(projectView(r, 'b')).not.toHaveProperty('pendingPower');
});
it.each(['drag-middle', 'sweep-middle', 'constriction', 'roots-middle', 'cover-shot'])(
  'permanent %s fixture restores without repeating a completed step',
  name => {
    const text = readFileSync(`tests/fixtures/ground-${name}.json`, 'utf8').trim(),
      s = restoreSnapshot(text);
    expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
    expect(run(s, true)).toEqual(run(s));
    if (name === 'sweep-middle')
      expect(run(s).events.some(e => e.type === 'AttackHit' && e.targetId === 'target')).toBe(false);
  },
);
it('malformed drag paths, cleave definitions and root links fail transactionally', () => {
  const s = setup('forest'),
    before = encodeSnapshot(s);
  for (const mutate of [
    (raw: GameState) => {
      actor(raw).attacks[0]!.range = 2;
    },
    (raw: GameState) => {
      delete actor(raw).attacks[0]!.targetTeams;
    },
    (raw: GameState) => {
      target(raw).conditions = [
        {
          kind: 'Restrained',
          potency: 8,
          resistance: 'physical',
          duration: null,
          requiresDamage: false,
          startsTurn: 1,
          endsTurn: null,
          activatesTurn: null,
          active: true,
          sourceId: 'wizard-0',
          illusionId: null,
          rootNetwork: true,
        },
      ];
    },
  ]) {
    const raw = JSON.parse(before) as GameState;
    mutate(raw);
    expect(() => restoreSnapshot(JSON.stringify(raw))).toThrow();
  }
  expect(encodeSnapshot(s)).toBe(before);
});
