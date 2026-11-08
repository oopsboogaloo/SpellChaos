import {riderOf,moveRider,forcedBody,carryingLocked} from './mounts.js';
import {bodyFootprint} from './bodies.js';
import {pruneDisplacedHolds,pruneRootNetworks} from './ground-traits.js';
import { legalCastWall,wallOriginValid,createWall,structureCells,strikeStructure,damageStructure,crossWallHazards } from './walls.js';
import { legalWeedLayout,createWeed,contactWeed,damageWeed } from './tangleweed.js';
import { sight,darkRay,visibleTo,clearNearestPair } from './visibility.js';
import { knowsIllusion } from './illusions.js';
import { canReanimate, reanimate } from './reanimation.js';
import { randomBelow } from '../../domain/src/random.js';
import type { Creature,GameState,Order } from '../../domain/src/state.js';
import type { Cast,CastAction,CastingTime } from '../../domain/src/spells.js';
import { mvpSpellFamilies,alignment,castingTime,completionAt,implementedSpells,manaCost,spellRange,successChance } from '../../content/src/spells.js';
import { summonProfile } from '../../content/src/summons.js';
import { footprint,nearestPair,equal,inside,overlap,distance } from '../../geometry/src/hex.js';
import { placement,traceProjectile,stepLegality } from '../../geometry/src/occupancy.js';
import { clearProjectile } from '../../geometry/src/walls.js';
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
function legalSummonPlacement(s:GameState,body:Creature):boolean {
 // Summoning requires empty placement even though a swarm may overlap later in movement.
 const cells=bodyFootprint(s,body);
 return placement(arenaOf(s),body,body.centre).legal&&!s.creatures.some(c=>c.alive&&overlap(cells,bodyFootprint(s,c)));
}
function targets(s:GameState,a:CastAction) {
 if(a.structure)return structureCells(s,a.structure);
 if(a.ground)return [a.ground];
 const target=a.spell==='Reanimate'?s.corpses.find(c=>c.id===a.targetId):s.creatures.find(c=>c.id===a.targetId);
 return target?(a.spell==='Reanimate'?footprint(target.centre,target.size):bodyFootprint(s,target as Creature)):[];
}
function legalTarget(s:GameState,c:Creature,a:CastAction):boolean {
 if(a.spell==='Wall')return legalCastWall(s,a);
 if(a.structure)return structureCells(s,a.structure).length>0;
 if(a.spell==='Reanimate')return a.targetId!==null&&canReanimate(s,a.targetId,a.level,c.controller);
 if(a.spell==='Tangleweed')return legalWeedLayout(s,a);
 if(a.ground)return inside(a.ground,s.board);
 const target=s.creatures.find(t=>t.id===a.targetId);if(!target?.alive)return false;
 if(a.spell==='Healing Bolt')return !target.undead;
 if(a.spell==='Bind')return target.kind!=='wizard'&&target.summonLevel<=a.level&&(target.bindingLevel===null||target.bindingLevel<a.level);
 if(a.spell==='Release')return target.kind!=='wizard'&&target.bindingLevel!==null&&target.bindingLevel<=a.level;
 return true;
}
function weedOriginValid(s:GameState,origin:Creature,a:CastAction):boolean {
 return (a.hexes??[]).every(h=>{const p=nearestPair(bodyFootprint(s,origin),[h]);return p.distance<=spellRange(a)&&sight(s,origin,p.from,p.to,a.side);});
}
export function selectOrigin(s:GameState,c:Creature,a:CastAction):Creature|null {
 if(!legalTarget(s,c,a))return null;
 const origins=s.creatures.filter(o=>o.id===c.id || (c.kind==='wizard'&&o.familiar&&o.kind!=='illusion'&&o.controller===c.controller&&o.bindingLevel!==null&&active(o)));
 const cells=targets(s,a);
 return origins.map(origin=>({origin,pair:nearestPair(bodyFootprint(s,origin),cells)}))
  .filter(x=>x.pair.distance<=spellRange(a)&&sight(s,x.origin,x.pair.from,x.pair.to,a.side)&&(a.spell!=='Tangleweed'||weedOriginValid(s,x.origin,a))&&(a.spell!=='Wall'||wallOriginValid(s,x.origin,a)))
  .sort((a,b)=>a.pair.distance-b.pair.distance || Number(b.origin.id===c.id)-Number(a.origin.id===c.id) || a.origin.createdSequence-b.origin.createdSequence || (a.origin.id<b.origin.id?-1:a.origin.id>b.origin.id?1:0))[0]?.origin??null;
}
export function validateCast(s:GameState,c:Creature,a:CastAction):void {
 if(c.kind==='illusion'||!c.spellbook.includes(a.spell)||a.level>c.spellLevelCap)throw new Error('SPELL_NOT_KNOWN');
 if(!mvpSpellFamilies.includes(a.spell)||!implementedSpells.includes(a.spell))throw new Error('CONTENT_NOT_AVAILABLE');
 if(!isSummon(a)&&a.variant!=='bound')throw new Error('INVALID_SPELL_VARIANT');
 const groundOnly=isSummon(a)||['Teleport','Darkness','Tangleweed','Wall'].includes(a.spell),projectile=['Magic Bolt','Fire Bolt'].includes(a.spell);
 if(groundOnly?(a.ground===null||a.targetId!==null):projectile?(Number(a.ground!==null)+Number(a.targetId!==null)+Number(a.structure!==undefined)!==1):(a.targetId===null||a.ground!==null))throw new Error('INVALID_SPELL_TARGET');
 if((a.targetId!==null&&!(a.spell==='Reanimate'?s.corpses.some(t=>t.id===a.targetId):s.creatures.some(t=>t.id===a.targetId)))||(a.ground&&!inside(a.ground,s.board)))throw new Error('INVALID_SPELL_TARGET');
 if(!legalTarget(s,c,a))throw new Error('INVALID_SPELL_TARGET');
 if(a.targetId&&a.spell!=='Reanimate'&&!visibleTo(s,s.creatures.find(t=>t.id===a.targetId)!,c.controller!))throw new Error('INVALID_SPELL_TARGET');
 if(a.spell==='Teleport' && (c.mountId!==undefined||carryingLocked(s,c)||restrained(s,c)||castingLocksMovement(s,c)||!fearAllowsStep(s,c,a.ground!)||!placement(arenaOf(s),c,a.ground!).legal))throw new Error('INVALID_TELEPORT_DESTINATION');
 if(a.spell==='Healing Bolt'&&knowsIllusion(s.creatures.find(t=>t.id===a.targetId)!,c.controller!))throw new Error('INVALID_SPELL_TARGET');
 if(isSummon(a)){
  const profile=summonProfile(a.spell,a.level);if(!profile)throw new Error('CONTENT_NOT_AVAILABLE');
  const body=createCreature('$preview',c.controller,a.ground!,profile);
  if(!legalSummonPlacement(s,body))throw new Error('INVALID_SUMMON_PLACEMENT');
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
 s.casts=s.casts.filter(c=>c.id!==castId);s.balanceUnits+=alignment(cast.action.spell,cast.action.level)*cast.action.level;
 emit(s,events,{type:'CastInterrupted',creatureId:cast.casterId,action:reason});
}
export function invalidateCasts(s:GameState,events:Event[]):void {
 for(const cast of [...s.casts]){
  const caster=s.creatures.find(c=>c.id===cast.casterId)!,origin=s.creatures.find(c=>c.id===cast.originId)!;
  if(caster.kind==='illusion'||!active(caster)||!active(origin)||caster.controller!==cast.controller||origin.controller!==cast.controller||
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
 if(c.kind==='illusion'){emit(s,events,{type:'CastInvalid',creatureId:c.id});return;}
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
 if(!legalTarget(s,c,a)||(a.spell==='Tangleweed'&&!weedOriginValid(s,origin,a))||(a.spell==='Wall'&&!wallOriginValid(s,origin,a)))return false;
 const cells=targets(s,a);
 if(nearestPair(bodyFootprint(s,origin),cells).distance>spellRange(a)||!clearNearestPair(bodyFootprint(s,origin),cells,(from,to,side)=>sight(s,origin,from,to,side),[a.side]))return false;
 if(isSummon(a)){
  const profile=summonProfile(a.spell,a.level);return !!profile&&legalSummonPlacement(s,createCreature('$preview',c.controller,a.ground!,profile));
 }
 if(a.spell==='Teleport')return c.mountId===undefined&&!carryingLocked(s,c)&&!restrained(s,c)&&!castingLocksMovement(s,c)&&fearAllowsStep(s,c,a.ground!)&&placement(arenaOf(s),c,a.ground!).legal;
 return true;
}
function spellDamage(s:GameState,c:Creature,origin:Creature,a:CastAction,events:Event[],actionId:string):void {
 let target=s.creatures.find(t=>t.id===a.targetId);const projectile=a.spell!=='Magic Attack';
 if(a.structure){
  const result=strikeStructure(s,origin,a.structure,{mode:'projectile',range:spellRange(a),minRange:0},a.side,[{type:a.spell==='Fire Bolt'?'fire':'magic',amount:a.level+2}],events,c.id,a.spell==='Fire Bolt');
  if(result.kind!=='creature')return;
  target=s.creatures.find(t=>t.id===result.id);
 }else if(projectile){
  const aim=a.ground??(clearNearestPair(bodyFootprint(s,origin),bodyFootprint(s,target!),(from,to,side)=>sight(s,origin,from,to,side),[a.side])??nearestPair(bodyFootprint(s,origin),bodyFootprint(s,target!))).to;
  const trace=traceProjectile(arenaOf(s),origin,aim,target?.height??'ground',a.side,target?.id);
  target=s.creatures.find(t=>t.id===trace.hit);
  if(trace.blockedBy)damageStructure(s,{kind:'wall',id:trace.blockedBy},[{type:a.spell==='Fire Bolt'?'fire':'magic',amount:a.level+2}],events,c.id,a.spell==='Fire Bolt');
  if(!target&&!trace.blockedBy&&a.ground)damageWeed(s,[a.ground],[{type:a.spell==='Fire Bolt'?'fire':'magic',amount:a.level+2}],events,c.id);
 }
 if(!target?.alive)return;
 const original=target;
 const victims=a.spell==='Magic Attack'&&original.family!==null?s.creatures.filter(t=>{
  if(!t.alive)return false;
  if(t.id===original.id)return true;
  if(t.family!==original.family)return false;
  const spread=nearestPair(bodyFootprint(s,original),bodyFootprint(s,t));
  return spread.distance<=a.level+3&&!darkRay(s,spread.from,spread.to,a.side)&&clearProjectile(spread.from,spread.to,a.side,s.walls);
 }).sort((a,b)=>a.id<b.id?-1:1):[original];
 const totals:{targetId:string;amount:number}[]=[];
 for(const victim of victims){
  const source={...c,centre:origin.centre,size:origin.size,height:origin.height,darknessSightRange:origin.darknessSightRange};
  const modifiers=hitModifiers(s,source,victim,{id:'spell',name:a.spell,mode:projectile?'projectile':'direct',range:spellRange(a),minRange:0,radius:0,shots:[]},a.side);
  if(active(victim)&&!roll(s,hitChance(c.intelligence,a.spell==='Magic Attack'?victim.intelligence:victim.dex),...modifiers)){emit(s,events,{type:'SpellMissed',creatureId:c.id,targetId:victim.id});continue;}
  const critical=roll(s,5),type=a.spell==='Fire Bolt'?'fire':'magic';
  const amount=applyDamage(s,victim,[{type,amount:a.level+(a.spell==='Magic Attack'?1:2)}],events,{critical,sourceId:c.id,actionId});
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
 const success=valid&&(a.spell==='Disbelief'||a.variant==='illusion'||castingRoll(s,successChance(a,s.balanceUnits)));
 s.balanceUnits+=alignment(a.spell,a.level)*a.level*(success?2:1);
 emit(s,events,{type:success?'CastSucceeded':'CastFailed',creatureId:c.id,action:a.spell});
 if(!success)return;
 if(isSummon(a)){
  const creature=createCreature(allocateId(s,'summon'),a.variant!=='unbound'?cast.controller:null,a.ground!,{...summonProfile(a.spell,a.level)!,...(a.variant==='illusion'?{kind:'illusion' as const,creatorId:c.id,knownIllusionBy:[cast.controller],mana:0,maxMana:0,manaRegen:0,spellbook:[],spellLevelCap:0,corpseEligible:false}:{}),readyTurn:s.turn+1,bindingLevel:a.variant!=='unbound'?a.level:null,createdSequence:s.nextEntityId});
  s.creatures.push(creature);emit(s,events,{type:'CreatureSummoned',creatureId:creature.id});contactWeed(s,creature,events);
 }else if(a.spell==='Wall'){
  createWall(s,c,a,allocateId(s,'wall'),events);
 }else if(a.spell==='Tangleweed'){
  createWeed(s,c,a,allocateId(s,'weed'),events);
 }else if(a.spell==='Darkness'){
  s.darkness.push({id:allocateId(s,'darkness'),casterId:c.id,centre:{...a.ground!},level:a.level,createdTurn:s.turn,endsTurn:s.turn+a.level});
  emit(s,events,{type:'DarknessCreated',creatureId:c.id,to:a.ground!});
 }else if(a.spell==='Reanimate'){
  const servant=reanimate(s,a.targetId!,a.level,cast.controller,allocateId(s,'reanimated'));
  emit(s,events,{type:'CreatureReanimated',creatureId:servant.id,targetId:a.targetId!});contactWeed(s,servant,events);
 }else if(['Magic Bolt','Fire Bolt','Magic Attack'].includes(a.spell))spellDamage(s,c,origin,a,events,cast.id);
 else if(a.spell==='Healing Bolt')heal(s,s.creatures.find(t=>t.id===a.targetId)!,a.level+3,events,'ordinary',c.id);
 else if(a.spell==='Teleport'){delete c.pounceTrail;delete c.diveTrail;const from={...c.centre};c.centre={...a.ground!};moveRider(s,c,events,true);pruneRootNetworks(s);if(!s.moved.includes(c.id))s.moved.push(c.id);emit(s,events,{type:'CreatureTeleported',creatureId:c.id,from,to:c.centre});contactWeed(s,c,events);const rider=riderOf(s,c);if(rider)contactWeed(s,rider,events);}
 else if(a.spell==='Bind'||a.spell==='Release'){
  const target=s.creatures.find(t=>t.id===a.targetId)!;
  if(roll(s,effectChance(a.level,target.intelligence))){
   const previousController=target.controller;
   target.controller=a.spell==='Bind'?cast.controller:null;target.bindingLevel=a.spell==='Bind'?a.level:null;
   // Previous owner's submitted actions and reactions cannot transfer with control.
   if(previousController!==target.controller){
   s.autonomous=s.autonomous.filter(id=>id!==target.id);
   s.orders=s.orders.map(o=>o.creatureId===target.id?{creatureId:o.creatureId,path:[],early:null,late:null}:o);
   s.guards=s.guards.filter(g=>g.creatureId!==target.id);s.reactions=s.reactions.filter(r=>r.attackerId!==target.id);s.reservations=s.reservations.filter(r=>r.creatureId!==target.id);
   }
   emit(s,events,{type:'BindingChanged',creatureId:target.id});cleanupDeaths(s,events);invalidateCasts(s,events);
  }else emit(s,events,{type:'SpellResisted',creatureId:c.id,targetId:target.id});
 }
 if(a.spell==='Disbelief'){
  const target=s.creatures.find(t=>t.id===a.targetId)!;
  if(target.kind==='illusion'){target.alive=false;target.hp=-target.maxHp;cleanupDeaths(s,events);}
 }
}
export function forceMove(s:GameState,c:Creature,to:Creature['centre'],events:Event[]):void {
 const body=forcedBody(s,c);
 if(!placement(arenaOf(s),body,to).legal||(distance(c.centre,to)===1&&!stepLegality(arenaOf(s),body,c.centre,to,false).legal))throw new Error('INVALID_FORCED_DESTINATION');
 if(distance(c.centre,to)>0)delete c.pounceTrail;delete c.diveTrail;
 const from={...c.centre};if(c.mountId)delete c.mountId;c.centre={...to};const carried=moveRider(s,c,events,true);
 if(distance(from,to)>0){
  if(!s.moved.includes(c.id))s.moved.push(c.id);
  pruneDisplacedHolds(s,[c.id,...(carried?[carried.id]:[])]);
 }
 emit(s,events,{type:'CreatureForcedMoved',creatureId:c.id,from,to});crossWallHazards(s,c,from,to,events);if(carried)crossWallHazards(s,carried,from,to,events);cleanupDeaths(s,events);contactWeed(s,c,events);if(carried)contactWeed(s,carried,events);invalidateCasts(s,events);
}
