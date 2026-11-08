import { createMatch, createCreature, applyCommand } from '../../engine/src/index.js';
import type { GameState } from '../../domain/src/state.js';
/** Quick Darkness hides a unit before a preplanned late ranged attack resolves. */
export function darknessScenario(): GameState {
  let s = createMatch('darkness-review', ['human', 'opponent'], 8002);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  s.creatures[0]!.spellbook = ['Darkness'];
  s.creatures[1]!.centre = { q: 20, r: 15 };
  s.creatures.push(createCreature('hidden-unit', 'human', { q: 9, r: 5 }));
  const shooter = createCreature(
    'shooter',
    'opponent',
    { q: 13, r: 5 },
    {
      attacks: [
        {
          id: 'bow',
          name: 'Bow',
          mode: 'projectile',
          range: 10,
          minRange: 0,
          radius: 0,
          shots: [{ skill: 100, crit: 0, components: [{ type: 'physical', amount: 4 }], secondary: [] }],
        },
      ],
    },
  );
  s.creatures.push(shooter);
  s = applyCommand(s, {
    type: 'SetOrder',
    matchId: s.matchId,
    playerId: 'human',
    turn: 1,
    commandId: 'darkness',
    expectedRevision: s.revision,
    order: {
      creatureId: 'wizard-0',
      path: [],
      early: {
        type: 'Cast',
        spell: 'Darkness',
        level: 1,
        variant: 'bound',
        targetId: null,
        ground: { q: 9, r: 5 },
        side: 'left',
      },
      late: null,
    },
  }).state;
  s = applyCommand(s, {
    type: 'SetOrder',
    matchId: s.matchId,
    playerId: 'opponent',
    turn: 1,
    commandId: 'shot',
    expectedRevision: s.revision,
    order: {
      creatureId: 'shooter',
      path: [],
      early: null,
      late: { type: 'Attack', attackId: 'bow', targetIds: ['hidden-unit'], ground: null, side: 'left' },
    },
  }).state;
  s.random.resolution = 1;
  return s;
}
