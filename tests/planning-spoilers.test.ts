import { expect, it } from 'vitest';
import { applyCommand, createCreature, createMatch } from '../packages/engine/src/index.js';
import { addCondition } from '../packages/engine/src/damage.js';
import { projectView } from '../packages/views/src/index.js';
import { summonProfile } from '../packages/content/src/summons.js';
import type { GameState, Order } from '../packages/domain/src/state.js';

// #15: planning-time validation must not reveal what a player cannot perceive. For each validator,
// two states differing only in a secret give player 'a' an identical view AND an identical result.
const h = (q: number, r = 10) => ({ q, r });
function base(): GameState {
  const s = createMatch('spoilers', ['a', 'b'], 5);
  s.creatures[0]!.centre = h(5); s.creatures[1]!.centre = h(25, 25);
  Object.assign(s.creatures[0]!, { mana: 100, spellbook: ['Teleport', 'Summon Cat', 'Wall', 'Reanimate'], spellLevelCap: 8 });
  return s;
}
const hidden = (q: number) => createCreature('ghost', 'b', h(q), { invisible: true });
function result(s: GameState, order: Partial<Order>): string {
  try { applyCommand(s, { type: 'SetOrder', matchId: s.matchId, playerId: 'a', turn: 1, commandId: 'probe', expectedRevision: s.revision, order: { creatureId: 'wizard-0', path: [], early: null, late: null, ...order } }); return 'OK'; }
  catch (e) { return (e as Error).message; }
}
function sameForA(withSecret: GameState, without: GameState, order: Partial<Order>) {
  expect(projectView(withSecret, 'a')).toEqual(projectView(without, 'a'));
  expect(result(withSecret, order)).toBe(result(without, order));
}
const cast = (spell: string, extra: object) => ({ early: { type: 'Cast', spell, level: 1, variant: 'bound', targetId: null, ground: null, side: 'left', ...extra } as Order['early'] });

it('Teleport onto an invisible creature looks the same as onto empty ground', () => {
  const a = base(), b = base(); a.creatures.push(hidden(8)); b.creatures.push(hidden(20));
  sameForA(a, b, cast('Teleport', { ground: h(8) }));
});

it('summon placement over an invisible creature looks the same as over empty ground', () => {
  const a = base(), b = base(); a.creatures.push(hidden(8)); b.creatures.push(hidden(20));
  sameForA(a, b, cast('Summon Cat', { ground: h(8), variant: 'bound', level: 3 }));
});

it('a Wall edge beside an invisible creature looks the same as beside empty ground', () => {
  const a = base(), b = base(); a.creatures.push(createCreature('ghost', 'b', h(8), { invisible: true, size: 3, con: 5 })); b.creatures.push(hidden(20));
  sameForA(a, b, { early: { type: 'Cast', spell: 'Wall', level: 2, variant: 'bound', targetId: null, ground: h(8), side: 'left', edges: [{ a: h(8), b: h(9) }] } as Order['early'] });
});

it('Fear from an invisible source never reveals where the source is', () => {
  const a = base(), b = base();
  for (const [s, q] of [[a, 7], [b, 2]] as const) { s.creatures.push(hidden(q)); addCondition(s, s.creatures[0]!, 'Fear', 'ghost', 3, 2, 'int', false); }
  sameForA(a, b, { path: [h(6)] });
});

it('a power aimed at a hidden creature gives the same answer whether it is alive or dead', () => {
  const a = base(), b = base();
  for (const s of [a, b]) s.creatures.push(createCreature('basilisk', 'a', h(6), summonProfile('Summon Serpent', 5)!), hidden(9));
  Object.assign(b.creatures.find(c => c.id === 'ghost')!, { alive: false, hp: -4 });
  expect(projectView(a, 'a')).toEqual(projectView(b, 'a'));
  const probe = (s: GameState) => { try { applyCommand(s, { type: 'SetOrder', matchId: s.matchId, playerId: 'a', turn: 1, commandId: 'p', expectedRevision: s.revision, order: { creatureId: 'basilisk', path: [], early: { type: 'Gaze', targetId: 'ghost' }, late: null } }); return 'OK'; } catch (e) { return (e as Error).message; } };
  expect(probe(a)).toBe(probe(b));
});

it('#16: a passable invisible creature is not revealed when a later visible blocker stops the move', async () => {
  const { startScenarioTurn } = await import('../packages/scenario/src/casting.js');
  const { advanceAtomicStep } = await import('../packages/engine/src/resolver.js');
  let s = base();
  s.creatures.push(createCreature('shade', 'a', h(8), summonProfile('Summon Spirit', 2)!), hidden(9), createCreature('wall-of-flesh', 'b', h(10)));
  s = applyCommand(s, { type: 'SetOrder', matchId: s.matchId, playerId: 'a', turn: 1, commandId: 'move', expectedRevision: s.revision, order: { creatureId: 'shade', path: [h(9), h(10)], early: null, late: null } }).state;
  s = startScenarioTurn(s);
  const types: string[] = [];
  for (let n = 0; !['planning', 'ended'].includes(s.phase); n++) { if (n > 2000) throw new Error('STEP_LIMIT'); const r = advanceAtomicStep(s); s = r.state; types.push(...r.events.map(e => e.type)); }
  expect(types).not.toContain('InvisibleRevealed');
  expect(types).not.toContain('PathTruncated');
});
