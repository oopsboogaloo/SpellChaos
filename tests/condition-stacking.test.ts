import { expect, it } from 'vitest';
import { applyCommand, createCreature, createMatch } from '../packages/engine/src/index.js';
import { addCondition } from '../packages/engine/src/damage.js';
import { beginPower, stepPower } from '../packages/engine/src/powers.js';
import { summonProfile } from '../packages/content/src/summons.js';
import type { Creature, GameState, Order } from '../packages/domain/src/state.js';
import type { Event } from '../packages/engine/src/events.js';

// Owner rulings, 8 November 2026 (#35, #37, #39): one condition kind never applies twice;
// the longest-lasting instance stays. Guard may only be ordered Early.
const h = (q: number, r = 10) => ({ q, r });
function setup(): GameState {
  const s = createMatch('stacking', ['a', 'b'], 456);
  s.creatures[0]!.centre = h(2, 2); s.creatures[1]!.centre = h(16, 20);
  s.creatures.push(createCreature('target', 'b', h(10), { con: 10, intelligence: 1 }), createCreature('lion', 'a', h(9)), createCreature('ghost', 'a', h(11)));
  return s;
}
const target = (s: GameState) => s.creatures.find(c => c.id === 'target')!;
const kinds = (c: Creature, kind: string) => c.conditions.filter(e => e.kind === kind);

it('a shorter re-application does not shorten an existing condition from another source', () => {
  const s = setup();
  expect(addCondition(s, target(s), 'Slowed', 'lion', 5, 2, 'int', false)).toBe(true);
  expect(addCondition(s, target(s), 'Slowed', 'ghost', 2, 1, 'int', false)).toBe(false);
  expect(kinds(target(s), 'Slowed')).toHaveLength(1);
  expect(kinds(target(s), 'Slowed')[0]).toMatchObject({ sourceId: 'lion', endsTurn: 2 });
});

it('a longer re-application replaces the shorter one, leaving a single instance', () => {
  const s = setup();
  addCondition(s, target(s), 'Fear', 'lion', 3, 1, 'int', false);
  expect(addCondition(s, target(s), 'Fear', 'ghost', 4, 2, 'int', false)).toBe(true);
  expect(kinds(target(s), 'Fear')).toEqual([expect.objectContaining({ sourceId: 'ghost', endsTurn: 2 })]);
});

it('ties keep the existing instance and an open-ended condition outlasts any fixed duration', () => {
  const s = setup();
  addCondition(s, target(s), 'Fear', 'lion', 3, 2, 'int', false);
  expect(addCondition(s, target(s), 'Fear', 'ghost', 9, 2, 'int', false)).toBe(false);
  expect(kinds(target(s), 'Fear')[0]!.sourceId).toBe('lion');
  addCondition(s, target(s), 'Restrained', 'lion', 8, null, 'physical', false, { rootNetwork: true });
  expect(addCondition(s, target(s), 'Restrained', 'ghost', 5, 2, 'int', false)).toBe(false);
  expect(kinds(target(s), 'Restrained')).toEqual([expect.objectContaining({ sourceId: 'lion', rootNetwork: true, endsTurn: null })]);
});

it('illusion-sourced instances stay separate so illusion removal can still reverse them', () => {
  const s = setup();
  Object.assign(s.creatures.find(c => c.id === 'ghost')!, { kind: 'illusion', creatorId: 'wizard-0' });
  addCondition(s, target(s), 'Slowed', 'lion', 5, 2, 'int', false);
  expect(addCondition(s, target(s), 'Slowed', 'ghost', 5, 1, 'int', false)).toBe(true);
  expect(kinds(target(s), 'Slowed').map(e => e.illusionId)).toEqual([null, 'ghost']);
});

it('a second Root Network on an already-rooted target keeps one hold without failing', () => {
  const s = setup();
  s.creatures = s.creatures.filter(c => c.id !== 'lion' && c.id !== 'ghost');
  for (const [id, q] of [['forest-1', 6], ['forest-2', 14]] as const) s.creatures.push(createCreature(id, 'a', h(q), summonProfile('Summon Plant', 8)!));
  s.phase = 'early';
  const events: Event[] = [];
  for (const id of ['forest-1', 'forest-2']) {
    s.random.resolution = 3;
    beginPower(s, s.creatures.find(c => c.id === id)!, { type: 'RootNetwork' }, events);
    while (s.pendingPower) stepPower(s, events);
  }
  expect(events.filter(e => e.type === 'PowerApplied' && e.targetId === 'target')).toHaveLength(2);
  expect(kinds(target(s), 'Restrained')).toEqual([expect.objectContaining({ sourceId: 'forest-1', rootNetwork: true, endsTurn: null })]);
});

it('Guard can be ordered Early but is rejected in the Late phase', () => {
  const s = setup(), wizard = s.creatures[0]!;
  const order = (o: Partial<Order>) => applyCommand(s, { type: 'SetOrder', matchId: s.matchId, playerId: 'a', turn: 1, commandId: `o-${JSON.stringify(o).length}`, expectedRevision: s.revision, order: { creatureId: wizard.id, path: [], early: null, late: null, ...o } });
  const guard = { type: 'Guard' as const, attackId: wizard.attacks[0]!.id, targetId: null, area: [] };
  expect(() => order({ early: guard })).not.toThrow();
  expect(() => order({ late: guard })).toThrow('GUARD_EARLY_ONLY');
});
