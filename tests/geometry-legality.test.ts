import fc from 'fast-check';
import { expect, it } from 'vitest';
import { DIRECTIONS, add, oppositeSectors } from '../packages/geometry/src/hex.js';
import { traceRay } from '../packages/geometry/src/ray.js';
import { createCreature, createMatch } from '../packages/engine/src/index.js';
import { beginAttack, stepAttack } from '../packages/engine/src/combat.js';
import { seesCreature } from '../packages/engine/src/visibility.js';
import { blinkLegal } from '../packages/engine/src/blink.js';
import { summonProfile } from '../packages/content/src/summons.js';
import type { GameState } from '../packages/domain/src/state.js';
import type { Event } from '../packages/engine/src/events.js';

const wall = (
  id: string,
  a: { q: number; r: number },
  b: { q: number; r: number },
  material: 'stone' | 'energy' = 'stone',
) => ({ id, edge: { a, b }, material, hp: 8, maxHp: 8, burning: null }) as GameState['walls'][number];

it('#21: creatures exactly opposite each other are always in opposite sectors, in either order', () => {
  const c = { q: 10, r: 10 };
  expect(oppositeSectors(c, { q: 12, r: 9 }, { q: 8, r: 11 })).toBe(true);
  expect(oppositeSectors(c, { q: 8, r: 11 }, { q: 12, r: 9 })).toBe(true);
  fc.assert(
    fc.property(fc.integer({ min: -6, max: 6 }), fc.integer({ min: -6, max: 6 }), (q, r) => {
      fc.pre(q !== 0 || r !== 0);
      return oppositeSectors(c, { q: c.q + q, r: c.r + r }, { q: c.q - q, r: c.r - r });
    }),
    { numRuns: 500 },
  );
  expect(oppositeSectors(c, add(c, DIRECTIONS[0]!), add(c, DIRECTIONS[1]!))).toBe(false);
});

function duel(): GameState {
  const s = createMatch('legality', ['a', 'b'], 7);
  s.creatures[0]!.centre = { q: 2, r: 2 };
  s.creatures[1]!.centre = { q: 20, r: 20 };
  s.creatures.push(
    createCreature('atk', 'a', { q: 5, r: 5 }, { size: 1 }),
    createCreature('tgt', 'b', { q: 6, r: 6 }, { size: 3, con: 5, incapacitated: true }),
  );
  s.phase = 'early';
  return s;
}

it('#20: melee is legal through any open edge between touching footprints, not only the first cell pair', () => {
  const s = duel();
  s.walls.push(wall('w', { q: 5, r: 5 }, { q: 5, r: 6 }));
  const atk = s.creatures.find(c => c.id === 'atk')!,
    events: Event[] = [];
  beginAttack(
    s,
    atk,
    { type: 'Attack', attackId: atk.attacks[0]!.id, targetIds: ['tgt'], ground: null, side: 'left' },
    'action',
    events,
  );
  while (s.pendingAttack) stepAttack(s, events);
  expect(events.map(e => e.type)).not.toContain('AttackInvalid');
  expect(events.some(e => e.type === 'AttackHit' && e.targetId === 'tgt')).toBe(true);
});

it('#20: sight is blocked only when every nearest cell pair is blocked', () => {
  const s = duel(),
    atk = s.creatures.find(c => c.id === 'atk')!,
    tgt = s.creatures.find(c => c.id === 'tgt')!;
  s.walls.push(wall('w1', { q: 5, r: 5 }, { q: 5, r: 6 }));
  expect(seesCreature(s, atk, tgt)).toBe(true);
  s.walls.push(wall('w2', { q: 5, r: 5 }, { q: 6, r: 5 }));
  expect(seesCreature(s, atk, tgt)).toBe(false);
});

it('#22: Blink gives the same answer for mirror-image Energy layouts along a boundary ray', () => {
  const from = { q: 5, r: 10 },
    to = { q: 6, r: 11 };
  const edges = (side: 'left' | 'right') => {
    const path = traceRay(from, to, side);
    return path.slice(1).map((h, i) => [path[i]!, h] as const);
  };
  const legal = (walls: GameState['walls']) => {
    const s = createMatch('blink', ['a', 'b'], 3);
    s.creatures[0]!.centre = { q: 2, r: 2 };
    s.creatures[1]!.centre = { q: 20, r: 20 };
    s.creatures.push(createCreature('leopard', 'a', from, summonProfile('Summon Cat', 5)!));
    s.walls = walls;
    return blinkLegal(
      s,
      s.creatures.find(c => c.id === 'leopard')!,
      from,
      to,
    );
  };
  const only = (side: 'left' | 'right', other: 'left' | 'right') =>
    edges(side).filter(
      ([a, b]) => !edges(other).some(([c, d]) => c.q === a.q && c.r === a.r && d.q === b.q && d.r === b.r),
    );
  const left = only('left', 'right').map(([a, b], i) => wall(`l${i}`, a, b, 'energy')),
    right = only('right', 'left').map(([a, b], i) => wall(`r${i}`, a, b, 'energy'));
  expect(left.length + right.length).toBeGreaterThan(0);
  expect(legal(left)).toBe(legal(right));
  expect(legal([])).toBe(true);
});
