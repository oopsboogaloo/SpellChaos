import { describe, expect, it } from 'vitest';
import { creatureDescriptions, describeCreature } from '../packages/content/src/descriptions.js';
import { approvedBlueprint } from '../packages/content/src/roster.js';
import { summonFamilies } from '../packages/domain/src/spells.js';

const species = [
  ...summonFamilies.flatMap(family =>
    Array.from({ length: 8 }, (_, i) => approvedBlueprint(family, i + 1)?.profile.species).filter(
      (s): s is string => s !== undefined,
    ),
  ),
  'Wizard',
];

describe('creature descriptions', () => {
  it('covers every summonable species at every level, plus the wizard', () => {
    expect(species.length).toBe(summonFamilies.length * 8 + 1);
  });

  it.each(species)('describes %s concisely', name => {
    const text = describeCreature(name);
    expect(text, name).toBeTypeOf('string');
    expect(text!.trim().length, name).toBeGreaterThan(0);
    expect(text!.length, name).toBeLessThanOrEqual(260);
  });

  it('has no entries for unknown species', () => {
    expect(Object.keys(creatureDescriptions).sort()).toEqual([...new Set(species)].sort());
    expect(describeCreature('Not a creature')).toBeUndefined();
    expect(describeCreature('toString')).toBeUndefined();
  });
});
