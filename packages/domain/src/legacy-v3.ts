import { z } from 'zod';
import { validAttackTargets, attackDefinitionSchema, combatActionSchema, conditionSchema, damageTypeSchema, guardSchema, holdSchema, reactionSchema, pendingAttackSchema, corpseSchema } from './legacy-combat-v3.js';
import { distance, inside } from '../../geometry/src/hex.js';

export const VERSION = { schema: 3, rules: 'combat-0.1', content: 'wizard-0.2', rng: 'xorshift32-v1' } as const;
export const id = z.string().min(1).max(128);
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const rngState = z.number().int().min(1).max(0xffffffff);
export const hexSchema = z.strictObject({ q: z.number().int().min(-100000).max(100000), r: z.number().int().min(-100000).max(100000) });
export const actionSchema = z.union([z.enum(['Defend', 'TotalDefence', 'Dash', 'Escape']), combatActionSchema]);
export const orderSchema = z.strictObject({ creatureId: id, path: z.array(hexSchema).max(1000), early: actionSchema.nullable(), late: actionSchema.nullable() });
export type Order = z.infer<typeof orderSchema>;
const envelope = { matchId: id, playerId: id, turn: uint.min(1), commandId: id, expectedRevision: uint };
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('LockTurn') }),
  z.strictObject({ ...envelope, type: z.literal('SetOrder'), order: orderSchema }),
  z.strictObject({ ...envelope, type: z.literal('ClearOrder'), creatureId: id }),
  z.strictObject({ ...envelope, type: z.literal('ReleaseHold'), creatureId: id, targetId: id.nullable() }),
  z.strictObject({ ...envelope, type: z.literal('DeadlineReached') }),
  z.strictObject({ ...envelope, type: z.literal('StartResolution') }),
]);
export type Command = z.infer<typeof commandSchema>;
export const creatureSchema = z.strictObject({
  id, centre: hexSchema, size: z.number().int().min(1).max(10), controller: id.nullable(),
  kind: z.enum(['wizard', 'summon', 'reanimated', 'illusion']), height: z.enum(['ground', 'air']),
  intelligence: uint, dex: uint, move: uint.max(100), mana: uint.max(100),
  alive: z.boolean(), incapacitated: z.boolean(), restrained: z.boolean(), slowed: z.boolean(), subdued: z.boolean(),
  doubleAction: z.boolean(), readyTurn: uint.min(1),
  swarm: z.boolean(), incorporeal: z.boolean(), nimble: z.boolean(),
  con: uint.min(1), hp: z.number().int().min(-1000000).max(1000000), maxHp: uint.min(1),
  attacks: z.array(attackDefinitionSchema), conditions: z.array(conditionSchema),
  defences: z.array(z.strictObject({type:damageTypeSchema,multiplier:z.union([z.literal(0),z.literal(0.25),z.literal(0.5),z.literal(1.5),z.literal(2)])})),
  undead:z.boolean(), undeadClass:z.enum(['none','zombie','skeleton','higher','exception']), construct:z.boolean(), plant:z.boolean(), flammable:z.boolean(),
  packTactics:z.boolean(), regeneration:uint, regenerationBlockedTurn:uint.nullable(), fireAcidDamage:uint,
  grappleLimbs:uint, grappleEqualSize:z.boolean(), corpseEligible:z.boolean(),

});
export type Creature = z.infer<typeof creatureSchema>;
const entrySchema = z.strictObject({ creatureId: id, dex: uint, move: uint, size: uint.min(1).max(10), wizardDistance: uint,
  slowed: z.boolean(), quick: z.boolean(), tie: uint });
