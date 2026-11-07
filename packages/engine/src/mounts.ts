import {traceRay} from '../../geometry/src/ray.js';
import {crossWallHazards} from './walls.js';
import {pruneDisplacedHolds} from './ground-traits.js';
import {cleanupDeaths} from './lifecycle.js';
import type {Creature,GameState,Order} from '../../domain/src/state.js';
import {distance,nearestPair,type Hex} from '../../geometry/src/hex.js';
import {nearestLegal,placement,stepLegality} from '../../geometry/src/occupancy.js';
import {clearProjectile} from '../../geometry/src/walls.js';
import {bodyFootprint,bodySize} from './bodies.js';
import {active,restrained,subdued,fearAllowsStep} from './status.js';
import {arenaOf} from './orders.js';
import {castingLocksMovement,invalidateCasts,concentration} from './casting.js';
import {addCondition,applyDamage} from './damage.js';
import {enqueueGuards} from './combat.js';
import {contactWeed} from './tangleweed.js';
import {emit,type Event} from './events.js';

export const riderOf=(s:GameState,mount:Creature)=>s.creatures.find(c=>c.mountId===mount.id&&c.alive);
export function carryingLocked(s:GameState,mount:Creature,planning=false):boolean {
 const rider=riderOf(s,mount);if(!rider)return false;
 const order=s.orders.find(o=>o.creatureId===rider.id);
 return restrained(s,rider)||castingLocksMovement(s,rider,planning)||order?.early==='TotalDefence'||order?.late==='TotalDefence'||(subdued(rider)&&s.spentActions.includes(rider.id));
}
export function carryingFearAllows(s:GameState,mount:Creature,to:Hex):boolean {
 const rider=riderOf(s,mount);return !rider||fearAllowsStep(s,{...rider,centre:mount.centre},to);
}
function mountSuitable(s:GameState,rider:Creature,mount:Creature):boolean {
 return !!rider.canRide&&!rider.mountable&&!rider.mountId&&rider.kind!=='illusion'&&mount.kind!=='illusion'&&!!mount.mountable&&!mount.mountId&&mount.size>rider.size&&rider.controller!==null&&mount.controller===rider.controller&&!riderOf(s,mount);
}
function detached(c:Creature):Creature {const result={...c};delete result.mountId;return result;}
export function dismountLegal(s:GameState,rider:Creature,to:Hex):boolean {
 const mount=s.creatures.find(c=>c.id===rider.mountId);
 const p=nearestPair(bodyFootprint(s,rider),[to]);
 return !!mount&&(mount.height==='ground'||!!rider.flight)&&p.distance<=1&&clearProjectile(p.from,p.to,'left',s.walls,rider.height==='air')&&placement(arenaOf(s),detached(rider),to).legal;
}
export function validateMountAction(s:GameState,rider:Creature,action:Extract<NonNullable<Order['early']>,{type:'Mount'|'Dismount'}>):void {
 if(action.type==='Mount'){
  const mount=s.creatures.find(c=>c.id===action.targetId);
  if(!mount||!mountSuitable(s,rider,mount))throw new Error('INVALID_MOUNT_TARGET');
 }else if(!rider.mountId)throw new Error('NOT_MOUNTED');
 else if(!dismountLegal(s,rider,action.ground))throw new Error('INVALID_DISMOUNT_DESTINATION');
}
export function resolveMountAction(s:GameState,rider:Creature,action:Extract<NonNullable<Order['early']>,{type:'Mount'|'Dismount'}>,events:Event[]):void {
 const from={...rider.centre},height=rider.height,size=bodySize(s,rider);
 if(action.type==='Mount'){
  const mount=s.creatures.find(c=>c.id===action.targetId),p=mount?nearestPair(bodyFootprint(s,rider),bodyFootprint(s,mount)):null;
  if(!mount||!mountSuitable(s,rider,mount)||!active(rider)||!active(mount)||mount.readyTurn>s.turn||rider.readyTurn>s.turn||mount.height!=='ground'||rider.height!=='ground'||!p||p.distance>1||!clearProjectile(p.from,p.to,'left',s.walls)||restrained(s,rider)||castingLocksMovement(s,rider)||!fearAllowsStep(s,rider,mount.centre)){
   emit(s,events,{type:'ActionInvalid',creatureId:rider.id,action:'Mount'});return;
  }
  rider.mountId=mount.id;rider.centre={...mount.centre};rider.height=mount.height;
  emit(s,events,{type:'Mounted',creatureId:rider.id,targetId:mount.id});
 }else{
  if(!active(rider)||!dismountLegal(s,rider,action.ground)||restrained(s,rider)||castingLocksMovement(s,rider)||!fearAllowsStep(s,rider,action.ground)){
   emit(s,events,{type:'ActionInvalid',creatureId:rider.id,action:'Dismount'});return;
  }
  delete rider.mountId;rider.centre={...action.ground};emit(s,events,{type:'Dismounted',creatureId:rider.id,from,to:{...rider.centre}});
 }
 delete rider.pounceTrail;delete rider.diveTrail;
 if(!s.moved.includes(rider.id))s.moved.push(rider.id);
 // Boarding/leaving may shift centres by more than one hex. Trace the rider's
 // physical body across every adjacent crossing, without expanding it to the
 // newly shared carrier footprint for wall damage.
 const path=traceRay(from,rider.centre,'left'),geometry=detached(rider);
 let damage=0;
 for(let i=1;i<path.length;i++)damage+=crossWallHazards(s,rider,path[i-1]!,path[i]!,events,geometry);
 pruneDisplacedHolds(s,[rider.id]);cleanupDeaths(s,events);
 concentration(s,[{targetId:rider.id,amount:damage}],events);
 contactWeed(s,rider,events);if(rider.alive)enqueueGuards(s,rider,from,height,size);invalidateCasts(s,events);
}
/** The carrier supplies voluntary/forced displacement; the rider retains its own
 * resources and conditions. Call before hazards, death cleanup and reactions. */
