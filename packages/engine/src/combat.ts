import {hasRangedCover} from './ground-traits.js';
import {validatePowerAction,beginPower} from './powers.js';
import { attackTraitModifiers } from './attack-traits.js';
import { structureReach,structureCells,strikeStructure,damageAreaWalls,damageStructure } from './walls.js';
import { escapeWeed,damageWeed } from './tangleweed.js';
import { sight,darkRay,visibleTo } from './visibility.js';
import { isLethal } from './illusions.js';
import { concentration,forceMove } from './casting.js';
import { validAttackTargets } from '../../domain/src/combat.js';
import type { Creature, GameState, Order } from '../../domain/src/state.js';
import type { AttackAction, AttackDefinition } from '../../domain/src/combat.js';
import { footprint, nearestPair, disk, equal, oppositeSectors, inside, add, DIRECTIONS, sector } from '../../geometry/src/hex.js';
import { stepLegality, affectedCreatures, traceProjectile, tracePenetratingProjectile } from '../../geometry/src/occupancy.js';
import { clearSight, clearProjectile } from '../../geometry/src/walls.js';
import { arenaOf } from './orders.js';
import { active, has } from './status.js';
import { addCondition, applyDamage, heal, effectChance, escapeChance, hitChance, roll } from './damage.js';
import { cleanupDeaths } from './lifecycle.js';
import { emit, type Event } from './events.js';
import { buildQueue } from './queue.js';

