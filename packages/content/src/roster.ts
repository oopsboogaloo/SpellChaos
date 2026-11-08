import type { Creature } from '../../domain/src/state.js';
import type { AttackDefinition, DamageType } from '../../domain/src/combat.js';
import type { SpellFamily } from '../../domain/src/spells.js';
import { swarmProfile } from './swarms.js';
import type { AbilityId } from './roster-abilities.js';

/** Approved content, independent of the runtime availability gate in summons.ts.
 * Special abilities are explicit requirements, not silently approximated attacks.
 * A blueprint must not be enabled until its requirements have engine coverage.
 */
export interface Ability {
  id: AbilityId;
  parameters: Record<string, number | string | boolean>;
}
export interface CreatureBlueprint {
  profile: Partial<Creature>;
  abilities: Ability[];
}
type Family = NonNullable<Creature['family']>;
type Stats = readonly [size: number, con: number, move: number, dex: number, intelligence: number];
const ability = (id: AbilityId, parameters: Ability['parameters'] = {}): Ability => ({ id, parameters });
const attack = (
  id: string,
  name: string,
  skill: number,
  amount: number,
  type: DamageType = 'physical',
  range = 1,
  mode: AttackDefinition['mode'] = range === 1 ? 'melee' : 'projectile',
  crit = 5,
): AttackDefinition => ({
  id,
  name,
  mode,
  range,
  minRange: 0,
  radius: 0,
  shots: [{ skill, crit, components: [{ type, amount }], secondary: [] }],
});
const melee = (name: string, skill: number, amount: number, type: DamageType = 'physical', crit = 5, range = 1) =>
  attack('basic', name, skill, amount, type, range, 'melee', crit);
const shot = (name: string, skill: number, amount: number, range: number, type: DamageType = 'physical') =>
  attack('basic', name, skill, amount, type, range);
const defence = (type: DamageType, multiplier: Creature['defences'][number]['multiplier']) => ({ type, multiplier });
const poison = (a: AttackDefinition, potency: number) => {
  a.shots[a.shots.length - 1]!.secondary.push({
    kind: 'Poisoned',
    potency,
    resistance: 'con',
    duration: 3,
    requiresDamage: true,
  });
  return a;
};
const multi = (...attacks: AttackDefinition[]): AttackDefinition => ({
  ...attacks[0]!,
  shots: attacks.flatMap(a => a.shots),
});
const repeat = (a: AttackDefinition): AttackDefinition => ({
  ...a,
  shots: Array.from({ length: 3 }, () => structuredClone(a.shots[0]!)),
});
const caster = (mana: number, spellLevelCap: number, spellbook: SpellFamily[]): Partial<Creature> => ({
  mana,
  maxMana: mana,
  manaRegen: 1,
  spellLevelCap,
  spellbook,
});
const rows: CreatureBlueprint[] = [];
function add(
  family: Family,
  level: number,
  species: string,
  stats: Stats,
  attacks: AttackDefinition[],
  extra: Partial<Creature> = {},
  abilities: Ability[] = [],
) {
  const [size, con, move, dex, intelligence] = stats;
  rows.push({
    profile: {
      species,
      family,
      summonLevel: level,
      size,
      originalSize: size,
      con,
      move,
      dex,
      intelligence,
      hp: size * con,
      maxHp: size * con,
      attacks,
      ...extra,
    },
    abilities,
  });
}
const pounce = () => ability('pounce', { steps: 3, damage: 2 });
const roar = (range: number, potency: number) =>
  ability('fear-action', { range, potency, duration: 2, targets: 'enemies' });
const flying = () => ability('flight', { takeoffCost: 1, landingCost: 1 });

