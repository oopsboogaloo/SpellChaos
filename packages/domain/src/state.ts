import { implementedSpells } from '../../content/src/spells.js';
import { summonProfile } from '../../content/src/summons.js';
import { castActionSchema, castSchema, occupiedSlotSchema, spellSchema, summonFamilies } from './spells.js';
import { z } from 'zod';
import { powerActionSchema, validAttackTargets, attackDefinitionSchema, combatActionSchema, conditionSchema, damageTypeSchema, guardSchema, holdSchema, reactionSchema, pendingAttackSchema, corpseSchema, damageRecordSchema } from './combat.js';
import { distance, inside } from '../../geometry/src/hex.js';

export const VERSION = { schema: 23, rules: 'roster-0.12', content: 'blink-spores-wail-0.1', rng: 'xorshift32-v1' } as const;
export const id = z.string().min(1).max(128);
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const rngState = z.number().int().min(1).max(0xffffffff);
export const hexSchema = z.strictObject({ q: z.number().int().min(-100000).max(100000), r: z.number().int().min(-100000).max(100000) });
export const actionSchema = z.union([z.enum(['Defend', 'TotalDefence', 'Dash', 'Escape']), combatActionSchema, castActionSchema]);
export const orderSchema = z.strictObject({ creatureId: id, path: z.array(hexSchema).max(1000), early: actionSchema.nullable(), late: actionSchema.nullable(), blinkIndex:uint.optional() });
export type Order = z.infer<typeof orderSchema>;
const envelope = { matchId: id, playerId: id, turn: uint.min(1), commandId: id, expectedRevision: uint };
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('LockTurn') }),
  z.strictObject({ ...envelope, type: z.literal('SetOrder'), order: orderSchema }),
  z.strictObject({ ...envelope, type: z.literal('ClearOrder'), creatureId: id }),
  z.strictObject({ ...envelope, type: z.literal('CancelCast'), creatureId: id }),
  z.strictObject({ ...envelope, type: z.literal('ReleaseHold'), creatureId: id, targetId: id.nullable() }),
  z.strictObject({ ...envelope, type: z.literal('DeadlineReached') }),
  z.strictObject({ ...envelope, type: z.literal('StartResolution') }),
]);
export type Command = z.infer<typeof commandSchema>;
export const creatureSchema = z.strictObject({
  id, centre: hexSchema, size: z.number().int().min(1).max(10), controller: id.nullable(),
  darknessSightRange:uint, ignoresDarknessDisadvantage:z.boolean(), creatorId:id.nullable(), knownIllusionBy:z.array(id),
  kind: z.enum(['wizard', 'summon', 'reanimated', 'illusion']), height: z.enum(['ground', 'air']),
  intelligence: uint, dex: uint, move: uint.max(100), mana: uint.max(100),
  alive: z.boolean(), incapacitated: z.boolean(), restrained: z.boolean(), slowed: z.boolean(), subdued: z.boolean(),
  doubleAction: z.boolean(), readyTurn: uint.min(1),
  swarm: z.boolean(), originalSize: z.number().int().min(1).max(10), incorporeal: z.boolean(), passCreatures:z.boolean().optional(), nimble: z.boolean(),
  species:z.string(), family:z.enum(summonFamilies).nullable(), summonLevel:z.number().int().min(1).max(8), bindingLevel:z.number().int().min(1).max(8).nullable(), familiar:z.boolean(), createdSequence:uint,
  maxMana:uint.max(100), manaRegen:uint.max(5), spellLevelCap:z.number().int().min(0).max(8), spellbook:z.array(spellSchema),
  con: uint.min(1), hp: z.number().int().min(-1000000).max(1000000), maxHp: uint.min(1),
  attacks: z.array(attackDefinitionSchema), conditions: z.array(conditionSchema),
  defences: z.array(z.strictObject({type:damageTypeSchema,multiplier:z.union([z.literal(0),z.literal(0.25),z.literal(0.5),z.literal(1.5),z.literal(2)])})),
  undead:z.boolean(), undeadClass:z.enum(['none','zombie','skeleton','higher','exception']), construct:z.boolean(), plant:z.boolean(), flammable:z.boolean(),
  attackTraits:z.strictObject({aim:z.boolean(),brace:z.boolean(),ambush:z.boolean(),closeDisadvantageBelow:uint,receivesRally:z.boolean(),rallySource:z.boolean()}),
  reload:z.strictObject({loaded:z.boolean(),lastFiredTurn:uint.min(1).nullable(),lastReloadTurn:uint.min(1).nullable()}).nullable(),
  canMarkQuarry:z.boolean(),quarryTargetId:id.nullable(),
  blink:z.strictObject({range:z.literal(3)}).optional(),blinkUsedTurn:uint.min(1).optional(),
  spores:z.strictObject({range:z.literal(1),potency:z.literal(2)}).optional(),
  wail:z.strictObject({range:z.literal(3),damage:z.literal(5),potency:z.literal(6),fearPotency:z.literal(6),duration:z.literal(2),cooldown:z.literal(3)}).optional(),wailReadyTurn:uint.min(1).optional(),
  fearAction:z.strictObject({kind:z.enum(['Roar','Frighten']),range:uint.min(1).max(30),potency:uint.min(1),duration:uint.min(1).max(1000)}).optional(),
  gaze:z.strictObject({range:uint.min(1).max(30),potency:uint.min(1),duration:uint.min(1).max(1000)}).optional(),
  shove:z.strictObject({attackId:id}).optional(),
  pounce:z.strictObject({attackId:id,steps:uint.min(1).max(1000),damage:uint.min(1).max(1000000)}).optional(),
  pounceTrail:z.array(hexSchema).min(2).max(1001).optional(),
  bristles:uint.max(1000000),lifeDrain:uint.max(1000000),
  packTactics:z.boolean(), regeneration:uint, regenerationBlockedTurn:uint.nullable(), fireAcidDamage:uint,
  grappleLimbs:uint, grappleEqualSize:z.boolean(), corpseEligible:z.boolean(), restorationUsed:z.boolean(), reanimationAttackIds:z.array(id).nullable(),

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
  destroyedWallIds:z.array(id),
  wallCrossings:z.array(z.strictObject({creatureId:id,networkId:id})),
  tangleweed:z.array(z.strictObject({id,casterId:id,level:z.number().int().min(1).max(8),createdTurn:uint.min(1),endsTurn:uint.min(1),cells:z.array(z.strictObject({hex:hexSchema,hp:uint.min(1)})).min(1).max(8)})),
  weedAttempts:z.array(id),weedHolds:z.array(z.strictObject({creatureId:id,patchId:id,hex:hexSchema})),
  movementSpent:z.array(z.strictObject({creatureId:id,amount:uint})),
  darkness:z.array(z.strictObject({id,casterId:id,centre:hexSchema,level:z.number().int().min(1).max(8),createdTurn:uint.min(1),endsTurn:uint.min(1)})),
  damageLedger:z.array(damageRecordSchema),
  balanceUnits:z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), casts:z.array(castSchema), castOccupied:z.array(occupiedSlotSchema), quickQueue:z.array(id).nullable(), nextEntityId:uint,
  board: z.strictObject({ columns: z.literal(30), rows: z.literal(30) }),
  walls: z.array(z.strictObject({ id, casterId:id.nullable().optional(),networkId:id.optional(), edge: z.strictObject({ a: hexSchema, b: hexSchema }), material: z.enum(['wood','stone','iron','crystal','thorns','fire','energy','death']), hp:uint, maxHp:uint.min(1), burning:z.strictObject({startsTurn:uint,endsTurn:uint}).nullable() })),
  players: z.array(z.strictObject({ id, wizardId: id, locked: z.boolean(), participated: z.boolean(), missedTurns: uint.max(3), eliminated: z.boolean() })).min(2).max(8),
  creatures: z.array(creatureSchema), orders: z.array(orderSchema), dashed: z.array(id),
  reservations: z.array(z.strictObject({ orderId: id, creatureId: id, amount: uint.max(100) })),
  cursor: z.strictObject({ entries: z.array(entrySchema), index: uint, pathIndex: uint, initialized: z.boolean(), activePath: z.array(hexSchema).nullable(), lastRestingCentre: hexSchema.nullable() }),
  defending: z.array(z.strictObject({ creatureId: id, phases: z.array(z.enum(['early','late'])).max(2) })),
  guards:z.array(guardSchema), holds:z.array(holdSchema), reactions:z.array(reactionSchema), pendingAttack:pendingAttackSchema.nullable(),
  pendingPower:z.strictObject({actorId:id,action:powerActionSchema,targets:z.array(id),index:uint,origin:hexSchema.optional(),actionId:id.optional(),damageByTarget:z.array(z.strictObject({targetId:id,amount:uint})).optional()}).nullable(),
  actedThisPhase:z.array(id),
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
  for(const c of state.creatures){
    if((c.blinkUsedTurn!==undefined&&(!c.blink||c.blinkUsedTurn>state.turn))||(c.wailReadyTurn!==undefined&&(!c.wail||c.wailReadyTurn>state.turn+c.wail.cooldown)))invalid('INVALID_ABILITY_READINESS');
    if(c.shove&&!c.attacks.some(a=>a.id===c.shove!.attackId&&a.mode==='melee'))invalid('INVALID_SHOVE_ATTACK');
    if(c.pounce&&!c.attacks.some(a=>a.id===c.pounce!.attackId&&a.mode==='melee'))invalid('INVALID_POUNCE_ATTACK');
    if(c.pounceTrail){
      const trail=c.pounceTrail;
      if(!c.pounce||!state.moved.includes(c.id)||!['movement','late','end','ended'].includes(state.phase)||distance(trail[trail.length-1]!,c.centre)!==0||trail.some((h,i)=>!inside(h,state.board)||(i>0&&distance(trail[i-1]!,h)!==1)))invalid('INVALID_POUNCE_TRAIL');
    }
  }
  if(!unique(state.wallCrossings.map(w=>`${w.creatureId}:${w.networkId}`))||state.wallCrossings.some(w=>!creatures.includes(w.creatureId)))invalid('INVALID_WALL_CROSSINGS');
  for(const w of state.walls)if((w.casterId!==undefined&&w.casterId!==null&&!creatures.includes(w.casterId))||((w.casterId!==undefined)!==(w.networkId!==undefined)))invalid('INVALID_WALL_OWNER');
  if(!unique(state.tangleweed.map(w=>w.id))||!unique(state.weedAttempts)||!unique(state.weedHolds.map(h=>h.creatureId))||!unique(state.movementSpent.map(m=>m.creatureId)))invalid('DUPLICATE_WEED_OR_MOVEMENT');
  for(const w of state.tangleweed)if(!creatures.includes(w.casterId)||w.createdTurn>state.turn||w.endsTurn!==w.createdTurn+w.level||w.cells.length>w.level||!unique(w.cells.map(c=>`${c.hex.q},${c.hex.r}`))||w.cells.some(c=>!inside(c.hex,state.board)||c.hp>3*w.level))invalid('INVALID_TANGLEWEED');
  for(const h of state.weedHolds)if(!creatures.includes(h.creatureId)||!state.tangleweed.some(w=>w.id===h.patchId&&w.cells.some(c=>distance(c.hex,h.hex)===0)))invalid('INVALID_WEED_HOLD');
  if(state.weedAttempts.some(id=>!creatures.includes(id))||state.movementSpent.some(m=>!creatures.includes(m.creatureId)))invalid('INVALID_WEED_OR_MOVEMENT_REFERENCE');
  if (!unique(state.darkness.map(d=>d.id))) invalid('DUPLICATE_DARKNESS');
  for(const d of state.darkness)if(!creatures.includes(d.casterId)||!inside(d.centre,state.board)||d.createdTurn>state.turn||d.endsTurn!==d.createdTurn+d.level)invalid('INVALID_DARKNESS');
  if(!unique(state.destroyedWallIds)||state.walls.some(w=>state.destroyedWallIds.includes(w.id)))invalid('INVALID_DESTROYED_WALLS');
  if (!unique(state.walls.map(w => w.id))) invalid('DUPLICATE_WALL');
  for(const w of state.walls)if(w.hp===0||(!inside(w.edge.a,state.board)&&!inside(w.edge.b,state.board)))invalid('INVALID_WALL_POSITION_OR_HP');
  if (!unique(state.accepted.map(a => a.command.commandId)) || state.revision !== state.accepted.length) invalid('INVALID_HISTORY');
  state.accepted.forEach((a, i) => {
    if (a.revision !== i + 1 || a.command.expectedRevision !== i || a.command.matchId !== state.matchId || a.command.turn > state.turn ||
      (a.command.playerId !== '$system' && !players.includes(a.command.playerId))) invalid('INVALID_COMMAND_HISTORY');
    const system = ['DeadlineReached', 'StartResolution'].includes(a.command.type);
    if (system !== (a.command.playerId === '$system')) invalid('INVALID_COMMAND_AUTHORITY');
    if (a.command.type === 'SetOrder' && !creatures.includes(a.command.order.creatureId)) invalid('INVALID_HISTORY_ENTITY');
    if ((a.command.type === 'ClearOrder' || a.command.type === 'ReleaseHold' || a.command.type === 'CancelCast') && !creatures.includes(a.command.creatureId)) invalid('INVALID_HISTORY_ENTITY');
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
    const participated = state.accepted.some(a => a.command.turn === state.turn && a.command.playerId === p.id && ['LockTurn','SetOrder','ClearOrder','ReleaseHold','CancelCast'].includes(a.command.type));
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
      if(action.type==='Cast'){
        if((action.targetId!==null&&!(action.spell==='Reanimate'?state.corpses.some(c=>c.id===action.targetId):creatures.includes(action.targetId))) || (action.ground&&!inside(action.ground,state.board))||action.hexes?.some(h=>!inside(h,state.board)))invalid('INVALID_CAST_TARGET');
      }else if(action.type==='Attack'||action.type==='Guard'){
        const attack=creature.attacks.find(a=>a.id===action.attackId);
        if(!attack)invalid('INVALID_ORDER_ATTACK');
        if(action.type==='Attack'){
          if(action.targetIds.some(id=>!creatures.includes(id)) || (action.ground && !inside(action.ground,state.board)))invalid('INVALID_ORDER_TARGET');
          if(attack && !validAttackTargets(attack,action))invalid('INVALID_ORDER_TARGET');
        }else if(action.targetId!==null&&!creatures.includes(action.targetId))invalid('INVALID_ORDER_TARGET');
      }else if(action.type==='Roar'||action.type==='Wail'){
        if(action.type==='Wail'?!creature.wail:creature.fearAction?.kind!=='Roar')invalid('INVALID_POWER_ORDER');
      }else if(action.type==='Frighten'||action.type==='Gaze'||action.type==='Spores'){
        if((action.type==='Frighten'?creature.fearAction?.kind!=='Frighten':action.type==='Gaze'?!creature.gaze:!creature.spores)||action.targetId===creature.id||!creatures.includes(action.targetId))invalid('INVALID_POWER_ORDER');
      }else if(action.type==='Reload'){
        if(creature.reload===null)invalid('INVALID_RELOAD_ORDER');
      }else if(action.type==='MarkQuarry'){
        if(!creature.canMarkQuarry||action.targetId===creature.id||!creatures.includes(action.targetId))invalid('INVALID_QUARRY_ORDER');
      }else if(!creatures.includes(action.targetId) && !(action.type==='Extinguish'&&(state.walls.some(w=>w.id===action.targetId)||state.destroyedWallIds.includes(action.targetId))))invalid('INVALID_ORDER_TARGET');
    }
    if (order.late === 'Dash' || (['planning','ready'].includes(state.phase) && actions.length > (creature.doubleAction && !creature.subdued ? 2 : 1)) ||
      (actions.includes('TotalDefence') && (order.path.length > 0 || actions.length !== 1)) ||
      (['planning','ready'].includes(state.phase) && creature.subdued && order.path.length && actions.length)) invalid('INVALID_ACTION_BUDGET');
    if(order.blinkIndex!==undefined&&(!creature.blink||order.blinkIndex>=order.path.length))invalid('INVALID_BLINK_ORDER');
    if (order.path.some((h, i) => i > 0 && (i===order.blinkIndex?distance(order.path[i-1]!,h)<1||distance(order.path[i-1]!,h)>3:distance(order.path[i - 1]!, h) !== 1))) invalid('DISCONNECTED_PATH');
  }
  if (!unique(state.reservations.map(r => r.orderId)) || state.reservations.some(r => !creatures.includes(r.creatureId))) invalid('INVALID_RESERVATION');
  if(['planning','ready'].includes(state.phase))for(const c of state.creatures){
    const order=state.orders.find(o=>o.creatureId===c.id);
    const expected=order?[order.early,order.late].reduce((total,a)=>total+(a&&typeof a==='object'&&a.type==='Cast'?(a.spell==='Disbelief'?2:a.spell.startsWith('Summon ')&&a.variant!=='bound'?Math.ceil(5*a.level/2):5*a.level):0),0):0;
    if(state.reservations.filter(r=>r.creatureId===c.id).reduce((n,r)=>n+r.amount,0)!==expected)invalid('INVALID_MANA_RESERVATION');
  }
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
    if(c.attacks.some(a=>a.penetration===2&&(a.mode!=='projectile'||a.shots.length!==1)))invalid('INVALID_PENETRATING_ATTACK');
    if(c.reanimationAttackIds!==null&&(!unique(c.reanimationAttackIds)||c.reanimationAttackIds.some(id=>!c.attacks.some(a=>a.id===id))))invalid('INVALID_BODY_ATTACKS');
    if(c.swarm&&(c.size>c.originalSize||c.maxHp!==c.con*c.originalSize))invalid('INVALID_SWARM_SIZE_OR_HP');
    if((c.creatorId!==null&&!creatures.includes(c.creatorId))||!unique(c.knownIllusionBy)||c.knownIllusionBy.some(id=>!players.includes(id)))invalid('INVALID_ILLUSION_KNOWLEDGE');
    if(c.conditions.some(e=>e.illusionId!==null&&(e.sourceId!==e.illusionId||!state.creatures.some(source=>source.id===e.illusionId&&source.kind==='illusion'))))invalid('INVALID_ILLUSORY_CONDITION');
    if(c.mana>c.maxMana || !unique(c.spellbook))invalid('INVALID_MAGIC_RESOURCES');
    if(c.hp>c.maxHp || !unique(c.attacks.map(a=>a.id)) || !unique(c.conditions.map(c=>`${c.kind}:${c.illusionId??'real'}`))) invalid('INVALID_COMBAT_ENTITY');
    if(c.conditions.some(e=>e.expiresAfterPhase&&(e.kind!=='Unconscious'||e.endsTurn!==null||e.expiresAfterPhase.turn<e.startsTurn||e.expiresAfterPhase.turn>e.startsTurn+1||(e.expiresAfterPhase.turn===e.startsTurn?e.expiresAfterPhase.phase!=='late':e.expiresAfterPhase.phase!=='early'))))invalid('INVALID_PHASE_EXPIRY');
    if(c.conditions.some(effect=>effect.sourceId!==null && !creatures.includes(effect.sourceId))) invalid('INVALID_CONDITION_SOURCE');
  }
  if(!unique(state.guards.map(g=>g.creatureId)) || state.guards.some(g=>!creatures.includes(g.creatureId) || !state.creatures.find(c=>c.id===g.creatureId)?.attacks.some(a=>a.id===g.attackId) || (g.targetId!==null && !creatures.includes(g.targetId)) || g.attacked.some(id=>!creatures.includes(id)))) invalid('INVALID_GUARD');
  if(!unique(state.holds.map(h=>`${h.grapplerId}:${h.limb}`)) || state.holds.some(h=>h.grapplerId===h.targetId || !creatures.includes(h.targetId) || !creatures.includes(h.grapplerId) || h.limb>=state.creatures.find(c=>c.id===h.grapplerId)!.grappleLimbs)) invalid('INVALID_HOLD');
  if(state.reactions.some(r=>!creatures.includes(r.attackerId) || !creatures.includes(r.targetId) || !state.creatures.find(c=>c.id===r.attackerId)?.attacks.some(a=>a.id===r.attackId))) invalid('INVALID_REACTION');
  if(state.pendingAttack) {
    const pending=state.pendingAttack, attacker=state.creatures.find(c=>c.id===pending.attackerId), attack=attacker?.attacks.find(a=>a.id===pending.action.attackId);
    if(attack?.penetration===2&&((pending.areaVictims?.length??0)>2||pending.areaVictims?.includes(pending.attackerId)))invalid('INVALID_PENETRATION_VICTIMS');
    if((pending.areaVictims!==null&&!unique(pending.areaVictims))||!unique(pending.damageByTarget.map(d=>d.targetId)))invalid('DUPLICATE_ATTACK_VICTIM');
    if(!['early','movement','late'].includes(state.phase) || (pending.source==='action' && (state.phase==='movement' || current?.creatureId!==pending.attackerId)))invalid('INVALID_ATTACK_CONTINUATION');
    if(!attack || !validAttackTargets(attack,pending.action,pending.source) || pending.shotIndex>attack.shots.length || pending.victimIndex>(pending.areaVictims?.length ?? 0) || pending.action.targetIds.some(id=>!creatures.includes(id)) || pending.damageByTarget.some(d=>!creatures.includes(d.targetId)) || pending.areaVictims?.some(id=>!creatures.includes(id))) invalid('INVALID_PENDING_ATTACK');
  }
  if(state.pendingPower){
    const p=state.pendingPower,actor=state.creatures.find(c=>c.id===p.actorId);
    if(!actor||state.pendingAttack||!['early','late'].includes(state.phase)||current?.creatureId!==p.actorId||!state.actedThisPhase.includes(p.actorId)||!state.spentActions.includes(p.actorId))invalid('INVALID_POWER_CONTINUATION');
    const area=p.action.type==='Roar'||p.action.type==='Wail';
    const capable=p.action.type==='Gaze'?!!actor?.gaze:p.action.type==='Spores'?!!actor?.spores:p.action.type==='Wail'?!!actor?.wail:actor?.fearAction?.kind===p.action.type;
    if(!capable||!unique(p.targets)||p.targets.some((id,i)=>!creatures.includes(id)||id===p.actorId||(i>0&&p.targets[i-1]!>=id))||p.index>p.targets.length||(!area&&'targetId' in p.action&&(p.targets.length!==1||p.targets[0]!==p.action.targetId)))invalid('INVALID_PENDING_POWER');
    if(p.action.type==='Wail'){
      if(actor?.wailReadyTurn!==state.turn+(actor?.wail?.cooldown??0)||!p.origin||!inside(p.origin,state.board)||!p.actionId||!p.damageByTarget||!unique(p.damageByTarget.map(d=>d.targetId))||p.damageByTarget.some(d=>!p.targets.slice(0,p.index).includes(d.targetId)))invalid('INVALID_WAIL_CONTINUATION');
    }else if(p.origin||p.actionId||p.damageByTarget)invalid('UNEXPECTED_POWER_ACCUMULATOR');
  }
  for(const c of state.creatures)if(c.reload){const r=c.reload;
   if((r.lastReloadTurn!==null&&r.lastFiredTurn===null)||(r.lastFiredTurn??0)>state.turn||(r.lastReloadTurn??0)>state.turn||(r.lastFiredTurn!==null&&r.lastFiredTurn===r.lastReloadTurn)||(!r.loaded&&(r.lastFiredTurn===null||(r.lastReloadTurn??0)>r.lastFiredTurn))||(r.loaded&&r.lastFiredTurn!==null&&(r.lastReloadTurn??0)<=r.lastFiredTurn))invalid('INVALID_RELOAD_STATE');
  }
  if(state.creatures.some(c=>c.quarryTargetId!==null&&(!c.canMarkQuarry||c.quarryTargetId===c.id||!state.creatures.some(t=>t.id===c.quarryTargetId&&t.alive))))invalid('INVALID_QUARRY');
  if(!unique(state.actedThisPhase)||state.actedThisPhase.some(id=>!creatures.includes(id)))invalid('INVALID_PHASE_ACTIVITY');
  if(state.spentActions.some(id=>!creatures.includes(id)) || !unique(state.moved) || state.moved.some(id=>!creatures.includes(id))) invalid('INVALID_TURN_ACTIVITY');
  if(!unique(state.deadHandled) || state.deadHandled.some(id=>!creatures.includes(id)) || !unique(state.corpses.map(c=>c.id)) || state.corpses.some(c=>!creatures.includes(c.creatureId))) invalid('INVALID_CORPSE');
  if(state.deadHandled.some(id=>state.creatures.find(c=>c.id===id)?.alive))invalid('REVIVED_PERMANENT_DEATH');
  if(!unique(state.damageLedger.map(d=>String(d.sequence))))invalid('DUPLICATE_DAMAGE_RECORD');
  for(const d of state.damageLedger){
    if(!creatures.includes(d.targetId)||(d.sourceId!==null&&!creatures.includes(d.sourceId))||d.remaining>d.amount||d.sequence>=state.nextEntityId||(d.illusionId!==null&&(!state.creatures.some(c=>c.id===d.illusionId&&c.kind==='illusion')||d.sourceId!==d.illusionId)))invalid('INVALID_DAMAGE_RECORD');
  }
  if(!unique(state.casts.map(c=>c.id)) || !unique(state.casts.map(c=>c.casterId)))invalid('DUPLICATE_CAST');
  for(const cast of state.casts){
    if(!implementedSpells.includes(cast.action.spell)||(cast.action.spell.startsWith('Summon ')&&!summonProfile(cast.action.spell,cast.action.level)))invalid('UNAVAILABLE_CAST_CONTENT');
    if(cast.action.hexes?.some(h=>!inside(h,state.board)))invalid('INVALID_CAST_LAYOUT');
    if(!creatures.includes(cast.casterId)||!creatures.includes(cast.originId)||!players.includes(cast.controller)||cast.dueTurn<cast.startedTurn||cast.startedTurn>state.turn||cast.dueTurn<state.turn||(cast.action.targetId!==null&&!(cast.action.spell==='Reanimate'?state.corpses.some(c=>c.id===cast.action.targetId):creatures.includes(cast.action.targetId))))invalid('INVALID_CAST_REFERENCE');
  }
  if(state.castOccupied.some(slot=>!creatures.includes(slot.creatureId)||slot.turn!==state.turn))invalid('INVALID_CAST_SLOT');
  if(state.quickQueue && (!['early','late'].includes(state.phase) || !unique(state.quickQueue) || state.quickQueue.some(id=>!creatures.includes(id))))invalid('INVALID_QUICK_QUEUE');
  if (state.walls.some(w => w.hp>w.maxHp || distance(w.edge.a, w.edge.b) !== 1)) invalid('INVALID_WALL');
});
