import type { Creature } from '../../domain/src/state.js';
import type { SpellFamily } from '../../domain/src/spells.js';

/** The three approved MVP swarm entries; no substitute profiles for other levels. */
export function swarmProfile(spell: SpellFamily, level: number): Partial<Creature> | null {
  const serpent = spell === 'Summon Serpent' && (level === 3 || level === 4);
  const grove = spell === 'Summon Plant' && level === 6;
  if (!serpent && !grove) return null;
  const size = level === 3 ? 4 : 6,
    con = grove ? 5 : 4;
  return {
    species: grove ? 'Strangling grove' : level === 3 ? 'Snake Swarm' : 'Greater Snake Swarm',
    family: grove ? 'Plant' : 'Serpent',
    summonLevel: level,
    size,
    originalSize: size,
    con,
    hp: size * con,
    maxHp: size * con,
    move: grove ? 1 : 3,
    dex: grove ? 2 : 5,
    intelligence: grove ? 0 : 1,
    swarm: true,
    plant: grove,
    corpseEligible: false,
    reanimationAttackIds: [],
    defences: grove
      ? [
          { type: 'physical', multiplier: 0.5 },
          { type: 'fire', multiplier: 2 },
        ]
      : [
          { type: 'physical', multiplier: 0.5 },
          { type: 'poison', multiplier: 0.5 },
          { type: 'fire', multiplier: 1.5 },
          { type: 'cold', multiplier: 1.5 },
        ],
    attacks: [
      {
        id: 'swarm',
        name: grove ? 'Roots' : 'Swarm bites',
        mode: 'swarm',
        range: 1,
        minRange: 0,
        radius: 0,
        shots: [
          {
            skill: level === 3 ? 5 : 6,
            crit: 5,
            components: [{ type: 'physical', amount: level === 3 ? 2 : 3 }],
            secondary: grove
              ? []
              : [
                  {
                    kind: 'Poisoned',
                    potency: level === 3 ? 3 : 5,
                    resistance: 'con',
                    duration: 3,
                    requiresDamage: true,
                  },
                ],
          },
        ],
      },
    ],
  };
}