add('Cat', 1, 'Cat familiar', [1, 3, 5, 8, 3], [melee('Claws', 4, 1)], { familiar: true, nimble: true });
add(
  'Cat',
  2,
  'Cougar',
  [2, 4, 6, 7, 2],
  [melee('Bite', 5, 3)],
  { pounce: { attackId: 'basic', steps: 3, damage: 2 } },
  [pounce()],
);
add(
  'Cat',
  3,
  'Lion',
  [3, 5, 5, 6, 2],
  [melee('Bite', 6, 4)],
  { packTactics: true, fearAction: { kind: 'Roar', range: 1, potency: 3, duration: 2 } },
  [roar(1, 3)],
);
const tiger = melee('Bite', 7, 5, 'physical', 15);
tiger.shots[0]!.secondary.push({
  kind: 'Bleeding',
  potency: 4,
  resistance: 'con',
  duration: null,
  requiresDamage: true,
});
add('Cat', 4, 'Sabre-toothed tiger', [3, 6, 4, 5, 2], [tiger], { defences: [defence('cold', 0.5)] });
add(
  'Cat',
  5,
  'Fey leopard',
  [2, 5, 6, 9, 6],
  [melee('Claws', 7, 4, 'magic')],
  { blink: { range: 3 }, defences: [defence('magic', 0.5), defence('physical', 1.5)] },
  [ability('blink', { range: 3, usesPerTurn: 1 })],
);
add(
  'Cat',
  6,
  'Gryphon',
  [4, 6, 6, 6, 4],
  [{ ...multi(melee('Beak', 7, 4), melee('Claws', 6, 3)), singleTarget: true }],
  {
    height: 'air',
    flight: { takeoffCost: 1, landingCost: 1 },
    mountable: true,
    dive: { attackId: 'basic', shotIndex: 0, steps: 3, damage: 2 },
    defences: [defence('cold', 0.5)],
  },
  [flying(), ability('mount'), ability('dive', { steps: 3, damage: 2, shotIndex: 0 })],
);
add(
  'Cat',
  7,
  'Giant puma',
  [5, 6, 5, 6, 3],
  [melee('Bite', 8, 8)],
  { grappleLimbs: 1, drag: { moveDivisor: 2 }, pounce: { attackId: 'basic', steps: 3, damage: 2 } },
  [pounce(), ability('drag', { moveMultiplier: 0.5 })],
);
add(
  'Cat',
  8,
  'Bobby the Master Hunter',
  [2, 7, 7, 10, 8],
  [melee('Claws', 9, 5, 'magic', 20)],
  {
    defences: [defence('magic', 0.5), defence('poison', 0.5)],
    doubleAction: true,
    ignoresDarknessDisadvantage: true,
    seeInvisibleRange: 6,
  },
  [ability('see-invisible', { range: 6 })],
);

add('Serpent', 1, 'Snake familiar', [1, 3, 3, 6, 2], [poison(melee('Bite', 4, 1), 2)], {
  familiar: true,
  defences: [defence('poison', 0.5), defence('cold', 1.5)],
});
add(
  'Serpent',
  2,
  'Adder',
  [1, 4, 3, 7, 1],
  [poison(melee('Bite', 5, 2), 5)],
  { defences: [defence('poison', 0.5), defence('cold', 1.5)] },
  [ability('ambush')],
);
for (const level of [3, 4]) rows.push({ profile: swarmProfile('Summon Serpent', level)!, abilities: [] });
add(
  'Serpent',
  5,
  'Basilisk',
  [3, 6, 3, 4, 3],
  [melee('Bite', 6, 4)],
  { gaze: { range: 4, potency: 5, duration: 2 }, defences: [defence('poison', 0.5), defence('cold', 1.5)] },
  [ability('gaze', { range: 4, potency: 5, duration: 2, resistance: 'int', escapeResistance: 'int' })],
);
const spit = shot('Spit', 7, 3, 5, 'poison');
spit.id = 'spit';
add(
  'Serpent',
  6,
  'Amphiptere',
  [3, 5, 7, 8, 4],
  [poison(melee('Bite', 7, 4), 6), spit],
  {
    height: 'air',
    flight: { takeoffCost: 1, landingCost: 1 },
    reanimationAttackIds: ['basic'],
    defences: [defence('poison', 0.5), defence('lightning', 0.5), defence('cold', 1.5)],
  },
  [flying()],
);
add('Serpent', 7, 'Hydra', [5, 7, 3, 4, 3], [repeat(melee('Bites', 7, 3))], {
  regeneration: 3,
  defences: [defence('poison', 0.5), defence('fire', 1.5), defence('acid', 1.5)],
});
add(
  'Serpent',
  8,
  'The World Serpent',
  [8, 8, 3, 4, 8],
  [
    melee('Bite', 9, 10),
    {
      ...melee('Tail Sweep', 8, 5),
      id: 'tail-sweep',
      mode: 'cleave',
      minRange: 0,
      targetTeams: 'all',
      areaDamage: true,
    },
  ],
  {
    grappleLimbs: 1,
    constriction: { damage: 4 },
    reanimationAttackIds: ['basic'],
    defences: [defence('poison', 0), defence('cold', 0.5), defence('light', 1.5)],
  },
  [
    ability('tail-sweep', { skill: 8, damage: 5, targets: 'all-adjacent' }),
    ability('constriction', { damage: 4, type: 'physical' }),
  ],
);

