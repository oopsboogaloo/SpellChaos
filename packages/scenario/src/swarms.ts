import type { GameState } from '../../domain/src/state.js';
import { createMatch, createCreature, applyCommand } from '../../engine/src/index.js';
import { summonProfile } from '../../content/src/summons.js';

/** Movement covers a slower enemy, cancelling its path before the swarm's late attack. */
export function swarmScenario(): GameState {
 let s = createMatch('swarm-review', ['human', 'opponent'], 6008);
 s.creatures[0]!.centre = { q: 3, r: 3 }; s.creatures[1]!.centre = { q: 20, r: 15 };
 s.creatures.push(
  createCreature('snake-swarm', 'human', { q: 10, r: 10 }, summonProfile('Summon Serpent', 4)!),
  createCreature('covered', 'opponent', { q: 13, r: 10 }, { move: 1 }),
  createCreature('adjacent', 'opponent', { q: 14, r: 10 }),
 );
 s = applyCommand(s, {
  type: 'SetOrder', matchId: s.matchId, playerId: 'human', turn: 1, commandId: 'swarm-order', expectedRevision: s.revision,
  order: { creatureId: 'snake-swarm', path: [{ q: 11, r: 10 }], early: null,
   late: { type: 'Attack', attackId: 'swarm', targetIds: [], ground: null, side: 'left' } },
 }).state;
 s = applyCommand(s, {
  type: 'SetOrder', matchId: s.matchId, playerId: 'opponent', turn: 1, commandId: 'escape-path', expectedRevision: s.revision,
  order: { creatureId: 'covered', path: [{ q: 14, r: 10 }], early: null, late: null },
 }).state;
 return s;
}
