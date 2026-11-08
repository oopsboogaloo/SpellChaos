import { expect, it } from 'vitest';
import { createMatch } from '../packages/engine/src/index.js';
import { projectView } from '../packages/views/src/index.js';
import { selectable } from '../apps/web/src/targeting.js';
import { distance, footprint, nearestPair } from '../packages/geometry/src/hex.js';
import type { CastAction } from '../packages/domain/src/spells.js';

function setup() {
  const s = createMatch('targeting', ['human', 'ai-1'], 5);
  s.creatures[0]!.centre = { q: 5, r: 10 };
  s.creatures[1]!.centre = { q: 7, r: 10 };
  return s;
}
const cast = (spell: CastAction['spell'], variant: CastAction['variant'] = 'bound'): CastAction => ({
  type: 'Cast',
  spell,
  level: 1,
  variant,
  targetId: null,
  ground: null,
  side: 'left',
});

it('move mode offers only hexes the creature can reach this turn', () => {
  const s = setup(),
    view = projectView(s, 'human');
  const options = selectable(view, 'wizard-0', undefined, { kind: 'move' }, 'early')!;
  expect(options.hexes.length).toBeGreaterThan(3);
  for (const h of options.hexes) expect(distance(h, s.creatures[0]!.centre)).toBeLessThanOrEqual(s.creatures[0]!.move);
});

it('summon placement is limited to empty hexes within range of the caster', () => {
  const s = setup(),
    view = projectView(s, 'human'),
    started = performance.now();
  const options = selectable(
    view,
    'wizard-0',
    undefined,
    { kind: 'cast', cast: cast('Summon Cat', 'illusion'), aim: 'ground' },
    'early',
  )!;
  expect(performance.now() - started).toBeLessThan(1500);
  expect(options.hexes.length).toBeGreaterThan(0);
  const body = footprint(s.creatures[0]!.centre, s.creatures[0]!.size);
  for (const h of options.hexes) expect(nearestPair(body, [h]).distance).toBeLessThanOrEqual(4);
  const occupied = s.creatures.flatMap(c => footprint(c.centre, c.size));
  for (const h of options.hexes) expect(occupied.some(o => o.q === h.q && o.r === h.r)).toBe(false);
});

it('attack mode highlights only creatures in reach from where the attack happens', () => {
  const s = setup(),
    view = projectView(s, 'human'),
    me = view.creatures.find(c => c.id === 'wizard-0')!,
    staff = me.attacks[0]!;
  const early = selectable(view, 'wizard-0', undefined, { kind: 'attack', attack: staff }, 'early')!;
  expect(early.creatures).not.toContain('wizard-1');
  // After moving next to the enemy, the same attack can reach it.
  const order = { creatureId: 'wizard-0', path: [{ q: 6, r: 10 }], early: null, late: null };
  const late = selectable(view, 'wizard-0', order, { kind: 'attack', attack: staff }, 'late')!;
  expect(late.creatures).toContain('wizard-1');
});

it('after-moving targets use the height the planned flight steps leave the creature at', () => {
  const s = setup();
  s.creatures[0]!.height = 'air';
  s.creatures[0]!.flight = { takeoffCost: 1, landingCost: 1 };
  const view = projectView(s, 'human'),
    staff = view.creatures.find(c => c.id === 'wizard-0')!.attacks[0]!;
  const landing = {
    creatureId: 'wizard-0',
    path: [{ q: 6, r: 10 }],
    flightSteps: [{ index: 0, height: 'ground' as const }],
    early: null,
    late: null,
  };
  expect(selectable(view, 'wizard-0', landing, { kind: 'attack', attack: staff }, 'late')!.creatures).toContain(
    'wizard-1',
  );
  const staysUp = { ...landing, flightSteps: [] };
  expect(selectable(view, 'wizard-0', staysUp, { kind: 'attack', attack: staff }, 'late')!.creatures).not.toContain(
    'wizard-1',
  );
});
