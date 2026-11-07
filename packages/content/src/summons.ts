import type { Creature } from '../../domain/src/state.js';
import { summonFamilies, type SpellFamily } from '../../domain/src/spells.js';
import { approvedBlueprint } from './roster.js';

/** Implemented profiles, including retained next-version content for old saves.
 * New-game and new-cast availability additionally uses mvpSpellFamilies.
 * Implementation coverage is deliberately narrower than the approved catalogue.
 * Enable a profile only when every required interaction has engine and restore tests.
 */
const enabled = new Set(['Cat:1', 'Cat:2', 'Serpent:1', 'Serpent:3', 'Serpent:4', 'Dragon:1', 'Plant:6','Serpent:2','Goblin:4','Archer:2','Archer:3','Serpent:7','Cat:4','Plant:2','Spirit:4','Goblin:5','Plant:7','Spirit:8','Plant:3','Spirit:5','Spirit:7','Archer:6','Archer:8','Archer:7','Archer:5','Archer:4','Plant:5','Spirit:2']);
export function summonProfile(spell: SpellFamily, level: number): Partial<Creature> | null {
 const family = summonFamilies.find(f => spell === `Summon ${f}`);
 if (!family || !enabled.has(`${family}:${level}`)) return null;
 return approvedBlueprint(family, level)!.profile;
}