add(
  'Goblin',
  1,
  'Goblin scout',
  [1, 3, 4, 6, 3],
  [shot('Sling', 4, 1, 5)],
  { packTactics: true, darknessSightRange: 3 },
  [ability('small-objects')],
);
add('Goblin', 2, 'Goblin archer', [1, 4, 4, 5, 3], [shot('Bow', 5, 2, 7)], { packTactics: true }, [
  ability('scramble', { extraCost: 1 }),
]);
const javelin = shot('Javelin', 5, 2, 4);
javelin.id = 'javelin';
add('Goblin', 3, 'Goblin raider', [2, 4, 5, 6, 4], [melee('Blade', 6, 3), javelin], { packTactics: true }, [
  ability('weapons'),
  ability('objects'),
  ability('rider'),
]);
add('Goblin', 4, 'Hobgoblin', [2, 6, 4, 5, 5], [melee('Spear', 6, 4)], { packTactics: true }, [
  ability('brace', { damage: 2 }),
]);
add('Goblin', 5, 'Goblin shaman', [1, 5, 3, 5, 7], [shot('Hex', 6, 3, 6, 'magic')], {
  ...caster(25, 3, ['Darkness', 'Fire Bolt', 'Release']),
  defences: [defence('magic', 0.5), defence('light', 1.5)],
  reanimationAttackIds: [],
});
add(
  'Goblin',
  6,
  'Goblin champion',
  [2, 7, 4, 7, 5],
  [melee('Sword', 8, 5, 'physical', 15)],
  { packTactics: true, doubleAction: true, defences: [defence('poison', 0.5)] },
  [ability('weapons'), ability('objects')],
);
add(
  'Goblin',
  7,
  'Goblin king',
  [2, 7, 3, 5, 8],
  [melee('Sceptre', 7, 5, 'magic')],
  { defences: [defence('magic', 0.5)] },
  [
    ability('command', { range: 5, steps: 2 }),
    ability('rally', { range: 1, skill: 1, stacks: false, affectsSelf: false }),
  ],
);
add(
  'Goblin',
  8,
  'The Once and Future Goblin',
  [2, 8, 4, 7, 9],
  [shot('Crownfire', 8, 7, 6, 'magic')],
  {
    ...caster(40, 5, ['Magic Attack', 'Bind', 'Teleport']),
    defences: [defence('magic', 0.5), defence('necrotic', 0.5), defence('light', 1.5)],
    reanimationAttackIds: [],
  },
  [ability('false-king', { range: 4, hp: 1, usesPerMatch: 1 })],
);

add(
  'Dragon',
  1,
  'Dragonet familiar',
  [1, 3, 5, 6, 4],
  [shot('Spark', 4, 1, 3, 'fire')],
  { familiar: true, height: 'air', reanimationAttackIds: [], defences: [defence('fire', 0.5), defence('cold', 1.5)] },
  [flying()],
);
add(
  'Dragon',
  2,
  'Drake',
  [2, 5, 4, 4, 2],
  [melee('Bite', 5, 3)],
  { defences: [defence('fire', 0.5), defence('cold', 1.5)] },
  [ability('scorch', { range: 1, damage: 2, type: 'fire', targets: 'all-in-hex', cooldown: 2 })],
);
add(
  'Dragon',
  3,
  'Wyvern',
  [3, 5, 6, 6, 3],
  [multi(melee('Bite', 6, 3), poison(melee('Sting', 5, 2), 4))],
  { height: 'air', defences: [defence('poison', 0.5)] },
  [flying()],
);
const breath = (skill: number, damage: number, type: DamageType) =>
  ability('breath', { skill, damage, type, length: 3, cooldown: 2, targets: 'all', crit: 5 });
