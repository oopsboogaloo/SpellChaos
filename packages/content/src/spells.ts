import { spellFamilies, type CastAction, type CastingTime, type SpellFamily } from '../../domain/src/spells.js';
export const guaranteed: SpellFamily[] = ['Disbelief', 'Bind', 'Release'];
export const mvpSpellFamilies: SpellFamily[] = spellFamilies.filter(
  s => s !== 'Summon Goblin' && s !== 'Summon Dragon',
);
export const startingPool = mvpSpellFamilies.filter(s => !guaranteed.includes(s));
export const damageSpells: SpellFamily[] = ['Magic Bolt', 'Fire Bolt', 'Magic Attack'];
export const utilitySpells: SpellFamily[] = ['Healing Bolt', 'Teleport', 'Wall', 'Tangleweed', 'Darkness', 'Reanimate'];
export const implementedSpells: SpellFamily[] = [
  'Summon Spirit',
  'Summon Goblin',
  'Summon Archer',
  'Summon Cat',
  'Summon Serpent',
  'Summon Dragon',
  'Summon Plant',
  'Disbelief',
  'Bind',
  'Release',
  'Magic Bolt',
  'Fire Bolt',
  'Magic Attack',
  'Healing Bolt',
  'Teleport',
  'Reanimate',
  'Darkness',
  'Tangleweed',
  'Wall',
];
export function alignment(spell: SpellFamily, level = 1): number {
  if (spell === 'Wall') return [1, 1, 1, 1, 0, -1, 1, -1][level - 1]!;
  if (['Summon Cat', 'Summon Plant', 'Summon Archer', 'Bind', 'Healing Bolt', 'Tangleweed'].includes(spell)) return 1;
  if (['Summon Serpent', 'Summon Goblin', 'Summon Spirit', 'Fire Bolt', 'Darkness', 'Reanimate'].includes(spell))
    return -1;
  return 0;
}
export function castingTime(spell: SpellFamily): CastingTime {
  if (spell.startsWith('Summon ')) return 'quick';
  return ['Bind', 'Wall', 'Tangleweed', 'Reanimate'].includes(spell)
    ? 'slow'
    : spell === 'Darkness'
      ? 'quick'
      : 'instant';
}
export function manaCost(action: CastAction): number {
  if (action.spell === 'Disbelief') return 2;
  return action.spell.startsWith('Summon ') && action.variant !== 'bound'
    ? Math.ceil((5 * action.level) / 2)
    : 5 * action.level;
}
export function successChance(action: CastAction, balanceUnits: number): number {
  if (action.spell === 'Disbelief' || action.variant === 'illusion') return 100;
  const b = balanceUnits / 2;
  const base = Math.max(
    5,
    Math.min(95, 95 - 8 * action.level + (20 * alignment(action.spell, action.level) * b) / (40 + Math.abs(b))),
  );
  return action.spell.startsWith('Summon ') && action.variant === 'unbound' ? Math.min(95, base + 20) : base;
}
export function spellRange(action: CastAction): number {
  if (action.spell.startsWith('Summon ')) return 4;
  if (action.spell === 'Magic Bolt') return 6 + action.level;
  if (['Teleport', 'Disbelief'].includes(action.spell)) return 2 + 2 * action.level;
  return 8;
}
export function completionAt(
  turn: number,
  phase: 'early' | 'late',
  timing: CastingTime,
): { turn: number; phase: 'early' | 'late' } {
  if (timing.startsWith('ritual')) {
    if (phase !== 'early') throw new Error('RITUAL_EARLY_ONLY');
    return { turn: turn + Number(timing.slice(-1)) - 1, phase: 'late' };
  }
  if (timing === 'slow') return phase === 'early' ? { turn, phase: 'late' } : { turn: turn + 1, phase: 'early' };
  return { turn, phase };
}
