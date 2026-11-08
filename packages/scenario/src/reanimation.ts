import { createMatch, createCreature, applyCommand } from '../../engine/src/index.js';
import { cleanupDeaths } from '../../engine/src/lifecycle.js';
import { summonProfile } from '../../content/src/summons.js';
import type { GameState } from '../../domain/src/state.js';

/** A prepared late Slow cast preserves its corpse target across a turn boundary. */
export function reanimationScenario(skeletal = false): GameState {
  let s = createMatch('reanimation-review', ['human', 'opponent'], 6006);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  s.creatures[0]!.spellbook = ['Reanimate'];
  s.creatures[1]!.centre = { q: 20, r: 15 };
  const body = createCreature(
    'fallen-snake',
    null,
    { q: 8, r: 5 },
    {
      ...summonProfile('Summon Serpent', 1)!,
      fireAcidDamage: skeletal ? 2 : 0,
    },
  );
  body.hp = -body.maxHp;
  s.creatures.push(body);
  cleanupDeaths(s, []);
  s = applyCommand(s, {
    type: 'SetOrder',
    matchId: s.matchId,
    playerId: 'human',
    turn: 1,
    commandId: 'reanimation-order',
    expectedRevision: s.revision,
    order: {
      creatureId: 'wizard-0',
      path: [],
      early: null,
      late: {
        type: 'Cast',
        spell: 'Reanimate',
        level: 2,
        variant: 'bound',
        targetId: 'corpse:fallen-snake',
        ground: null,
        side: 'left',
      },
    },
  }).state;
  return s;
}