add(
  'Dragon',
  4,
  'Young dragon',
  [3, 5, 5, 5, 5],
  [melee('Bite', 6, 4)],
  { height: 'air', defences: [defence('fire', 0.5), defence('cold', 1.5)] },
  [flying(), breath(6, 4, 'fire')],
);
add(
  'Dragon',
  5,
  'Fire dragon',
  [4, 7, 5, 5, 6],
  [melee('Bite', 7, 6)],
  { height: 'air', defences: [defence('fire', 0), defence('cold', 1.5)] },
  [flying(), { ...breath(7, 6, 'fire'), parameters: { ...breath(7, 6, 'fire').parameters, ignitesWood: true } }],
);
add(
  'Dragon',
  6,
  'Frost dragon',
  [4, 7, 5, 5, 7],
  [melee('Bite', 7, 6)],
  { height: 'air', defences: [defence('cold', 0), defence('fire', 1.5)] },
  [
    flying(),
    {
      ...breath(7, 5, 'cold'),
      parameters: { ...breath(7, 5, 'cold').parameters, slowedPotency: 6, slowedDuration: 2, resistance: 'con' },
    },
  ],
);
add(
  'Dragon',
  7,
  'Ancient dragon',
  [5, 8, 4, 5, 9],
  [melee('Bite', 8, 8)],
  {
    height: 'air',
    defences: [defence('fire', 0), defence('physical', 0.5), defence('magic', 0.5), defence('cold', 1.5)],
  },
  [flying(), breath(8, 8, 'fire'), roar(3, 7)],
);
add(
  'Dragon',
  8,
  'Multi-headed Dragon',
  [6, 8, 4, 4, 8],
  [repeat(melee('Bites', 8, 4))],
  {
    height: 'air',
    defences: [defence('fire', 0.5), defence('cold', 0.5), defence('lightning', 0.5), defence('acid', 1.5)],
  },
  [flying(), breath(8, 8, 'fire'), breath(8, 8, 'cold'), breath(8, 8, 'lightning')],
);

const spirit = (level: number, extra: Partial<Creature> = {}): Partial<Creature> => ({
  undead: true,
  undeadClass: level >= 3 ? 'higher' : 'exception',
  corpseEligible: false,
  reanimationAttackIds: [],
  ...extra,
});
const spiritDefences = (
  physical: Creature['defences'][number]['multiplier'],
  light: Creature['defences'][number]['multiplier'] = 1.5,
) => [defence('physical', physical), defence('poison', 0), defence('light', light)];
add(
  'Spirit',
  1,
  'Wisp',
  [1, 2, 4, 7, 3],
  [shot('Spark', 3, 1, 3, 'magic')],
  spirit(1, {
    height: 'air',
    flight: { takeoffCost: 1, landingCost: 1 },
    haunt: { range: 2 },
    defences: spiritDefences(0.5),
  }),
  [flying(), ability('haunt', { range: 2, duration: 'phase' })],
);
const chill = melee('Touch', 4, 2, 'magic');
chill.shots[0]!.secondary.push({ kind: 'Slowed', potency: 2, resistance: 'int', duration: 1, requiresDamage: true });
add(
  'Spirit',
  2,
  'Haunting shade',
  [2, 3, 4, 6, 4],
  [chill],
  spirit(2, { passCreatures: true, defences: spiritDefences(0.25) }),
  [ability('pass-creatures')],
);
add(
  'Spirit',
  3,
  'Ghost',
  [2, 4, 4, 6, 5],
  [melee('Touch', 5, 3, 'magic')],
  spirit(3, {
    fearAction: { kind: 'Frighten', range: 1, potency: 4, duration: 2 },
    incorporeal: true,
    defences: spiritDefences(0),
  }),
  [ability('frighten', { range: 1, potency: 4, duration: 2 })],
);
const wither = melee('Touch', 6, 4, 'magic');
wither.shots[0]!.secondary.push({ kind: 'Subdued', potency: 4, resistance: 'int', duration: 1, requiresDamage: true });
add('Spirit', 4, 'Spectre', [2, 5, 5, 7, 5], [wither], spirit(4, { incorporeal: true, defences: spiritDefences(0) }));
add(
  'Spirit',
  5,
  'Wraith',
  [2, 6, 5, 7, 6],
  [melee('Touch', 7, 5, 'magic')],
  spirit(5, { lifeDrain: 2, incorporeal: true, defences: [...spiritDefences(0), defence('necrotic', 0.5)] }),
  [ability('drain', { healing: 2, requires: 'living-real-damaged' })],
);
add(
  'Spirit',
  6,
  'Banshee',
  [2, 5, 4, 6, 8],
  [melee('Touch', 6, 3, 'magic')],
  spirit(6, {
    wail: { range: 3, damage: 5, potency: 6, fearPotency: 6, duration: 2, cooldown: 3 },
    wailReadyTurn: 1,
    incorporeal: true,
    defences: [...spiritDefences(0, 2), defence('cold', 0.5)],
  }),
  [
    ability('wail', {
      radius: 3,
      damage: 5,
      type: 'magic',
      potency: 6,
      fearPotency: 6,
      fearDuration: 2,
      cooldown: 3,
      targets: 'all-others',
      damageResistance: 'dex',
      fearResistance: 'int',
    }),
  ],
);
add(
  'Spirit',
  7,
  'Dread revenant',
  [3, 7, 3, 5, 8],
  [melee('Blade', 8, 7, 'magic')],
  spirit(7, { canMarkQuarry: true, defences: [...spiritDefences(0), defence('necrotic', 0.5)] }),
  [ability('weapons'), ability('marked-quarry', { skill: 2, selection: 'action', duration: 'until-target-death' })],
);
add(
  'Spirit',
  8,
  'The Pale Monarch',
  [3, 8, 4, 7, 10],
  [melee('Sceptre', 9, 8, 'magic')],
  spirit(8, {
    ...caster(40, 6, ['Reanimate', 'Release', 'Darkness']),
    incorporeal: true,
    defences: [...spiritDefences(0, 2), defence('necrotic', 0)],
  }),
);

