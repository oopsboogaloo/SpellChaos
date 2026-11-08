import { it, expect } from 'vitest';
import { createMatch, createCreature, applyCommand } from '../packages/engine/src/index.js';
import { summonProfile } from '../packages/content/src/summons.js';
import { tracePenetratingProjectile, traceProjectile } from '../packages/geometry/src/occupancy.js';
import { distance } from '../packages/geometry/src/hex.js';
import { arenaOf } from '../packages/engine/src/orders.js';
import { startScenarioTurn } from '../packages/scenario/src/casting.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import type { GameState, Order } from '../packages/domain/src/state.js';
import type { Event } from '../packages/engine/src/events.js';
function setup(seed = 456) {
  const s = createMatch('ballista', ['a', 'b'], seed);
  s.creatures[0]!.centre = { q: 2, r: 2 };
  s.creatures[1]!.centre = { q: 20, r: 15 };
  s.creatures.push(
    createCreature('ballista', 'a', { q: 6, r: 5 }, summonProfile('Summon Archer', 5)!),
    ...['first', 'second', 'third'].map((id, i) =>
      createCreature(id, i === 1 ? 'a' : 'b', { q: 10 + 2 * i, r: 5 }, { con: 20 }),
    ),
  );
  return s;
}
const gun = (s: GameState) => s.creatures.find(c => c.id === 'ballista')!;
const body = (s: GameState, id: string) => s.creatures.find(c => c.id === id)!;
function order(
  s: GameState,
  action: Order['early'] = { type: 'Attack', attackId: 'basic', targetIds: ['first'], ground: null, side: 'left' },
) {
  return applyCommand(s, {
    type: 'SetOrder',
    matchId: s.matchId,
    playerId: 'a',
    turn: s.turn,
    commandId: `order-${s.revision}`,
    expectedRevision: s.revision,
    order: { creatureId: 'ballista', path: [], early: action, late: null },
  }).state;
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
function trace(s: GameState, side: 'left' | 'right' = 'left') {
  return tracePenetratingProjectile(arenaOf(s), gun(s), body(s, 'first').centre, 'ground', side, 12, 'first');
}
it('penetration follows one ray, includes allies and never selects a third body', () => {
  expect(trace(setup()).hits).toEqual(['first', 'second']);
});
it('large initial footprints are crossed once and overlapping swarms are skipped until beyond them', () => {
  const s = setup();
  Object.assign(body(s, 'first'), { size: 5, centre: { q: 12, r: 5 } });
  Object.assign(body(s, 'second'), { swarm: true, centre: { q: 11, r: 5 } });
  body(s, 'third').centre = { q: 16, r: 5 };
  expect(trace(s).hits).toEqual(['first', 'third']);
});
it('penetration ends at range and respects solid walls behind the first body', () => {
  const s = setup();
  body(s, 'second').centre = { q: 20, r: 5 };
  body(s, 'third').centre = { q: 21, r: 5 };
  expect(trace(s).hits).toEqual(['first']);
  body(s, 'second').centre = { q: 12, r: 5 };
  s.walls.push({
    id: 'wall',
    edge: { a: { q: 11, r: 5 }, b: { q: 12, r: 5 } },
    material: 'stone',
    hp: 29,
    maxHp: 29,
    burning: null,
  });
  expect(trace(s)).toMatchObject({ hits: ['first'], blockedBy: 'wall' });
});
it('mixed-height penetration uses target height for both interceptions', () => {
  const s = setup();
  body(s, 'first').height = 'air';
  body(s, 'third').height = 'air';
  expect(
    tracePenetratingProjectile(arenaOf(s), gun(s), body(s, 'first').centre, 'air', 'left', 12, 'first').hits,
  ).toEqual(['first', 'third']);
});
it.each(['left', 'right'] as const)(
  'extended %s ray preserves ordinary projectile interception on boundary lines',
  side => {
    const s = setup();
    body(s, 'first').centre = { q: 10, r: 7 };
    const arena = arenaOf(s),
      aim = body(s, 'first').centre;
    const ordinary = traceProjectile(arena, gun(s), aim, 'ground', side, 'first'),
      piercing = tracePenetratingProjectile(arena, gun(s), aim, 'ground', side, 12, 'first');
    expect(piercing.hits[0]).toBe(ordinary.hit);
    expect(piercing.path.slice(0, ordinary.path.length)).toEqual(ordinary.path);
    expect(piercing.path.every(h => distance(piercing.path[0]!, h) <= 12)).toBe(true);
  },
);
it('two victims get independent damage, second base damage rounds up before defence, and restore is exact', () => {
  const s = setup();
  gun(s).attacks[0]!.shots[0]!.crit = 0;
  body(s, 'first').incapacitated = true;
  body(s, 'second').incapacitated = true;
  body(s, 'second').defences = [{ type: 'physical', multiplier: 0.5 }];
  const ready = startScenarioTurn(order(s)),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(body(a.state, 'first').hp).toBe(33);
  expect(body(a.state, 'second').hp).toBe(38);
  expect(body(a.state, 'third').hp).toBe(40);
  expect(a.events.filter(e => e.type === 'WeaponDischarged')).toHaveLength(1);
});
it('a miss on the first creature still permits an independent second hit', () => {
  let found = false;
  for (let seed = 1; seed <= 40; seed++) {
    const s = setup(seed);
    body(s, 'second').incapacitated = true;
    const a = run(startScenarioTurn(order(s)), true);
    if (a.events.some(e => e.type === 'AttackMissed' && e.targetId === 'first')) {
      expect(a.events.some(e => e.type === 'AttackHit' && e.targetId === 'second')).toBe(true);
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
});
it('a wall before any creature takes ordinary bolt damage and prevents penetration', () => {
  const s = setup();
  s.walls.push({
    id: 'wall',
    edge: { a: { q: 8, r: 5 }, b: { q: 9, r: 5 } },
    material: 'crystal',
    hp: 29,
    maxHp: 29,
    burning: null,
  });
  const a = run(startScenarioTurn(order(s)), true);
  expect(a.state.walls[0]!.hp).toBe(22);
  expect(body(a.state, 'first').hp).toBe(40);
  expect(body(a.state, 'second').hp).toBe(40);
});
it('a wall beyond the first body stops the follow-through without another structure strike', () => {
  const s = setup();
  s.walls.push({
    id: 'wall',
    edge: { a: { q: 11, r: 5 }, b: { q: 12, r: 5 } },
    material: 'stone',
    hp: 29,
    maxHp: 29,
    burning: null,
  });
  const a = run(startScenarioTurn(order(s)), true);
  expect(a.state.walls[0]!.hp).toBe(29);
  expect(body(a.state, 'second').hp).toBe(40);
});
it('empty-hex aiming retains penetration along the selected ray', () => {
  const s = setup();
  body(s, 'first').incapacitated = true;
  body(s, 'second').incapacitated = true;
  const a = run(
    startScenarioTurn(
      order(s, { type: 'Attack', attackId: 'basic', targetIds: [], ground: { q: 9, r: 5 }, side: 'left' }),
    ),
    true,
  );
  expect(body(a.state, 'first').hp).toBeLessThan(40);
  expect(body(a.state, 'second').hp).toBeLessThan(40);
});
it('invalid creature target wastes the shot without selecting a replacement', () => {
  const s = setup();
  const planned = order(s);
  body(planned, 'first').centre = { q: 25, r: 5 };
  const a = run(startScenarioTurn(planned), true);
  expect(body(a.state, 'second').hp).toBe(40);
  expect(gun(a.state).reload!.loaded).toBe(false);
});
it('destroyed structure targets invalidate safely before tracing', () => {
  const s = setup();
  s.walls.push({
    id: 'wall',
    edge: { a: { q: 8, r: 5 }, b: { q: 9, r: 5 } },
    material: 'crystal',
    hp: 29,
    maxHp: 29,
    burning: null,
  });
  const planned = order(s, {
    type: 'Attack',
    attackId: 'basic',
    targetIds: [],
    ground: null,
    side: 'left',
    structure: { kind: 'wall', id: 'wall' },
  });
  planned.walls = [];
  planned.destroyedWallIds.push('wall');
  expect(() => run(startScenarioTurn(planned), true)).not.toThrow();
});
it('ranged Guard uses the same two-body ray and spends only one loaded bolt', () => {
  let s = setup();
  body(s, 'first').centre = { q: 20, r: 5 };
  body(s, 'second').centre = { q: 12, r: 5 };
  body(s, 'third').centre = { q: 18, r: 6 };
  s = order(s, { type: 'Guard', attackId: 'basic', targetId: 'first', area: [] });
  s = applyCommand(s, {
    type: 'SetOrder',
    matchId: s.matchId,
    playerId: 'b',
    turn: 1,
    commandId: 'walk',
    expectedRevision: s.revision,
    order: { creatureId: 'first', path: [{ q: 19, r: 5 }], early: null, late: null },
  }).state;
  const ready = startScenarioTurn(s),
    a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(a.events.filter(e => e.type === 'WeaponDischarged')).toHaveLength(1);
  expect(a.events.filter(e => ['AttackMissed', 'AttackHit'].includes(e.type)).map(e => e.targetId)).toEqual([
    'second',
    'first',
  ]);
});
it('illusory penetration records both sources for reversal and ignores Int 0 damage', async () => {
  const { reverseIllusion } = await import('../packages/engine/src/illusions.js');
  const s = setup();
  Object.assign(gun(s), { kind: 'illusion', creatorId: 'wizard-0', knownIllusionBy: ['a'] });
  body(s, 'first').incapacitated = true;
  body(s, 'second').incapacitated = true;
  const a = run(startScenarioTurn(order(s)), true);
  expect(a.state.damageLedger.filter(d => d.illusionId === 'ballista').map(d => d.targetId)).toEqual([
    'first',
    'second',
  ]);
  reverseIllusion(a.state, 'ballista', []);
  expect(body(a.state, 'first').hp).toBe(40);
  expect(body(a.state, 'second').hp).toBe(40);
  const mindless = setup();
  Object.assign(gun(mindless), { kind: 'illusion', creatorId: 'wizard-0', knownIllusionBy: ['a'] });
  body(mindless, 'first').intelligence = 0;
  body(mindless, 'second').intelligence = 0;
  const b = run(startScenarioTurn(order(mindless)), true);
  expect(body(b.state, 'first').hp).toBe(40);
  expect(body(b.state, 'second').hp).toBe(40);
});
it('a committed real bolt finishes after its controller dies on the first impact', () => {
  const s = setup();
  s.creatures = s.creatures.filter(c => c.kind === 'wizard' || c.id === 'ballista');
  Object.assign(s.creatures[0]!, { centre: { q: 10, r: 5 }, hp: -9, incapacitated: true });
  Object.assign(s.creatures[1]!, { centre: { q: 12, r: 5 }, hp: -9, incapacitated: true });
  const ready = startScenarioTurn(
    order(s, { type: 'Attack', attackId: 'basic', targetIds: [], ground: { q: 9, r: 5 }, side: 'left' }),
  );
  const a = run(ready),
    b = run(ready, true);
  expect(b).toEqual(a);
  expect(a.state.result).toEqual({ type: 'draw' });
});
it('penetration capability is limited to single-shot projectiles in loaded state', () => {
  const s = setup();
  gun(s).attacks[0]!.mode = 'melee';
  expect(() => encodeSnapshot(s)).toThrow('INVALID_PENETRATING_ATTACK');
});
it('permanent second-hit fixture resumes exactly and rejects extra or self victims', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync('tests/fixtures/ballista-second-hit.json', 'utf8').trim(),
    s = restoreSnapshot(text);
  expect(s.pendingAttack!.areaVictims).toEqual(['first', 'second']);
  expect(s.pendingAttack!.victimIndex).toBe(1);
  expect(run(s, true)).toEqual(run(s));
  for (const ids of [
    ['first', 'second', 'wizard-0'],
    ['first', 'ballista'],
  ]) {
    const raw = JSON.parse(encodeSnapshot(s));
    raw.pendingAttack.areaVictims = ids;
    expect(() => restoreSnapshot(JSON.stringify(raw))).toThrow('INVALID_OR_UNSUPPORTED_SNAPSHOT');
  }
});