export function moveRider(s:GameState,mount:Creature,events:Event[],forced=false):Creature|undefined {
 const rider=riderOf(s,mount);if(!rider)return;
 const from={...rider.centre};rider.centre={...mount.centre};rider.height=mount.height;
 delete rider.pounceTrail;delete rider.diveTrail;
 if(!s.moved.includes(rider.id))s.moved.push(rider.id);
 emit(s,events,{type:forced?'RiderForcedMoved':'RiderMoved',creatureId:rider.id,targetId:mount.id,from,to:{...rider.centre}});
 return rider;
}
/** A direct force on a rider must legally detach; it cannot move the mount by
 * using the rider's smaller Size. */
export function forcedBody(s:GameState,c:Creature):Creature {return c.mountId?detached(c):c;}
export function cleanupMounts(s:GameState,events:Event[]):boolean {
 const pairs=[...s.creatures].filter(c=>c.mountId).sort((a,b)=>a.id<b.id?-1:1).map(rider=>({rider,mount:s.creatures.find(m=>m.id===rider.mountId)!})).filter(({rider,mount})=>!rider.alive||!mount.alive||rider.controller===null||rider.controller!==mount.controller);
 // Detach the whole batch first: an alive rider may otherwise refer to another
 // dead carrier omitted from the occupancy arena while nearestLegal runs.
 for(const {rider,mount} of pairs){delete rider.mountId;if(rider.alive)rider.height=mount.height==='air'&&!rider.flight?'ground':mount.height;}
 for(const {rider,mount} of pairs){
  if(!rider.alive)continue;
  const falling=mount.height==='air'&&!rider.flight;
  const to=nearestLegal(arenaOf(s),rider,mount.centre);
  delete rider.pounceTrail;delete rider.diveTrail;
  if(!to){rider.hp=-rider.maxHp;rider.alive=false;emit(s,events,{type:'NoLegalDismount',creatureId:rider.id,targetId:mount.id});continue;}
  const from={...rider.centre};rider.centre={...to};if(!s.moved.includes(rider.id))s.moved.push(rider.id);
  addCondition(s,rider,'Subdued',null,0,2,'physical',false);
  emit(s,events,{type:'EmergencyDismount',creatureId:rider.id,targetId:mount.id,from,to:{...to}});
  if(falling)applyDamage(s,rider,[{type:'physical',amount:5}],events,{actionId:`fall-${s.turn}-${mount.id}`});
  contactWeed(s,rider,events);invalidateCasts(s,events);
 }
 pruneDisplacedHolds(s,pairs.map(p=>p.rider.id));
 return pairs.length>0;
}