type CombatAction = Exclude<Order['early'],string|null|{type:'Cast'}>;
const pair=(a:Creature,b:Creature)=>nearestPair(footprint(a.centre,a.size),footprint(b.centre,b.size));
const enemies=(a:Creature,b:Creature)=>a.id!==b.id && (a.controller===null || a.controller!==b.controller);
const melee=(attack:AttackDefinition)=>attack.mode==='melee'||attack.mode==='swarm'||attack.mode==='cleave';
export function validateCombatAction(s:GameState,c:Creature,a:CombatAction):void {
 if(a.type==='Roar'||a.type==='Frighten'||a.type==='Gaze'||a.type==='Spores'||a.type==='Wail'||a.type==='RootNetwork'){validatePowerAction(s,c,a);return;}
 if(c.kind==='illusion'&&['Treat','Wake','Extinguish'].includes(a.type))throw new Error('ILLUSION_CANNOT_MANIPULATE');
 const targetIds='targetIds' in a?a.targetIds:('targetId' in a&&a.targetId?[a.targetId]:[]);
 if(targetIds.some(id=>{const t=s.creatures.find(c=>c.id===id);return t&&!visibleTo(s,t,c.controller!);}))throw new Error('UNKNOWN_TARGET');
 if(a.type==='Reload'){
  if(!c.reload)throw new Error('NO_RELOAD');
  if(c.reload.loaded)throw new Error('ALREADY_LOADED');
  if(c.reload.lastFiredTurn===s.turn)throw new Error('CANNOT_RELOAD_FIRING_TURN');
  return;
 }
 if(a.type==='MarkQuarry'){
  if(!c.canMarkQuarry)throw new Error('NO_MARKED_QUARRY');
  if(a.targetId===c.id||!s.creatures.some(t=>t.id===a.targetId&&t.alive))throw new Error('INVALID_QUARRY_TARGET');
  return;
 }
 if(a.type==='Attack' || a.type==='Guard'){
  if(c.reload&&(!c.reload.loaded||c.reload.lastReloadTurn===s.turn))throw new Error('RELOAD_REQUIRED');
  const attack=c.attacks.find(x=>x.id===a.attackId); if(!attack)throw new Error('UNKNOWN_ATTACK');
  if(a.type==='Guard'){
   if(a.area.some(h=>!inside(h,s.board)))throw new Error('INVALID_GUARD_AREA');
   if(a.targetId!==null&&!s.creatures.some(x=>x.id===a.targetId))throw new Error('UNKNOWN_TARGET');
  }else{
   if(!validAttackTargets(attack,a))throw new Error('INVALID_ATTACK_TARGETS');
   if(a.structure&&!structureCells(s,a.structure).length)throw new Error('UNKNOWN_STRUCTURE');
   if(a.ground&&!inside(a.ground,s.board))throw new Error('INVALID_GROUND_TARGET');
   if(a.targetIds.some(id=>id===c.id||!s.creatures.some(x=>x.id===id)))throw new Error('UNKNOWN_TARGET');
  }
 }else{
  if(!s.creatures.some(x=>x.id===a.targetId) && !(a.type==='Extinguish'&&s.walls.some(w=>w.id===a.targetId)))throw new Error('UNKNOWN_TARGET');
  if(a.type==='Grapple' && c.grappleLimbs===0)throw new Error('NO_GRAPPLING_LIMB');
 }
}
function inReach(s:GameState,a:Creature,b:Creature,attack:AttackDefinition,side:'left'|'right'='left'):boolean {
 const p=pair(a,b);
 return b.alive && p.distance<=attack.range && p.distance>=attack.minRange &&
  (!melee(attack)||a.height===b.height) && (sight(s,a,p.from,p.to,side)||(p.distance<=1&&clearSight(p.from,p.to,side,s.walls))) &&
  (!melee(attack)||clearProjectile(p.from,p.to,side,s.walls));
}
export function creatureAttackModifiers(s:GameState,a:Creature,b:Creature,source:'action'|'guard') {
 const result=attackTraitModifiers(a.attackTraits,{
  plannedMovement:!!s.orders.find(o=>o.creatureId===a.id)?.path.length,
  movedThisTurn:s.moved.includes(a.id),phase:s.phase==='movement'?'movement':s.phase==='late'?'late':'early',source,
  distance:pair(a,b).distance,targetActedThisPhase:s.actedThisPhase.includes(b.id),
  activeAdjacentRallySources:s.creatures.filter(c=>c.id!==a.id&&a.controller!==null&&c.controller===a.controller&&c.attackTraits.rallySource&&active(c)&&c.height===a.height&&pair(c,a).distance===1).length,
 });
 return {...result,skill:result.skill+(a.canMarkQuarry&&a.quarryTargetId===b.id?2:0)};
}
/** Only the resolved voluntary approach to this target can empower a bite. */
export function pounceDamage(a:Creature,b:Creature,attackId:string,source:'action'|'guard'):number {
 if(!a.pounce||source!=='action'||attackId!==a.pounce.attackId||!a.pounceTrail)return 0;
 const trail=a.pounceTrail;
 let steps=0;
 for(let i=trail.length-1;i>0;i--){
  const before=nearestPair(footprint(trail[i-1]!,a.size),footprint(b.centre,b.size)).distance;
  const after=nearestPair(footprint(trail[i]!,a.size),footprint(b.centre,b.size)).distance;
  if(after>=before)break;
  steps++;
 }
 return steps>=a.pounce.steps?a.pounce.damage:0;
}
export function hitModifiers(s:GameState,a:Creature,b:Creature,attack:AttackDefinition,side:'left'|'right'='left'):[boolean,boolean]{
 const allies=s.creatures.filter(x=>x.id!==a.id && a.controller!==null && x.controller===a.controller && active(x) && x.height===b.height && pair(x,b).distance===1);
 const advantage=allies.some(x=>a.packTactics||(pair(a,b).distance===1&&oppositeSectors(b.centre,a.centre,x.centre)));
 const threatened=!melee(attack) && s.creatures.some(x=>enemies(a,x)&&active(x)&&x.height===a.height&&pair(a,x).distance===1);
 const defended=s.defending.some(d=>d.creatureId===b.id && (s.phase==='movement' ? false : d.phases.includes(s.phase as 'early'|'late')));
 const p=pair(a,b),obscured=!a.ignoresDarknessDisadvantage&&(a.darknessSightRange===0||p.distance>a.darknessSightRange)&&darkRay(s,p.from,p.to,side);
 return [advantage,defended||threatened||has(a,'Fear')||obscured||hasRangedCover(s,a,b,attack)];
}
/** Guard follows the triggering creature until commitment, then locks an area
 * impact to its nearest occupied hex. The pending action serialises that point. */
