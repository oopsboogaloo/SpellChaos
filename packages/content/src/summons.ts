import type { Creature } from '../../domain/src/state.js';
import { summonFamilies, type SpellFamily } from '../../domain/src/spells.js';
import { approvedBlueprint } from './roster.js';

/** Runtime availability is deliberately narrower than the approved catalogue.
 * Enable a profile only when every required interaction has engine and restore tests.
 */
const enabled = new Set(['Cat:1', 'Serpent:1', 'Serpent:3', 'Serpent:4', 'Dragon:1', 'Plant:6','Serpent:2','Goblin:4','Archer:2','Archer:3','Serpent:7','Cat:4']);
export function summonProfile(spell: SpellFamily, level: number): Partial<Creature> | null {
 const family = summonFamilies.find(f => spell === `Summon ${f}`);
 if (!family || !enabled.has(`${family}:${level}`)) return null;
 return approvedBlueprint(family, level)!.profile;
}
