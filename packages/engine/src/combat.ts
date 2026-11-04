import { structureCells,strikeStructure,damageAreaWalls,damageStructure } from './walls.js';
import { escapeWeed,damageWeed } from './tangleweed.js';
import { sight,darkRay,visibleTo } from './visibility.js';
import { concentration } from './casting.js';
import { validAttackTargets } from '../../domain/src/combat.js';
import type { Creature, GameState, Order } from '../../domain/src/state.js';
import type { AttackAction, AttackDefinition } from '../../domain/src/combat.js';
import { footprint, nearestPair, disk, equal, oppositeSectors, inside } from '../../geometry/src/hex.js';
import { affectedCreatures, traceProjectile } from '../../geometry/src/occupancy.js';
import { clearSight, clearProjectile } from '../../geometry/src/walls.js';
import { arenaOf } from './orders.js';
import { active, has } from './status.js';
import { addCondition, applyDamage, effectChance, escapeChance, hitChance, roll } from './damage.js';
import { cleanupDeaths } from './lifecycle.js';
import { emit, type Event } from './events.js';
import { buildQueue } from './queue.js';

type CombatAction = Exclude<Order['early'],string|null|{type:'Cast'}>;
const pair=(a:Creature,b:Creature)=>nearestPair(footprint(a.centre,a.size),footprint(b.centre,b.size));
const enemies=(a:Creature,b:Creature)=>a.id!==b.id && (a.controller===null || a.controller!==b.controller);
const melee=(attack:AttackDefinition)=>attack.mode==='melee'||attack.mode==='swarm';
export function validateCombatAction(s:GameState,c:Creature,a:CombatAction):void {
 if(c.kind==='illusion'&&['Treat','Wake','Extinguish'].includes(a.type))throw new Error('ILLUSION_CANNOT_MANIPULATE');
 const targetIds='targetIds' in a?a.targetIds:('targetId' in a&&a.targetId?[a.targetId]:[]);
 if(targetIds.some(id=>{const t=s.creatures.find(c=>c.id===id);return t&&!visibleTo(s,t,c.controller!);}))throw new Error('UNKNOWN_TARGET');
 if(a.type==='Attack' || a.type==='Guard'){
  const attack=c.attacks.find(x=>x.id===a.attackId); if(!attack)throw new Error('UNKNOWN_ATTACK');
  if(a.type==='Guard'){
   if(a.area.some(h=>!inside(h,s.board)))throw new Error('INVALID_GUARD_AREA');
   if(attack.mode==='area')throw new Error('AREA_GUARD_UNSUPPORTED');
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
export function hitModifiers(s:GameState,a:Creature,b:Creature,attack:AttackDefinition,side:'left'|'right'='left'):[boolean,boolean]{
 const allies=s.creatures.filter(x=>x.id!==a.id && a.controller!==null && x.controller===a.controller && active(x) && x.height===b.height && pair(x,b).distance===1);
 const advantage=allies.some(x=>a.packTactics||(pair(a,b).distance===1&&oppositeSectors(b.centre,a.centre,x.centre)));
 const threatened=!melee(attack) && s.creatures.some(x=>enemies(a,x)&&active(x)&&x.height===a.height&&pair(a,x).distance===1);
 const defended=s.defending.some(d=>d.creatureId===b.id && (s.phase==='movement' ? false : d.phases.includes(s.phase as 'early'|'late')));
 const p=pair(a,b),obscured=!a.ignoresDarknessDisadvantage&&(a.darknessSightRange===0||p.distance>a.darknessSightRange)&&darkRay(s,p.from,p.to,side);
 return [advantage,defended||threatened||has(a,'Fear')||obscured];
}
export function beginAttack(s:GameState,c:Creature,action:AttackAction,source:'action'|'guard'):void {
 s.pendingAttack={actionId:`attack-${s.nextEntityId++}`,attackerId:c.id,action,source,shotIndex:0,victimIndex:0,areaVictims:null,damageByTarget:[]};
}
/** One hit/victim per atomic step; aggregate damage survives snapshots for concentration. */
export function stepAttack(s:GameState,events:Event[]):boolean {
 const p=s.pendingAttack!;const a=s.creatures.find(c=>c.id===p.attackerId)!;
 const attack=a.attacks.find(x=>x.id===p.action.attackId)!;
 if(!active(a)||a.controller===null||p.shotIndex>=attack.shots.length){
  emit(s,events,{type:'AttackFinished',creatureId:a.id,damageByTarget:p.damageByTarget});concentration(s,p.damageByTarget,events);s.pendingAttack=null;return true;
 }
 const strike=attack.shots[p.shotIndex]!;
 let target:Creature|undefined;
 if(p.action.structure){
  p.shotIndex++;
  const result=strikeStructure(s,a,p.action.structure,attack,p.action.side,strike.components,events,a.id);
  if(result.kind==='invalid'){emit(s,events,{type:'AttackInvalid',creatureId:a.id});return false;}
  if(result.kind==='terrain')return false;
  target=s.creatures.find(c=>c.id===result.id);
 }else if(attack.mode==='swarm'&&p.source==='action'){
  if(p.areaVictims===null)p.areaVictims=s.creatures.filter(c=>enemies(a,c)&&inReach(s,a,c,attack,p.action.side)).map(c=>c.id).sort();
  if(p.victimIndex>=p.areaVictims.length){p.shotIndex++;p.victimIndex=0;p.areaVictims=null;return false;}
  const id=p.areaVictims[p.victimIndex++];target=s.creatures.find(c=>c.id===id);
  if(target&&(!enemies(a,target)||!inReach(s,a,target,attack,p.action.side)))target=undefined;
 }else if(attack.mode==='area'){
  const ground=p.action.ground!;const origin=nearestPair(footprint(a.centre,a.size),[ground]);
  if(origin.distance<attack.minRange||origin.distance>attack.range||!clearProjectile(origin.from,ground,p.action.side,s.walls,true)){
   emit(s,events,{type:'AttackInvalid',creatureId:a.id});p.shotIndex++;p.areaVictims=null;return false;
  }
  if(p.areaVictims===null){p.areaVictims=affectedCreatures(disk(ground,attack.radius),s.creatures.filter(c=>c.alive));damageWeed(s,disk(ground,attack.radius),strike.components,events,a.id);damageAreaWalls(s,disk(ground,attack.radius),strike.components,events,a.id);}
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
 const [advantage,disadvantage]=hitModifiers(s,a,target,attack,p.action.side);
 const area=attack.mode==='area';
 const hit=area || !active(target) || roll(s,hitChance(strike.skill,target.dex),advantage,disadvantage);
 if(!hit){emit(s,events,{type:'AttackMissed',creatureId:a.id,targetId:target.id});return false;}
 const critical=!area&&roll(s,strike.crit);
 const half=area&&!roll(s,effectChance(strike.skill,target.dex));
 const damage=applyDamage(s,target,strike.components,events,{area,critical,half,sourceId:a.id,actionId:p.actionId});
 const previous=p.damageByTarget.find(d=>d.targetId===target!.id);
 if(previous)previous.amount+=damage;else p.damageByTarget.push({targetId:target.id,amount:damage});
 emit(s,events,{type:'AttackHit',creatureId:a.id,targetId:target.id,critical});
 for(const effect of strike.secondary){
  if(effect.requiresDamage&&!damage)continue;
  const resistance=effect.resistance==='con'?target.con:effect.resistance==='physical'?2*target.size:target.intelligence;
  if(roll(s,effectChance(effect.potency,resistance)))addCondition(s,target,effect.kind,a.id,effect.potency,effect.duration,effect.resistance);
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
 if(c.kind==='illusion'&&['Treat','Wake','Extinguish'].includes(action.type))return;
 if(action.type==='Attack'){beginAttack(s,c,action,'action');return;}
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
  return !g.spent&&!g.attacked.includes(mover.id)&&active(c)&&enemies(c,mover)&&(!g.targetId||g.targetId===mover.id)&&
   (!g.area.length||footprint(mover.centre,mover.size).some(h=>g.area.some(a=>equal(a,h))))&&inReach(s,c,mover,attack)&&!inReach(s,c,{...mover,centre:from},attack);
 });
 const queue=buildQueue(candidates.map(g=>{const c=s.creatures.find(c=>c.id===g.creatureId)!;const wizard=s.creatures.find(w=>w.kind==='wizard'&&w.controller===c.controller);return {creatureId:c.id,dex:c.dex,move:c.move,size:c.size,slowed:c.slowed||has(c,'Slowed'),quick:false,wizardDistance:wizard?pair(c,wizard).distance:0};}),s.random.resolution,false);
 s.random.resolution=queue.randomState;
 for(const entry of queue.entries){const g=candidates.find(g=>g.creatureId===entry.creatureId)!;const c=s.creatures.find(c=>c.id===g.creatureId)!;
  g.attacked.push(mover.id);if(!melee(c.attacks.find(a=>a.id===g.attackId)!))g.spent=true;
  s.reactions.push({attackerId:g.creatureId,targetId:mover.id,attackId:g.attackId});
 }
}
