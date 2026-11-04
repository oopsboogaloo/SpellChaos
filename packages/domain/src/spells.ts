import { z } from 'zod';
const id=z.string().min(1).max(128),uint=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const hex=z.strictObject({q:z.number().int().min(-100000).max(100000),r:z.number().int().min(-100000).max(100000)});
export const summonFamilies=['Cat','Serpent','Goblin','Dragon','Spirit','Plant','Archer'] as const;
export const spellFamilies=['Summon Cat','Summon Serpent','Summon Goblin','Summon Dragon','Summon Spirit','Summon Plant','Summon Archer','Disbelief','Bind','Release','Magic Bolt','Fire Bolt','Magic Attack','Healing Bolt','Teleport','Wall','Tangleweed','Darkness','Reanimate'] as const;
export const spellSchema=z.enum(spellFamilies);
export type SpellFamily=z.infer<typeof spellSchema>;
export const castActionSchema=z.strictObject({type:z.literal('Cast'),spell:spellSchema,level:z.number().int().min(1).max(8),variant:z.enum(['bound','unbound']),targetId:id.nullable(),ground:hex.nullable(),side:z.enum(['left','right'])}).superRefine((action,ctx)=>{
 const groundOnly=action.spell.startsWith('Summon ')||action.spell==='Teleport';
 const projectile=action.spell==='Magic Bolt'||action.spell==='Fire Bolt';
 const targeted=['Bind','Release','Disbelief','Magic Attack','Healing Bolt','Reanimate'].includes(action.spell);
 if((groundOnly&&(action.ground===null||action.targetId!==null)) || (projectile&&((action.ground===null)===(action.targetId===null))) || (targeted&&(action.targetId===null||action.ground!==null)) || (!action.spell.startsWith('Summon ')&&action.variant!=='bound'))ctx.addIssue({code:'custom',message:'INVALID_SPELL_TARGET_OR_VARIANT'});
});
export type CastAction=z.infer<typeof castActionSchema>;
export const timingSchema=z.enum(['instant','quick','slow','ritual2','ritual3']);
export type CastingTime=z.infer<typeof timingSchema>;
export const castSchema=z.strictObject({id,casterId:id,controller:id,originId:id,casterCentre:hex,originCentre:hex,action:castActionSchema,timing:timingSchema,startedTurn:uint.min(1),startedPhase:z.enum(['early','late']),dueTurn:uint.min(1),duePhase:z.enum(['early','late']),paid:uint.max(100)}).superRefine((cast,ctx)=>{
 const ritual=cast.timing.startsWith('ritual'),slow=cast.timing==='slow';
 const dueTurn=cast.startedTurn+(ritual?Number(cast.timing.slice(-1))-1:slow&&cast.startedPhase==='late'?1:0);
 const duePhase=ritual?'late':slow?(cast.startedPhase==='early'?'late':'early'):cast.startedPhase;
 const cost=cast.action.spell==='Disbelief'?2:cast.action.spell.startsWith('Summon ')&&cast.action.variant==='unbound'?Math.ceil(5*cast.action.level/2):5*cast.action.level;
 if((ritual&&cast.startedPhase!=='early')||cast.dueTurn!==dueTurn||cast.duePhase!==duePhase||cast.paid!==cost)ctx.addIssue({code:'custom',message:'INVALID_CAST_SCHEDULE_OR_PAYMENT'});
});
export type Cast=z.infer<typeof castSchema>;
export const occupiedSlotSchema=z.strictObject({creatureId:id,turn:uint.min(1),phase:z.enum(['early','late'])});
