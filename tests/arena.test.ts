import { expect, it } from 'vitest';
import { fight, roster } from '../tools/arena/fight.js';

it('arena fights are repeatable and their totals add up', () => {
  const list = roster(),
    cat = list.find(f => f.key === 'Cat:3')!,
    archer = list.find(f => f.key === 'Archer:2')!;
  const first = fight(cat, archer, 7),
    again = fight(cat, archer, 7);
  expect(again).toEqual(first);
  expect(first.turns).toBeGreaterThan(0);
  for (const side of [first.sides.a, first.sides.b]) {
    expect(side.hits).toBeLessThanOrEqual(side.attacks);
    expect(side.crits).toBeLessThanOrEqual(side.hits);
  }
  // What one side dealt to the other is part of what the other took.
  expect(first.sides.a.dealt).toBeLessThanOrEqual(first.sides.b.taken);
  if (first.winner !== 'draw') expect(first.sides[first.winner === 'a' ? 'b' : 'a'].hpLeft).toBe(0);
});