export type PhaseEntry = z.infer<typeof entrySchema>;
export const rawStateSchema = z.strictObject({
  schemaVersion: z.literal(VERSION.schema), rulesVersion: z.literal(VERSION.rules), contentVersion: z.literal(VERSION.content), rngVersion: z.literal(VERSION.rng),
  matchId: id, revision: uint, eventSequence: uint, turn: uint.min(1),
  phase: z.enum(['planning', 'ready', 'early', 'movement', 'late', 'end', 'ended']),
  random: z.strictObject({ setup: rngState, resolution: rngState, ai: rngState }),
  board: z.strictObject({ columns: z.literal(30), rows: z.literal(30) }),
  walls: z.array(z.strictObject({ id, edge: z.strictObject({ a: hexSchema, b: hexSchema }), material: z.enum(['wood','stone','iron','crystal','thorns','fire','energy','death']), hp:uint, maxHp:uint.min(1), burning:z.strictObject({startsTurn:uint,endsTurn:uint}).nullable() })),
  players: z.array(z.strictObject({ id, wizardId: id, locked: z.boolean(), participated: z.boolean(), missedTurns: uint.max(3), eliminated: z.boolean() })).min(2).max(8),
  creatures: z.array(creatureSchema), orders: z.array(orderSchema), dashed: z.array(id),
  reservations: z.array(z.strictObject({ orderId: id, creatureId: id, amount: uint.max(100) })),
  cursor: z.strictObject({ entries: z.array(entrySchema), index: uint, pathIndex: uint, initialized: z.boolean(), activePath: z.array(hexSchema).nullable(), lastRestingCentre: hexSchema.nullable() }),
  defending: z.array(z.strictObject({ creatureId: id, phases: z.array(z.enum(['early','late'])).max(2) })),
  guards:z.array(guardSchema), holds:z.array(holdSchema), reactions:z.array(reactionSchema), pendingAttack:pendingAttackSchema.nullable(),
  spentActions:z.array(id), moved:z.array(id), corpses:z.array(corpseSchema), deadHandled:z.array(id), endStep:z.number().int().min(0).max(4),
  result: z.discriminatedUnion('type', [z.strictObject({ type: z.literal('winner'), playerId: id }), z.strictObject({ type: z.literal('draw') })]).nullable(),
  accepted: z.array(z.strictObject({ command: commandSchema, revision: uint.min(1) })),
});
export type GameState = z.infer<typeof rawStateSchema>;
export const stateSchema = rawStateSchema.superRefine((state, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
  const unique = (values: string[]) => new Set(values).size === values.length;
  const players = state.players.map(p => p.id), creatures = state.creatures.map(c => c.id);
  if (!unique(players) || players.includes('$system')) invalid('INVALID_PLAYERS');
  if (!unique(creatures)) invalid('DUPLICATE_CREATURE');
  if (!unique(state.walls.map(w => w.id))) invalid('DUPLICATE_WALL');
  if (!unique(state.accepted.map(a => a.command.commandId)) || state.revision !== state.accepted.length) invalid('INVALID_HISTORY');
  state.accepted.forEach((a, i) => {
    if (a.revision !== i + 1 || a.command.expectedRevision !== i || a.command.matchId !== state.matchId || a.command.turn > state.turn ||
      (a.command.playerId !== '$system' && !players.includes(a.command.playerId))) invalid('INVALID_COMMAND_HISTORY');
    const system = ['DeadlineReached', 'StartResolution'].includes(a.command.type);
    if (system !== (a.command.playerId === '$system')) invalid('INVALID_COMMAND_AUTHORITY');
    if (a.command.type === 'SetOrder' && !creatures.includes(a.command.order.creatureId)) invalid('INVALID_HISTORY_ENTITY');
    if ((a.command.type === 'ClearOrder' || a.command.type === 'ReleaseHold') && !creatures.includes(a.command.creatureId)) invalid('INVALID_HISTORY_ENTITY');
  });
  for (const c of state.creatures) {
    if ((c.controller !== null && !players.includes(c.controller)) || !inside(c.centre, state.board)) invalid('INVALID_CREATURE_REFERENCE');
  }
  for (const p of state.players) {
    const wizard = state.creatures.find(c => c.id === p.wizardId);
    if (!wizard || wizard.kind !== 'wizard' || wizard.controller !== p.id || p.eliminated === wizard.alive) invalid('INVALID_WIZARD');
  }
  const expectedLocks = new Set(state.accepted.filter(a => a.command.turn === state.turn && a.command.type === 'LockTurn').map(a => a.command.playerId));
  const expired = state.accepted.some(a => a.command.turn === state.turn && a.command.type === 'DeadlineReached');
  for (const p of state.players) {
    if (p.locked !== (p.eliminated || expired || expectedLocks.has(p.id))) invalid('INVALID_LOCK_STATE');
    const participated = state.accepted.some(a => a.command.turn === state.turn && a.command.playerId === p.id && ['LockTurn','SetOrder','ClearOrder','ReleaseHold'].includes(a.command.type));
    if (p.participated !== participated) invalid('INVALID_PARTICIPATION');
  }
  if (state.phase === 'planning' && state.players.every(p => p.locked)) invalid('INVALID_PHASE');
  if (['ready', 'early', 'movement', 'late', 'end'].includes(state.phase) && !state.players.every(p => p.locked)) invalid('INVALID_PHASE');
  if ((state.phase === 'ended') !== (state.result !== null)) invalid('INVALID_RESULT_PHASE');
  if (state.result?.type === 'winner' && !players.includes(state.result.playerId)) invalid('INVALID_WINNER');
  const living = state.players.filter(p => !p.eliminated);
  if (state.result?.type === 'draw' && living.length !== 0) invalid('INVALID_DRAW');
  if (state.result?.type === 'winner' && (living.length !== 1 || living[0]!.id !== state.result.playerId)) invalid('INVALID_WINNER');
  if (!unique(state.dashed) || state.dashed.some(id => !creatures.includes(id))) invalid('INVALID_DASH_STATE');
  if (!unique(state.orders.map(o => o.creatureId))) invalid('DUPLICATE_ORDER');
  for (const order of state.orders) {
    const creature = state.creatures.find(c => c.id === order.creatureId);
    if (!creature || order.path.some(h => !inside(h, state.board))) { invalid('INVALID_ORDER_REFERENCE'); continue; }
    const actions = [order.early, order.late].filter(Boolean);
    for(const action of actions)if(action && typeof action==='object'){
      if(action.type==='Attack'||action.type==='Guard'){
        const attack=creature.attacks.find(a=>a.id===action.attackId);
        if(!attack)invalid('INVALID_ORDER_ATTACK');
        if(action.type==='Attack'){
          if(action.targetIds.some(id=>!creatures.includes(id)) || (action.ground && !inside(action.ground,state.board)))invalid('INVALID_ORDER_TARGET');
          if(attack && !validAttackTargets(attack,action))invalid('INVALID_ORDER_TARGET');
        }else if(action.targetId!==null&&!creatures.includes(action.targetId))invalid('INVALID_ORDER_TARGET');
      }else if(!creatures.includes(action.targetId) && !(action.type==='Extinguish'&&state.walls.some(w=>w.id===action.targetId)))invalid('INVALID_ORDER_TARGET');
    }
    if (order.late === 'Dash' || (['planning','ready'].includes(state.phase) && actions.length > (creature.doubleAction && !creature.subdued ? 2 : 1)) ||
      (actions.includes('TotalDefence') && (order.path.length > 0 || actions.length !== 1)) ||
      (['planning','ready'].includes(state.phase) && creature.subdued && order.path.length && actions.length)) invalid('INVALID_ACTION_BUDGET');
    if (order.path.some((h, i) => i > 0 && distance(order.path[i - 1]!, h) !== 1)) invalid('DISCONNECTED_PATH');
  }
  if (!unique(state.reservations.map(r => r.orderId)) || state.reservations.some(r => !creatures.includes(r.creatureId))) invalid('INVALID_RESERVATION');
  for (const c of state.creatures) if (state.reservations.filter(r => r.creatureId === c.id).reduce((sum, r) => sum + r.amount, 0) > c.mana) invalid('OVER_RESERVED');
  if (!unique(state.cursor.entries.map(e => e.creatureId)) || state.cursor.entries.some(e => !creatures.includes(e.creatureId)) || state.cursor.index > state.cursor.entries.length) invalid('INVALID_CURSOR');
  const current = state.cursor.entries[state.cursor.index];
  const path = state.orders.find(o => o.creatureId === current?.creatureId)?.path ?? [];
  if (!state.cursor.initialized && (state.cursor.entries.length || state.cursor.index || state.cursor.pathIndex || state.cursor.activePath)) invalid('UNINITIALIZED_CURSOR');
  if (!unique(state.cursor.entries.map(e => String(e.tie))) || state.cursor.entries.some(e => e.tie >= state.cursor.entries.length)) invalid('DUPLICATE_TIE');
  if (state.cursor.activePath && (state.phase !== 'movement' || state.cursor.activePath.length > path.length || state.cursor.activePath.some((h, i) => h.q !== path[i]?.q || h.r !== path[i]?.r))) invalid('INVALID_ACTIVE_PATH');
  if (state.cursor.pathIndex > (state.cursor.activePath?.length ?? path.length) || (state.phase !== 'movement' && state.cursor.pathIndex !== 0)) invalid('INVALID_PATH_CURSOR');
  if (['planning','ready','ended'].includes(state.phase) && (state.cursor.entries.length || state.cursor.index || state.cursor.pathIndex)) invalid('UNEXPECTED_CURSOR');
  if (!unique(state.defending.map(d => d.creatureId)) || state.defending.some(d => !creatures.includes(d.creatureId) || !unique(d.phases))) invalid('INVALID_DEFENCE');
  for(const c of state.creatures) {
    if(c.hp>c.maxHp || !unique(c.attacks.map(a=>a.id)) || !unique(c.conditions.map(c=>c.kind))) invalid('INVALID_COMBAT_ENTITY');
    if(c.conditions.some(effect=>effect.sourceId!==null && !creatures.includes(effect.sourceId))) invalid('INVALID_CONDITION_SOURCE');
  }
  if(!unique(state.guards.map(g=>g.creatureId)) || state.guards.some(g=>!creatures.includes(g.creatureId) || !state.creatures.find(c=>c.id===g.creatureId)?.attacks.some(a=>a.id===g.attackId) || (g.targetId!==null && !creatures.includes(g.targetId)) || g.attacked.some(id=>!creatures.includes(id)))) invalid('INVALID_GUARD');
  if(!unique(state.holds.map(h=>`${h.grapplerId}:${h.limb}`)) || state.holds.some(h=>h.grapplerId===h.targetId || !creatures.includes(h.targetId) || !creatures.includes(h.grapplerId) || h.limb>=state.creatures.find(c=>c.id===h.grapplerId)!.grappleLimbs)) invalid('INVALID_HOLD');
  if(state.reactions.some(r=>!creatures.includes(r.attackerId) || !creatures.includes(r.targetId) || !state.creatures.find(c=>c.id===r.attackerId)?.attacks.some(a=>a.id===r.attackId))) invalid('INVALID_REACTION');
  if(state.pendingAttack) {
    const pending=state.pendingAttack, attacker=state.creatures.find(c=>c.id===pending.attackerId), attack=attacker?.attacks.find(a=>a.id===pending.action.attackId);
    if(!['early','movement','late'].includes(state.phase) || (pending.source==='action' && (state.phase==='movement' || current?.creatureId!==pending.attackerId)))invalid('INVALID_ATTACK_CONTINUATION');
    if(!attack || !validAttackTargets(attack,pending.action) || pending.shotIndex>attack.shots.length || pending.victimIndex>(pending.areaVictims?.length ?? 0) || pending.action.targetIds.some(id=>!creatures.includes(id)) || pending.damageByTarget.some(d=>!creatures.includes(d.targetId)) || pending.areaVictims?.some(id=>!creatures.includes(id))) invalid('INVALID_PENDING_ATTACK');
  }
  if(state.spentActions.some(id=>!creatures.includes(id)) || !unique(state.moved) || state.moved.some(id=>!creatures.includes(id))) invalid('INVALID_TURN_ACTIVITY');
  if(!unique(state.deadHandled) || state.deadHandled.some(id=>!creatures.includes(id)) || !unique(state.corpses.map(c=>c.id)) || state.corpses.some(c=>!creatures.includes(c.creatureId))) invalid('INVALID_CORPSE');
  if (state.walls.some(w => w.hp>w.maxHp || distance(w.edge.a, w.edge.b) !== 1)) invalid('INVALID_WALL');
});
