import { randomBelow } from '../../domain/src/random.js';
import type { Creature,GameState,Order } from '../../domain/src/state.js';
import type { Cast,CastAction,CastingTime } from '../../domain/src/spells.js';
import { alignment,castingTime,completionAt,implementedSpells,manaCost,spellRange,successChance } from '../../content/src/spells.js';
import { summonProfile } from '../../content/src/summons.js';
import { footprint,nearestPair,equal,inside } from '../../geometry/src/hex.js';
import { placement,traceProjectile } from '../../geometry/src/occupancy.js';
import { clearSight,clearProjectile } from '../../geometry/src/walls.js';
import { arenaOf } from './orders.js';
import { active,restrained,fearAllowsStep } from './status.js';
import { addCondition,applyDamage,clamp,effectChance,heal,hitChance,roll } from './damage.js';
import { hitModifiers } from './combat.js';
import { cleanupDeaths } from './lifecycle.js';
import { createCreature } from './index.js';
import { emit,type Event } from './events.js';

export function castingRoll(s:GameState,chance:number):boolean {const draw=randomBelow(s.random.resolution,1000000);s.random.resolution=draw.state;return draw.value<Math.floor(chance*10000);}
function allocateId(s:GameState,prefix:string):string {
 let id:string;do{id=`${prefix}-${s.nextEntityId++}`;}while(s.creatures.some(c=>c.id===id)||s.casts.some(c=>c.id===id)||s.corpses.some(c=>c.id===id));return id;
}
const actionPhase=(s:GameState):'early'|'late'=>{if(s.phase!=='early'&&s.phase!=='late')throw new Error('NOT_ACTION_PHASE');return s.phase;};
const isSummon=(a:CastAction)=>a.spell.startsWith('Summon ');
const targets=(s:GameState,a:CastAction)=>a.ground?[a.ground]:footprint(s.creatures.find(c=>c.id===a.targetId)!.centre,s.creatures.find(c=>c.id===a.targetId)!.size);
function legalTarget(s:GameState,c:Creature,a:CastAction):boolean {
 if(a.ground)return inside(a.ground,s.board);
 const target=s.creatures.find(t=>t.id===a.targetId);if(!target?.alive)return false;
 if(a.spell==='Healing Bolt')return !target.undead&&target.kind!=='illusion';
 if(a.spell==='Bind')return target.kind!=='wizard'&&target.summonLevel<=a.level&&(target.bindingLevel===null||target.bindingLevel<a.level);
 if(a.spell==='Release')return target.kind!=='wizard'&&target.bindingLevel!==null&&target.bindingLevel<=a.level;
 return true;
}
export function selectOrigin(s:GameState,c:Creature,a:CastAction):Creature|null {
 if(!legalTarget(s,c,a))return null;
 const origins=s.creatures.filter(o=>o.id===c.id || (c.kind==='wizard'&&o.familiar&&o.kind!=='illusion'&&o.controller===c.controller&&o.bindingLevel!==null&&active(o)));
 const cells=targets(s,a);
 return origins.map(origin=>({origin,pair:nearestPair(footprint(origin.centre,origin.size),cells)}))
  .filter(x=>x.pair.distance<=spellRange(a)&&clearSight(x.pair.from,x.pair.to,a.side,s.walls))
  .sort((a,b)=>a.pair.distance-b.pair.distance || Number(b.origin.id===c.id)-Number(a.origin.id===c.id) || a.origin.createdSequence-b.origin.createdSequence || (a.origin.id<b.origin.id?-1:a.origin.id>b.origin.id?1:0))[0]?.origin??null;
}
export function validateCast(s:GameState,c:Creature,a:CastAction):void {
 if(c.kind==='illusion'||!c.spellbook.includes(a.spell)||a.level>c.spellLevelCap)throw new Error('SPELL_NOT_KNOWN');
 if(!implementedSpells.includes(a.spell))throw new Error('CONTENT_NOT_AVAILABLE');
 if(!isSummon(a)&&a.variant!=='bound')throw new Error('INVALID_SPELL_VARIANT');
 const groundOnly=isSummon(a)||a.spell==='Teleport',projectile=['Magic Bolt','Fire Bolt'].includes(a.spell);
 if(groundOnly?(a.ground===null||a.targetId!==null):projectile?(a.ground===null)===(a.targetId===null):(a.targetId===null||a.ground!==null))throw new Error('INVALID_SPELL_TARGET');
 if((a.targetId!==null&&!s.creatures.some(t=>t.id===a.targetId))||(a.ground&&!inside(a.ground,s.board)))throw new Error('INVALID_SPELL_TARGET');
 if(!legalTarget(s,c,a))throw new Error('INVALID_SPELL_TARGET');
 if(a.spell==='Teleport' && (restrained(s,c)||castingLocksMovement(s,c)||!fearAllowsStep(s,c,a.ground!)||!placement(arenaOf(s),c,a.ground!).legal))throw new Error('INVALID_TELEPORT_DESTINATION');
 if(a.spell==='Disbelief'&&s.creatures.find(t=>t.id===a.targetId)?.kind==='illusion')throw new Error('ILLUSION_PROVENANCE_NOT_AVAILABLE');
 if(isSummon(a)){
  const profile=summonProfile(a.spell,a.level);if(!profile)throw new Error('CONTENT_NOT_AVAILABLE');
  const body=createCreature('$preview',c.controller,a.ground!,profile);
  if(!placement(arenaOf(s),body,a.ground!).legal)throw new Error('INVALID_SUMMON_PLACEMENT');
 }
}
export function reservedMana(order:Order):number {return [order.early,order.late].reduce((n,a)=>n+(a&&typeof a==='object'&&a.type==='Cast'?manaCost(a):0),0);}
export function castingLocksMovement(s:GameState,c:Creature,planning=false):boolean {
 return s.casts.some(cast=>(cast.casterId===c.id||cast.originId===c.id)&&!(planning&&cast.dueTurn===s.turn&&cast.duePhase==='early'));
}
export function slotOccupied(s:GameState,c:Creature,phase:'early'|'late'):boolean {
 const existing=s.casts.some(cast=>cast.casterId===c.id);
 return existing || s.castOccupied.some(slot=>slot.creatureId===c.id&&slot.turn===s.turn&&(slot.phase===phase||!c.doubleAction));
}
function occupy(s:GameState,casterId:string,phase:'early'|'late'):void {
 if(!s.castOccupied.some(slot=>slot.creatureId===casterId&&slot.turn===s.turn&&slot.phase===phase))s.castOccupied.push({creatureId:casterId,turn:s.turn,phase});
}
function releaseReservation(s:GameState,casterId:string,amount:number):void {
 const reservation=s.reservations.find(r=>r.creatureId===casterId);
 if(reservation){reservation.amount=Math.max(0,reservation.amount-amount);s.reservations=s.reservations.filter(r=>r.amount>0);}
}
export function interruptCast(s:GameState,castId:string,events:Event[],reason:string):void {
 const cast=s.casts.find(c=>c.id===castId);if(!cast)return;
 s.casts=s.casts.filter(c=>c.id!==castId);s.balanceUnits+=alignment(cast.action.spell)*cast.action.level;
 emit(s,events,{type:'CastInterrupted',creatureId:cast.casterId,action:reason});
}
export function invalidateCasts(s:GameState,events:Event[]):void {
 for(const cast of [...s.casts]){
  const caster=s.creatures.find(c=>c.id===cast.casterId)!,origin=s.creatures.find(c=>c.id===cast.originId)!;
  if(!active(caster)||!active(origin)||caster.controller!==cast.controller||origin.controller!==cast.controller||
   (origin.id!==caster.id&&origin.bindingLevel===null)||!equal(caster.centre,cast.casterCentre)||!equal(origin.centre,cast.originCentre))interruptCast(s,cast.id,events,'caster-or-origin-invalid');
 }
}
export function concentration(s:GameState,damage:readonly {targetId:string;amount:number}[],events:Event[]):void {
 invalidateCasts(s,events);
 for(const item of damage){
  const cast=s.casts.find(c=>c.casterId===item.targetId);if(!cast||item.amount<=0)continue;
  const c=s.creatures.find(c=>c.id===cast.casterId)!;
  const retained=roll(s,clamp(50+5*c.intelligence-5*item.amount,10,95));
  emit(s,events,{type:'ConcentrationChecked',creatureId:c.id,amount:item.amount});
  if(!retained)interruptCast(s,cast.id,events,'concentration');
 }
}
/** Trusted engine entry; optional timing supports scripted ritual scenarios before ritual content exists. */
export function startCast(s:GameState,c:Creature,a:CastAction,events:Event[],timing:CastingTime=castingTime(a.spell)):void {
 const phase=actionPhase(s),cost=manaCost(a);releaseReservation(s,c.id,cost);
 if(s.casts.some(cast=>cast.casterId===c.id))return;
 const origin=selectOrigin(s,c,a);
 if(!origin||c.mana<cost){emit(s,events,{type:'CastInvalid',creatureId:c.id});return;}
 const due=completionAt(s.turn,phase,timing);
 c.mana-=cost;occupy(s,c.id,phase);
 const cast:Cast={id:allocateId(s,'cast'),casterId:c.id,controller:c.controller!,originId:origin.id,casterCentre:{...c.centre},originCentre:{...origin.centre},action:structuredClone(a),timing,startedTurn:s.turn,startedPhase:phase,dueTurn:due.turn,duePhase:due.phase,paid:cost};
 s.casts.push(cast);emit(s,events,{type:'CastStarted',creatureId:c.id,action:a.spell});
 if(timing==='instant')completeCast(s,cast.id,events);
}
function validCompletion(s:GameState,c:Creature,origin:Creature,a:CastAction):boolean {
 if(!legalTarget(s,c,a))return false;
 const pair=nearestPair(footprint(origin.centre,origin.size),targets(s,a));
 if(pair.distance>spellRange(a)||!clearSight(pair.from,pair.to,a.side,s.walls))return false;
 if(isSummon(a)){
  const profile=summonProfile(a.spell,a.level);return !!profile&&placement(arenaOf(s),createCreature('$preview',c.controller,a.ground!,profile),a.ground!).legal;
 }
 if(a.spell==='Teleport')return !restrained(s,c)&&!castingLocksMovement(s,c)&&fearAllowsStep(s,c,a.ground!)&&placement(arenaOf(s),c,a.ground!).legal;
 return true;
}
function spellDamage(s:GameState,c:Creature,origin:Creature,a:CastAction,events:Event[]):void {
 let target=s.creatures.find(t=>t.id===a.targetId);const projectile=a.spell!=='Magic Attack';
 if(projectile){
  const aim=a.ground??nearestPair(footprint(origin.centre,origin.size),footprint(target!.centre,target!.size)).to;
  const trace=traceProjectile(arenaOf(s),origin,aim,target?.height??'ground',a.side,target?.id);
  target=s.creatures.find(t=>t.id===trace.hit);
 }
 if(!target?.alive)return;
 const original=target;
 const victims=a.spell==='Magic Attack'&&original.family!==null?s.creatures.filter(t=>t.alive&&(t.id===original.id || (t.family===original.family&&nearestPair(footprint(t.centre,t.size),footprint(original.centre,original.size)).distance<=a.level+3&&clearProjectile(nearestPair(footprint(original.centre,original.size),footprint(t.centre,t.size)).from,nearestPair(footprint(original.centre,original.size),footprint(t.centre,t.size)).to,a.side,s.walls)))).sort((a,b)=>a.id<b.id?-1:1):[original];
 const totals:{targetId:string;amount:number}[]=[];
 for(const victim of victims){
  const source={...c,centre:origin.centre,size:origin.size,height:origin.height};
  const modifiers=hitModifiers(s,source,victim,{id:'spell',name:a.spell,mode:projectile?'projectile':'direct',range:spellRange(a),minRange:0,radius:0,shots:[]});
  if(active(victim)&&!roll(s,hitChance(c.intelligence,a.spell==='Magic Attack'?victim.intelligence:victim.dex),...modifiers)){emit(s,events,{type:'SpellMissed',creatureId:c.id,targetId:victim.id});continue;}
  const critical=roll(s,5),type=a.spell==='Fire Bolt'?'fire':'magic';
  const amount=applyDamage(s,victim,[{type,amount:a.level+(a.spell==='Magic Attack'?1:2)}],events,{critical});
  totals.push({targetId:victim.id,amount});
  if(a.spell==='Fire Bolt'&&amount>0&&victim.flammable)addCondition(s,victim,'Burning',c.id,a.level,2,'con');
 }
 cleanupDeaths(s,events);concentration(s,totals,events);
}
export function completeCast(s:GameState,castId:string,events:Event[]):void {
 invalidateCasts(s,events);const cast=s.casts.find(c=>c.id===castId);if(!cast)return;
 if(cast.dueTurn!==s.turn||cast.duePhase!==s.phase)throw new Error('CAST_NOT_DUE');
 const c=s.creatures.find(c=>c.id===cast.casterId)!,origin=s.creatures.find(c=>c.id===cast.originId)!,a=cast.action;
 s.casts=s.casts.filter(c=>c.id!==castId);occupy(s,c.id,actionPhase(s));
 if(cast.startedTurn!==s.turn||cast.startedPhase!==s.phase)s.spentActions.push(c.id);
 const valid=validCompletion(s,c,origin,a);
 const success=valid&&(a.spell==='Disbelief'||castingRoll(s,successChance(a,s.balanceUnits)));
 s.balanceUnits+=alignment(a.spell)*a.level*(success?2:1);
 emit(s,events,{type:success?'CastSucceeded':'CastFailed',creatureId:c.id,action:a.spell});
 if(!success)return;
 if(isSummon(a)){
  const creature=createCreature(allocateId(s,'summon'),a.variant==='bound'?cast.controller:null,a.ground!,{...summonProfile(a.spell,a.level)!,readyTurn:s.turn+1,bindingLevel:a.variant==='bound'?a.level:null,createdSequence:s.nextEntityId});
  s.creatures.push(creature);emit(s,events,{type:'CreatureSummoned',creatureId:creature.id});
 }else if(['Magic Bolt','Fire Bolt','Magic Attack'].includes(a.spell))spellDamage(s,c,origin,a,events);
 else if(a.spell==='Healing Bolt')heal(s,s.creatures.find(t=>t.id===a.targetId)!,a.level+3,events);
 else if(a.spell==='Teleport'){const from={...c.centre};c.centre={...a.ground!};if(!s.moved.includes(c.id))s.moved.push(c.id);emit(s,events,{type:'CreatureTeleported',creatureId:c.id,from,to:c.centre});}
 else if(a.spell==='Bind'||a.spell==='Release'){
  const target=s.creatures.find(t=>t.id===a.targetId)!;
  if(roll(s,effectChance(a.level,target.intelligence))){
   const previousController=target.controller;
   target.controller=a.spell==='Bind'?cast.controller:null;target.bindingLevel=a.spell==='Bind'?a.level:null;
   // Previous owner's submitted actions and reactions cannot transfer with control.
   if(previousController!==target.controller){
   s.orders=s.orders.map(o=>o.creatureId===target.id?{...o,path:[],early:null,late:null}:o);
   s.guards=s.guards.filter(g=>g.creatureId!==target.id);s.reactions=s.reactions.filter(r=>r.attackerId!==target.id);s.reservations=s.reservations.filter(r=>r.creatureId!==target.id);
   }
   emit(s,events,{type:'BindingChanged',creatureId:target.id});invalidateCasts(s,events);
  }else emit(s,events,{type:'SpellResisted',creatureId:c.id,targetId:target.id});
 }
 // Disbelief on real creatures intentionally has no effect. Illusion creation/removal is Stage 6.
}
export function forceMove(s:GameState,c:Creature,to:Creature['centre'],events:Event[]):void {
 if(!placement(arenaOf(s),c,to).legal)throw new Error('INVALID_FORCED_DESTINATION');
 const from={...c.centre};c.centre={...to};emit(s,events,{type:'CreatureForcedMoved',creatureId:c.id,from,to});invalidateCasts(s,events);
}