const plant = (extra: Partial<Creature> = {}): Partial<Creature> => ({
  plant: true,
  corpseEligible: false,
  reanimationAttackIds: [],
  ...extra,
});
add(
  'Plant',
  1,
  'Walking mushroom',
  [1, 4, 2, 2, 0],
  [melee('Bump', 3, 1)],
  plant({ spores: { range: 1, potency: 2 }, defences: [defence('cold', 0.5), defence('fire', 1.5)] }),
  [
    ability('spores', {
      range: 1,
      potency: 2,
      resistance: 'con',
      duration: 'next-action-phase',
      targets: 'living-enemy',
    }),
  ],
);
add(
  'Plant',
  2,
  'Grasping vine',
  [2, 5, 2, 3, 0],
  [melee('Tendril', 4, 2, 'physical', 5, 2)],
  plant({ grappleLimbs: 2, grappleEqualSize: true, defences: [defence('physical', 0.5), defence('fire', 1.5)] }),
);
add(
  'Plant',
  3,
  'Thorn bush',
  [3, 5, 1, 2, 0],
  [melee('Thorns', 5, 3)],
  plant({ bristles: 1, flammable: true, defences: [defence('physical', 0.5), defence('fire', 1.5)] }),
  [ability('bristles', { damage: 1, type: 'physical', requiresDamage: true })],
);
add(
  'Plant',
  4,
  'Walking tree',
  [3, 6, 2, 2, 0],
  [melee('Branch', 5, 4, 'physical', 5, 2)],
  plant({
    shove: { attackId: 'basic' },
    flammable: true,
    defences: [defence('physical', 0.5), defence('cold', 0.5), defence('fire', 1.5)],
  }),
  [ability('objects'), ability('shove', { steps: 1, targets: 'smaller' })],
);
add(
  'Plant',
  5,
  'Treant',
  [4, 7, 3, 3, 6],
  [melee('Branch', 7, 6, 'physical', 5, 2)],
  plant({
    flammable: true,
    regeneration: 2,
    defences: [defence('physical', 0.5), defence('cold', 0.5), defence('fire', 1.5)],
  }),
  [ability('objects'), ability('wood-weapon')],
);
rows.push({ profile: swarmProfile('Summon Plant', 6)!, abilities: [] });
add(
  'Plant',
  7,
  'Ancient treant',
  [5, 8, 2, 3, 8],
  [melee('Branch', 8, 8, 'physical', 5, 2)],
  plant({
    ...caster(35, 4, ['Tangleweed', 'Healing Bolt']),
    flammable: true,
    regeneration: 3,
    defences: [defence('physical', 0.25), defence('cold', 0.5), defence('fire', 2)],
  }),
);
add(
  'Plant',
  8,
  'The Walking Forest',
  [8, 7, 1, 2, 8],
  [{ ...melee('Branches', 8, 6), mode: 'cleave', minRange: 0, targetTeams: 'enemies' }],
  plant({
    rootNetwork: { range: 1, potency: 8 },
    rangedCover: { range: 2 },
    flammable: true,
    defences: [defence('physical', 0.25), defence('cold', 0.5), defence('fire', 2)],
  }),
  [
    ability('adjacent-enemies-attack'),
    ability('root-network', { potency: 8, targets: 'smaller-adjacent-enemies', resistance: 'physical' }),
    ability('ranged-cover', { range: 2, stacks: false }),
  ],
);

