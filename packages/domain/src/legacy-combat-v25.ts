import { structureTargetSchema } from './structures.js';
import { z } from 'zod';
const id=z.string().min(1).max(128), uint=z.number().int().min(0).max(1000000);
const hex=z.strictObject({q:z.number().int().min(-100000).max(100000),r:z.number().int().min(-100000).max(100000)});
export const damageTypeSchema=z.enum(['physical','fire','cold','lightning','necrotic','magic','light','poison','acid']);
export type DamageType=z.infer<typeof damageTypeSchema>;
export const conditionKindSchema=z.enum(['Bleeding','Poisoned','Acid','Burning','Unconscious','Restrained','Subdued','Slowed','Disease','Fear']);
export const secondarySchema=z.strictObject({kind:conditionKindSchema,potency:uint,resistance:z.enum(['con','int','physical']),duration:uint.nullable(),requiresDamage:z.boolean()});
export const conditionSchema=secondarySchema.extend({illusionId:id.nullable(),sourceId:id.nullable(),startsTurn:uint,endsTurn:uint.nullable(),activatesTurn:uint.nullable(),active:z.boolean(),rootNetwork:z.literal(true).optional(),expiresAfterPhase:z.strictObject({turn:uint.min(1),phase:z.enum(['early','late'])}).optional()});
export type Condition=z.infer<typeof conditionSchema>;
export const componentSchema=z.strictObject({type:damageTypeSchema,amount:uint});
export type DamageComponent=z.infer<typeof componentSchema>;
export const strikeSchema=z.strictObject({skill:uint,crit:z.number().min(0).max(100),components:z.array(componentSchema).min(1),secondary:z.array(secondarySchema)});
export const attackDefinitionSchema=z.strictObject({id,name:z.string(),mode:z.enum(['melee','projectile','direct','area','swarm','cleave']),range:uint.min(1),minRange:uint,radius:uint,penetration:z.literal(2).optional(),structureMultiplier:z.literal(2).optional(),targetTeams:z.enum(['all','enemies']).optional(),areaDamage:z.literal(true).optional(),shots:z.array(strikeSchema).min(1).max(3)});
export type AttackDefinition=z.infer<typeof attackDefinitionSchema>;
export const attackActionSchema=z.strictObject({type:z.literal('Attack'),attackId:id,targetIds:z.array(id).max(3),ground:hex.nullable(),side:z.enum(['left','right']),structure:structureTargetSchema.optional()});
export type AttackAction=z.infer<typeof attackActionSchema>;
export const powerActionSchema=z.union([z.strictObject({type:z.literal('Roar')}),z.strictObject({type:z.literal('Wail')}),z.strictObject({type:z.literal('RootNetwork')}),z.strictObject({type:z.enum(['Frighten','Gaze','Spores']),targetId:id})]);
export type PowerAction=z.infer<typeof powerActionSchema>;
export const combatActionSchema=z.union([
 attackActionSchema,
 powerActionSchema,
 z.strictObject({type:z.literal('Haunt'),ground:hex}),
 z.strictObject({type:z.literal('Reload')}),
 z.strictObject({type:z.literal('Guard'),attackId:id,targetId:id.nullable(),area:z.array(hex)}),
 z.strictObject({type:z.enum(['Grapple','MarkQuarry']),targetId:id}),
 z.strictObject({type:z.enum(['Treat','Wake','Extinguish']),targetId:id}),
]);
export const guardSchema=z.strictObject({creatureId:id,attackId:id,targetId:id.nullable(),area:z.array(hex),attacked:z.array(id),spent:z.boolean()});
export const holdSchema=z.strictObject({grapplerId:id,targetId:id,limb:uint});
export const reactionSchema=z.strictObject({attackerId:id,targetId:id,attackId:id});
export const pendingAttackSchema=z.strictObject({actionId:id,attackerId:id,action:attackActionSchema,shotIndex:uint,victimIndex:uint,areaVictims:z.array(id).nullable(),damageByTarget:z.array(z.strictObject({targetId:id,amount:uint})),source:z.enum(['action','guard'])});
export const corpseSchema=z.strictObject({id,creatureId:id,centre:hex,size:uint.min(1),con:uint.min(1),maxHp:uint.min(1),fireAcidDamage:uint,skeletal:z.boolean(),restorationUsed:z.boolean()});
export function staff(): AttackDefinition {return {id:'staff',name:'Staff',mode:'melee',range:1,minRange:0,radius:0,shots:[{skill:4,crit:5,components:[{type:'physical',amount:2}],secondary:[]}]};}

export function validAttackTargets(attack:AttackDefinition,action:AttackAction,source:'action'|'guard'='action'):boolean {
 if(action.structure)return source==='action'&&action.ground===null&&action.targetIds.length===0&&!['swarm','area','cleave'].includes(attack.mode);
 if(attack.mode==='swarm'||attack.mode==='cleave')return action.ground===null&&action.targetIds.length===(source==='guard'?1:0);
 if(action.ground!==null)return action.targetIds.length===0 && (attack.mode==='area'||attack.mode==='projectile');
 return attack.mode!=='area' && [1,attack.shots.length].includes(action.targetIds.length);
}

export const damageRecordSchema=z.strictObject({sequence:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),targetId:id,sourceId:id.nullable(),actionId:id.nullable(),illusionId:id.nullable(),components:z.array(componentSchema).min(1),amount:z.number().int().min(1),remaining:z.number().int().min(0)});
