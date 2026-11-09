import { expect, it } from 'vitest';
import { createMatch } from '../packages/engine/src/index.js';
import { hitModifiers, inReach } from '../packages/engine/src/combat.js';
import { meleeHeightAllowed } from '../packages/domain/src/combat.js';

// Owner ruling 9 Nov 2026 (#61): ground melee can strike an adjacent flyer, at disadvantage; a flyer still
// melees only airborne targets.
function pair(attacker: 'ground' | 'air', target: 'ground' | 'air') {
  const s = createMatch('heights', ['a', 'b'], 1);
  const [a, b] = s.creatures as [(typeof s.creatures)[0], (typeof s.creatures)[0]];
  a.centre = { q: 5, r: 5 };
  b.centre = { q: 6, r: 5 };
  a.height = attacker;
  b.height = target;
  s.phase = 'early';
  return { s, a, b, staff: a.attacks[0]! };
}

it('the height rule: same height, or ground striking adjacent air', () => {
  expect(meleeHeightAllowed({ height: 'ground' }, { height: 'ground' }, 2)).toBe(true);
  expect(meleeHeightAllowed({ height: 'air' }, { height: 'air' }, 2)).toBe(true);
  expect(meleeHeightAllowed({ height: 'ground' }, { height: 'air' }, 1)).toBe(true);
  // Only adjacent: a reach-2 branch cannot strike a flyer two hexes away.
  expect(meleeHeightAllowed({ height: 'ground' }, { height: 'air' }, 2)).toBe(false);
  expect(meleeHeightAllowed({ height: 'air' }, { height: 'ground' }, 1)).toBe(false);
});

it('ground melee reaches an adjacent flyer at disadvantage; same-height melee has no such penalty', () => {
  const up = pair('ground', 'air');
  expect(inReach(up.s, up.a, up.b, up.staff)).toBe(true);
  expect(hitModifiers(up.s, up.a, up.b, up.staff)[1]).toBe(true);
  const level = pair('ground', 'ground');
  expect(inReach(level.s, level.a, level.b, level.staff)).toBe(true);
  expect(hitModifiers(level.s, level.a, level.b, level.staff)[1]).toBe(false);
});

it('a flyer still cannot melee a target on the ground', () => {
  const down = pair('air', 'ground');
  expect(inReach(down.s, down.a, down.b, down.staff)).toBe(false);
});