export function guardReactionAction(s:GameState,a:Creature,targetId:string,attackId:string):AttackAction|null {
 const attack=a.attacks.find(x=>x.id===attackId),target=s.creatures.find(c=>c.id===targetId);
 if(!attack||!target||!active(a)||a.controller===null||!inReach(s,a,target,attack))return null;
 return {type:'Attack',attackId,targetIds:attack.mode==='area'?[]:[targetId],ground:attack.mode==='area'?pair(a,target).to:null,side:'left'};
}
export function beginAttack(s:GameState,c:Creature,action:AttackAction,source:'action'|'guard',events:Event[]=[]):void {
 if(source==='action'&&!s.actedThisPhase.includes(c.id))s.actedThisPhase.push(c.id);
 s.pendingAttack={actionId:`attack-${s.nextEntityId++}`,attackerId:c.id,action,source,shotIndex:0,victimIndex:0,areaVictims:null,damageByTarget:[]};
 if(c.reload){
  if(!c.reload.loaded||c.reload.lastReloadTurn===s.turn||c.reload.lastFiredTurn===s.turn){s.pendingAttack.shotIndex=c.attacks.find(a=>a.id===action.attackId)!.shots.length;emit(s,events,{type:'AttackInvalid',creatureId:c.id});return;}
  c.reload.loaded=false;c.reload.lastFiredTurn=s.turn;emit(s,events,{type:'WeaponDischarged',creatureId:c.id});
 }

}
/** One hit/victim per atomic step; aggregate damage survives snapshots for concentration. */
export function stepAttack(s:GameState,events:Event[]):boolean {
 const p=s.pendingAttack!;const a=s.creatures.find(c=>c.id===p.attackerId)!;
 const attack=a.attacks.find(x=>x.id===p.action.attackId)!;
 const committedArea=(attack.mode==='area'||attack.penetration===2)&&p.areaVictims!==null&&a.kind!=='illusion';
 if((!committedArea&&(!active(a)||a.controller===null))||p.shotIndex>=attack.shots.length){
  emit(s,events,{type:'AttackFinished',creatureId:a.id,damageByTarget:p.damageByTarget});concentration(s,p.damageByTarget,events);s.pendingAttack=null;return true;
 }
 const strike=attack.shots[p.shotIndex]!;
 let target:Creature|undefined;
 let penetrationSecond=false;
 if(attack.penetration===2){
  if(p.areaVictims===null){
   if(p.action.structure&&!structureCells(s,p.action.structure).length){p.shotIndex++;emit(s,events,{type:'AttackInvalid',creatureId:a.id});return false;}
   const selected=s.creatures.find(c=>c.id===p.action.targetIds[0]);
   const aim=p.action.structure?nearestPair(footprint(a.centre,a.size),structureCells(s,p.action.structure)).to:p.action.ground??(selected?pair(a,selected).to:null);
   const valid=p.action.structure?structureReach(s,a,p.action.structure,attack.range,attack.minRange,p.action.side):p.action.ground?(()=>{const o=nearestPair(footprint(a.centre,a.size),[p.action.ground!]);return o.distance>=attack.minRange&&o.distance<=attack.range&&sight(s,a,o.from,o.to,p.action.side);})():!!selected&&inReach(s,a,selected,attack,p.action.side);
   if(!aim||!valid){p.shotIndex++;emit(s,events,{type:'AttackInvalid',creatureId:a.id});return false;}
   const trace=tracePenetratingProjectile(arenaOf(s),a,aim,selected?.height??'ground',p.action.side,attack.range,selected?.id);
   p.areaVictims=trace.hits;
   if(!trace.hits.length){
    if(trace.blockedBy)damageStructure(s,{kind:'wall',id:trace.blockedBy},strike.components,events,a.id);
    else if(p.action.structure)damageStructure(s,p.action.structure,strike.components,events,a.id);
    else if(p.action.ground)damageWeed(s,[p.action.ground],strike.components,events,a.id);
   }
  }
  if(p.victimIndex>=p.areaVictims.length){p.shotIndex++;return false;}
  penetrationSecond=p.victimIndex===1;const victimId=p.areaVictims[p.victimIndex++];target=s.creatures.find(c=>c.id===victimId);
 }else if(p.action.structure){
  p.shotIndex++;
  const result=strikeStructure(s,a,p.action.structure,attack,p.action.side,strike.components,events,a.id);
  if(result.kind==='invalid'){emit(s,events,{type:'AttackInvalid',creatureId:a.id});return false;}
  if(result.kind==='terrain')return false;
  target=s.creatures.find(c=>c.id===result.id);
 }else if(attack.mode==='cleave'||(attack.mode==='swarm'&&p.source==='action')){
  if(p.areaVictims===null)p.areaVictims=s.creatures.filter(c=>c.id!==a.id&&(attack.targetTeams==='all'||enemies(a,c))&&inReach(s,a,c,attack,p.action.side)).map(c=>c.id).sort();
  if(p.victimIndex>=p.areaVictims.length){p.shotIndex++;p.victimIndex=0;p.areaVictims=null;return false;}
  const id=p.areaVictims[p.victimIndex++];target=s.creatures.find(c=>c.id===id);
  if(target&&((attack.targetTeams!=='all'&&!enemies(a,target))||!inReach(s,a,target,attack,p.action.side)))target=undefined;
 }else if(attack.mode==='area'){
  const ground=p.action.ground!;const origin=nearestPair(footprint(a.centre,a.size),[ground]);
  if(origin.distance<attack.minRange||origin.distance>attack.range||!clearProjectile(origin.from,ground,p.action.side,s.walls,true)){
   emit(s,events,{type:'AttackInvalid',creatureId:a.id});p.shotIndex++;p.areaVictims=null;return false;
  }
  if(p.areaVictims===null){p.areaVictims=affectedCreatures(disk(ground,attack.radius),s.creatures.filter(c=>c.alive));const structureComponents=strike.components.map(c=>({...c,amount:c.amount*(attack.structureMultiplier??1)}));damageWeed(s,disk(ground,attack.radius),structureComponents,events,a.id);damageAreaWalls(s,disk(ground,attack.radius),structureComponents,events,a.id);}
  if(p.victimIndex>=p.areaVictims.length){p.shotIndex++;p.victimIndex=0;p.areaVictims=null;return false;}
  const targetId=p.areaVictims[p.victimIndex++];
  target=s.creatures.find(c=>c.id===targetId);
 }else if(p.action.ground){
  const ground=p.action.ground,origin=nearestPair(footprint(a.centre,a.size),[ground]);p.shotIndex++;
  if(origin.distance>=attack.minRange && origin.distance<=attack.range && sight(s,a,origin.from,ground,p.action.side)){
   const trace=traceProjectile(arenaOf(s),a,ground,'ground',p.action.side);
   target=s.creatures.find(c=>c.id===trace.hit);
   if(trace.blockedBy){damageStructure(s,{kind:'wall',id:trace.blockedBy},strike.components,events,a.id);return false;}
   if(!target&&!trace.blockedBy&&damageWeed(s,[ground],strike.components,events,a.id))return false;
  }
 }else{
  target=s.creatures.find(c=>c.id===(p.action.targetIds[p.shotIndex]??p.action.targetIds[0]));p.shotIndex++;
  if(target&&!inReach(s,a,target,attack,p.action.side))target=undefined;
  if(target&&attack.mode==='projectile'){
   const trace=traceProjectile(arenaOf(s),a,pair(a,target).to,target.height,p.action.side,target.id);
   target=s.creatures.find(c=>c.id===trace.hit);
   if(trace.blockedBy){damageStructure(s,{kind:'wall',id:trace.blockedBy},strike.components,events,a.id);return false;}
  }
 }
 if(!target?.alive){emit(s,events,{type:'AttackInvalid',creatureId:a.id});return false;}
 const [baseAdvantage,baseDisadvantage]=hitModifiers(s,a,target,attack,p.action.side);
 const modifiers=creatureAttackModifiers(s,a,target,p.source);
 const advantage=baseAdvantage||modifiers.advantage,disadvantage=baseDisadvantage||modifiers.disadvantage;
 const area=attack.mode==='area';
 const hit=area || !active(target) || roll(s,hitChance(strike.skill+modifiers.skill,target.dex),advantage,disadvantage);
 if(!hit){emit(s,events,{type:'AttackMissed',creatureId:a.id,targetId:target.id});return false;}
 const critical=!area&&roll(s,strike.crit);
 const half=area&&!roll(s,effectChance(strike.skill,target.dex));
 const pounce=pounceDamage(a,target,attack.id,p.source);
 const damage=applyDamage(s,target,strike.components.map((component,index)=>({...component,amount:(penetrationSecond?Math.ceil(component.amount/2):component.amount)+(index===0?modifiers.damage+pounce:0)})),events,{area:area||attack.areaDamage===true,critical,half,sourceId:a.id,actionId:p.actionId});
 const previous=p.damageByTarget.find(d=>d.targetId===target!.id);
 if(previous)previous.amount+=damage;else p.damageByTarget.push({targetId:target.id,amount:damage});
 emit(s,events,{type:'AttackHit',creatureId:a.id,targetId:target.id,critical});
 if(damage>0){
  if(a.lifeDrain>0&&!target.undead&&!target.construct&&target.kind!=='illusion')heal(s,a,a.lifeDrain,events,'regeneration',a.id);
  if(target.bristles>0&&melee(attack)){
   const reflected=applyDamage(s,a,[{type:'physical',amount:target.bristles}],events,{sourceId:target.id,actionId:p.actionId});
   const prior=p.damageByTarget.find(d=>d.targetId===a.id);
   if(prior)prior.amount+=reflected;else if(reflected)p.damageByTarget.push({targetId:a.id,amount:reflected});
  }
 }

 for(const effect of strike.secondary){
  if(effect.requiresDamage&&!damage)continue;
  const resistance=effect.resistance==='con'?target.con:effect.resistance==='physical'?2*target.size:target.intelligence;
  if(roll(s,effectChance(effect.potency,resistance)))addCondition(s,target,effect.kind,a.id,effect.potency,effect.duration,effect.resistance);
 }
 if(damage>0&&a.shove?.attackId===attack.id&&target.size<a.size&&!isLethal(target)){
  const to=add(target.centre,DIRECTIONS[equal(a.centre,target.centre)?0:sector(a.centre,target.centre)]!);
  if(stepLegality(arenaOf(s),target,target.centre,to,false).legal)forceMove(s,target,to,events);
  else emit(s,events,{type:'ShoveBlocked',creatureId:a.id,targetId:target.id});
 }
 cleanupDeaths(s,events);return false;
}
export function resolveCombatAction(s:GameState,c:Creature,action:Order['early'],events:Event[]):void {
 if(action==='Escape'){
  escapeWeed(s,c);
  s.holds=s.holds.filter(h=>h.targetId!==c.id||!roll(s,escapeChance(c.size,s.creatures.find(x=>x.id===h.grapplerId)!.size)));
  c.conditions=c.conditions.filter(e=>e.kind!=='Restrained'||roll(s,effectChance(e.potency,e.resistance==='physical'?2*c.size:c.intelligence)));
  emit(s,events,{type:'EscapeAttempted',creatureId:c.id});return;
 }
 if(!action||typeof action==='string'||action.type==='Cast')return;
 if(action.type==='Roar'||action.type==='Frighten'||action.type==='Gaze'||action.type==='Spores'||action.type==='Wail'||action.type==='RootNetwork'){beginPower(s,c,action,events);return;}
 if(c.kind==='illusion'&&['Treat','Wake','Extinguish'].includes(action.type))return;
 if(action.type==='Reload'){
  if(!c.reload||c.reload.loaded||c.reload.lastFiredTurn===s.turn){emit(s,events,{type:'ActionInvalid',creatureId:c.id});return;}
  c.reload.loaded=true;c.reload.lastReloadTurn=s.turn;emit(s,events,{type:'WeaponReloaded',creatureId:c.id});return;
 }
 if(action.type==='MarkQuarry'){
  const target=s.creatures.find(t=>t.id===action.targetId&&t.alive);
  if(!c.canMarkQuarry||!target||target.id===c.id||!c.controller||!visibleTo(s,target,c.controller)){emit(s,events,{type:'ActionInvalid',creatureId:c.id});return;}
  c.quarryTargetId=target.id;emit(s,events,{type:'QuarryMarked',creatureId:c.id,targetId:target.id});return;
 }
 if(action.type==='Attack'){beginAttack(s,c,action,'action',events);return;}
 if(action.type==='Guard'){
  s.guards=s.guards.filter(g=>g.creatureId!==c.id);
  s.guards.push({creatureId:c.id,attackId:action.attackId,targetId:action.targetId,area:action.area,attacked:[],spent:false});return;
 }
 const wall=action.type==='Extinguish'?s.walls.find(w=>w.id===action.targetId):undefined;
 if(wall){if(nearestPair(footprint(c.centre,c.size),[wall.edge.a,wall.edge.b]).distance<=1)wall.burning=null;return;}
 const target=s.creatures.find(x=>x.id===action.targetId);
 const reach=action.type==='Grapple'?Math.max(1,...c.attacks.filter(a=>a.mode==='melee').map(a=>a.range)):1;
 if(!target?.alive || pair(c,target).distance>reach || c.height!==target.height || !clearProjectile(pair(c,target).from,pair(c,target).to,'left',s.walls)){emit(s,events,{type:'ActionInvalid',creatureId:c.id});return;}
 if(action.type==='Grapple'){
  if(c.kind==='illusion'&&target.intelligence===0)return;
  const limb=Array.from({length:c.grappleLimbs},(_,i)=>i).find(i=>!s.holds.some(h=>h.grapplerId===c.id&&h.limb===i));
  if(limb===undefined||target.id===c.id||target.size>c.size||(target.size===c.size&&!c.grappleEqualSize))return;
  const skill=c.attacks.find(a=>a.mode==='melee')?.shots[0]?.skill??c.dex;
  const modifiers=hitModifiers(s,c,target,{id:'grapple',name:'Grapple',mode:'melee',range:1,minRange:0,radius:0,shots:[]});
  if((!active(target)||roll(s,hitChance(skill,target.dex),...modifiers))&&roll(s,effectChance(2*c.size,2*target.size)))s.holds.push({grapplerId:c.id,targetId:target.id,limb});
 }else if(action.type==='Extinguish'||target.controller===c.controller){
  const kind=action.type==='Treat'?'Bleeding':action.type==='Wake'?'Unconscious':'Burning';
  target.conditions=target.conditions.filter(e=>e.kind!==kind);
 }
}
/** Only voluntary steps call this; teleport, summoning and forced movement do not. */
export function enqueueGuards(s:GameState,mover:Creature,from:Creature['centre']):void {
 const candidates=s.guards.filter(g=>{
  const c=s.creatures.find(c=>c.id===g.creatureId)!;const attack=c.attacks.find(a=>a.id===g.attackId)!;
  return !g.spent&&!g.attacked.includes(mover.id)&&active(c)&&(!c.reload||(c.reload.loaded&&c.reload.lastReloadTurn!==s.turn))&&enemies(c,mover)&&(!g.targetId||g.targetId===mover.id)&&
   (!g.area.length||footprint(mover.centre,mover.size).some(h=>g.area.some(a=>equal(a,h))))&&inReach(s,c,mover,attack)&&!inReach(s,c,{...mover,centre:from},attack);
 });
 const queue=buildQueue(candidates.map(g=>{const c=s.creatures.find(c=>c.id===g.creatureId)!;const wizard=s.creatures.find(w=>w.kind==='wizard'&&w.controller===c.controller);return {creatureId:c.id,dex:c.dex,move:c.move,size:c.size,slowed:c.slowed||has(c,'Slowed'),quick:false,wizardDistance:wizard?pair(c,wizard).distance:0};}),s.random.resolution,false);
 s.random.resolution=queue.randomState;
 for(const entry of queue.entries){const g=candidates.find(g=>g.creatureId===entry.creatureId)!;const c=s.creatures.find(c=>c.id===g.creatureId)!;
  g.attacked.push(mover.id);if(!melee(c.attacks.find(a=>a.id===g.attackId)!))g.spent=true;
  s.reactions.push({attackerId:g.creatureId,targetId:mover.id,attackId:g.attackId});
 }
}
