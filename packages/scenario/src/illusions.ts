import type { GameState } from '../../domain/src/state.js';
import { createMatch, createCreature, applyCommand } from '../../engine/src/index.js';
import { summonProfile } from '../../content/src/summons.js';

/** Disbelief reverses a survivor's wounds but cannot revive the other swarm victim. */
export function illusionScenario(): GameState {
  let s = createMatch('illusion-review', ['human', 'opponent'], 7002);
  s.creatures[0]!.centre = { q: 7, r: 10 };
  s.creatures[0]!.spellbook = ['Disbelief'];
  s.creatures[1]!.centre = { q: 20, r: 15 };
  s.creatures.push(
    createCreature(
      'apparent-swarm',
      'opponent',
      { q: 10, r: 10 },
      {
        ...summonProfile('Summon Serpent', 3)!,
        kind: 'illusion',
        creatorId: 'wizard-1',
        knownIllusionBy: ['opponent'],
      },
    ),
    createCreature('survivor', 'human', { q: 10, r: 10 }),
    createCreature('shock-victim', 'human', { q: 11, r: 10 }, { hp: -9 }),
  );
  s = applyCommand(s, {
    type: 'SetOrder',
    matchId: s.matchId,
    playerId: 'opponent',
    turn: 1,
    commandId: 'illusion-attack',
    expectedRevision: s.revision,
    order: {
      creatureId: 'apparent-swarm',
      path: [],
      early: { type: 'Attack', attackId: 'swarm', targetIds: [], ground: null, side: 'left' },
      late: null,
    },
  }).state;
  return applyCommand(s, {
    type: 'SetOrder',
    matchId: s.matchId,
    playerId: 'human',
    turn: 1,
    commandId: 'disbelief',
    expectedRevision: s.revision,
    order: {
      creatureId: 'wizard-0',
      path: [],
      early: null,
      late: {
        type: 'Cast',
        spell: 'Disbelief',
        level: 2,
        variant: 'bound',
        targetId: 'apparent-swarm',
        ground: null,
        side: 'left',
      },
    },
  }).state;
}