add('Archer', 1, 'Shepherd', [2, 3, 4, 5, 4], [shot('Sling', 4, 1, 5)], { canRide: true, handlesObjects: true }, [
  ability('objects'),
  ability('rider'),
  ability('unlimited-ammunition'),
]);
add('Archer', 2, 'Bowman', [2, 4, 4, 5, 4], [shot('Bow', 5, 2, 7)], {}, [ability('aim', { skill: 2 })]);
add('Archer', 3, 'Longbowman', [2, 4, 3, 6, 4], [shot('Longbow', 6, 3, 10)], {}, [
  ability('aim', { skill: 2 }),
  ability('close-disadvantage', { range: 3 }),
]);
add(
  'Archer',
  4,
  'Elven Archer',
  [2, 4, 5, 8, 6],
  [
    shot('Magic arrow', 7, 3, 9, 'magic'),
    attack('physical-arrow', 'Physical arrow', 7, 3, 'physical', 9, 'projectile'),
  ],
  { reanimationAttackIds: ['physical-arrow'], ignoresDarknessDisadvantage: true, defences: [defence('magic', 0.5)] },
  [ability('arrow-type', { alternative: 'physical' })],
);
const construct = (defences: Creature['defences']): Partial<Creature> => ({
  reload: { loaded: true, lastFiredTurn: null, lastReloadTurn: null },
  construct: true,
  corpseEligible: false,
  reanimationAttackIds: [],
  defences,
});
add(
  'Archer',
  5,
  'Ballista',
  [3, 7, 1, 1, 0],
  [{ ...shot('Bolt', 7, 7, 12), penetration: 2 }],
  construct([defence('physical', 0.5), defence('poison', 0), defence('fire', 1.5), defence('acid', 1.5)]),
  [
    ability('reload'),
    ability('penetration', { maxTargets: 2, secondDamage: 4, separateHitRoll: true, continuesOnMiss: true }),
  ],
);
function siege(name: string, skill: number, damage: number, range: number, minRange: number, radius: number, fire = 0) {
  const a = attack('basic', name, skill, damage, 'physical', range, 'area', 0);
  a.minRange = minRange;
  a.radius = radius;
  if (fire) a.shots[0]!.components.push({ type: 'fire', amount: fire });
  return a;
}
add(
  'Archer',
  6,
  'Catapult',
  [4, 7, 1, 1, 0],
  [siege('Stone', 5, 5, 12, 4, 1)],
  construct([defence('physical', 0.5), defence('poison', 0), defence('fire', 1.5)]),
  [ability('reload'), ability('arcing')],
);
add(
  'Archer',
  7,
  'Siege Catapult',
  [5, 8, 1, 1, 0],
  [{ ...siege('Stone', 6, 7, 15, 5, 1), structureMultiplier: 2 }],
  construct([defence('physical', 0.5), defence('poison', 0), defence('fire', 1.5), defence('acid', 1.5)]),
  [ability('reload'), ability('arcing'), ability('structure-damage', { multiplier: 2 })],
);
add(
  'Archer',
  8,
  'Thunder Trebuchet',
  [6, 8, 0, 1, 0],
  [siege('Explosive shot', 6, 6, 18, 6, 2, 6)],
  construct([defence('physical', 0.5), defence('poison', 0), defence('fire', 2)]),
  [ability('reload'), ability('arcing')],
);

// Explicit runtime assignments; reanimation uses its own stripped profile.
for (const row of rows) {
  const key = `${row.profile.family}:${row.profile.summonLevel}`;
  row.profile.attackTraits = {
    aim: ['Archer:2', 'Archer:3'].includes(key),
    brace: key === 'Goblin:4',
    ambush: key === 'Serpent:2',
    closeDisadvantageBelow: key === 'Archer:3' ? 3 : 0,
    receivesRally: row.profile.family === 'Goblin',
    rallySource: key === 'Goblin:7',
  };
}

/** Return fresh data: content edits by a caller cannot affect later matches. */
export function approvedRoster(): CreatureBlueprint[] {
  return structuredClone(rows);
}
export function approvedBlueprint(family: Family, level: number): CreatureBlueprint | null {
  const row = rows.find(r => r.profile.family === family && r.profile.summonLevel === level);
  return row ? structuredClone(row) : null;
}
