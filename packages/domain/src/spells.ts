import { structureTargetSchema } from './structures.js';
import { connectedWallEdges } from '../../geometry/src/wall-layout.js';
import { z } from 'zod';
import { distance } from '../../geometry/src/hex.js';
const id = z.string().min(1).max(128),
  uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const hex = z.strictObject({
  q: z.number().int().min(-100000).max(100000),
  r: z.number().int().min(-100000).max(100000),
});
export const summonFamilies = ['Cat', 'Serpent', 'Goblin', 'Dragon', 'Spirit', 'Plant', 'Archer'] as const;
export const spellFamilies = [
  'Summon Cat',
  'Summon Serpent',
  'Summon Goblin',
  'Summon Dragon',
  'Summon Spirit',
  'Summon Plant',
  'Summon Archer',
  'Disbelief',
  'Bind',
  'Release',
  'Magic Bolt',
  'Fire Bolt',
  'Magic Attack',
  'Healing Bolt',
  'Teleport',
  'Wall',
  'Tangleweed',
  'Darkness',
  'Reanimate',
] as const;
export const spellSchema = z.enum(spellFamilies);
export type SpellFamily = z.infer<typeof spellSchema>;
export const castActionSchema = z
  .strictObject({
    type: z.literal('Cast'),
    spell: spellSchema,
    level: z.number().int().min(1).max(8),
    variant: z.enum(['bound', 'unbound', 'illusion']),
    targetId: id.nullable(),
    ground: hex.nullable(),
    side: z.enum(['left', 'right']),
    hexes: z.array(hex).min(1).max(8).optional(),
    edges: z
      .array(z.strictObject({ a: hex, b: hex }))
      .min(1)
      .max(10)
      .optional(),
    structure: structureTargetSchema.optional(),
  })
  .superRefine((action, ctx) => {
    if (action.spell === 'Wall') {
      const edges = action.edges ?? [];
      if (
        edges.length < 1 ||
        edges.length > action.level + 2 ||
        edges.some(e => distance(e.a, e.b) !== 1) ||
        !action.ground ||
        !edges[0] ||
        (distance(action.ground, edges[0].a) !== 0 && distance(action.ground, edges[0].b) !== 0)
      )
        ctx.addIssue({ code: 'custom', message: 'INVALID_WALL_LAYOUT' });
      else if (!connectedWallEdges(edges)) ctx.addIssue({ code: 'custom', message: 'DISCONNECTED_WALL_LAYOUT' });
    } else if (action.edges !== undefined) ctx.addIssue({ code: 'custom', message: 'UNEXPECTED_EDGE_LAYOUT' });
    if (action.spell === 'Tangleweed') {
      const cells = action.hexes ?? [],
        seen = new Set<number>([0]);
      for (let i = 0; i < cells.length; i++)
        for (let j = 0; j < cells.length; j++)
          if ([...seen].some(k => cells[k] && distance(cells[k]!, cells[j]!) === 1)) seen.add(j);
      if (
        cells.length !== action.level ||
        new Set(cells.map(h => `${h.q},${h.r}`)).size !== cells.length ||
        seen.size !== cells.length ||
        !action.ground ||
        !cells[0] ||
        distance(action.ground, cells[0]) !== 0
      )
        ctx.addIssue({ code: 'custom', message: 'INVALID_WEED_LAYOUT' });
    } else if (action.hexes !== undefined) ctx.addIssue({ code: 'custom', message: 'UNEXPECTED_HEX_LAYOUT' });
    const groundOnly =
      action.spell.startsWith('Summon ') || ['Teleport', 'Darkness', 'Tangleweed', 'Wall'].includes(action.spell);
    const projectile = action.spell === 'Magic Bolt' || action.spell === 'Fire Bolt';
    const targeted = ['Bind', 'Release', 'Disbelief', 'Magic Attack', 'Healing Bolt', 'Reanimate'].includes(
      action.spell,
    );
    if (action.structure !== undefined && !projectile)
      ctx.addIssue({ code: 'custom', message: 'UNEXPECTED_STRUCTURE_TARGET' });
    if (
      (groundOnly && (action.ground === null || action.targetId !== null)) ||
      (projectile &&
        Number(action.ground !== null) + Number(action.targetId !== null) + Number(action.structure !== undefined) !==
          1) ||
      (targeted && (action.targetId === null || action.ground !== null)) ||
      (!action.spell.startsWith('Summon ') && action.variant !== 'bound')
    )
      ctx.addIssue({ code: 'custom', message: 'INVALID_SPELL_TARGET_OR_VARIANT' });
  });
export type CastAction = z.infer<typeof castActionSchema>;
export const timingSchema = z.enum(['instant', 'quick', 'slow', 'ritual2', 'ritual3']);
export type CastingTime = z.infer<typeof timingSchema>;
export const castSchema = z
  .strictObject({
    id,
    casterId: id,
    controller: id,
    originId: id,
    casterCentre: hex,
    originCentre: hex,
    action: castActionSchema,
    timing: timingSchema,
    startedTurn: uint.min(1),
    startedPhase: z.enum(['early', 'late']),
    dueTurn: uint.min(1),
    duePhase: z.enum(['early', 'late']),
    paid: uint.max(100),
  })
  .superRefine((cast, ctx) => {
    const ritual = cast.timing.startsWith('ritual'),
      slow = cast.timing === 'slow';
    const dueTurn =
      cast.startedTurn + (ritual ? Number(cast.timing.slice(-1)) - 1 : slow && cast.startedPhase === 'late' ? 1 : 0);
    const duePhase = ritual ? 'late' : slow ? (cast.startedPhase === 'early' ? 'late' : 'early') : cast.startedPhase;
    const cost =
      cast.action.spell === 'Disbelief'
        ? 2
        : cast.action.spell.startsWith('Summon ') && cast.action.variant !== 'bound'
          ? Math.ceil((5 * cast.action.level) / 2)
          : 5 * cast.action.level;
    if (
      (ritual && cast.startedPhase !== 'early') ||
      cast.dueTurn !== dueTurn ||
      cast.duePhase !== duePhase ||
      cast.paid !== cost
    )
      ctx.addIssue({ code: 'custom', message: 'INVALID_CAST_SCHEDULE_OR_PAYMENT' });
  });
export type Cast = z.infer<typeof castSchema>;
export const occupiedSlotSchema = z.strictObject({
  creatureId: id,
  turn: uint.min(1),
  phase: z.enum(['early', 'late']),
});
