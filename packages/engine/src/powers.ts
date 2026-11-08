import {bodyFootprint} from './bodies.js';
import {rootContact,pruneRootNetworks} from './ground-traits.js';
import type {Creature,GameState} from '../../domain/src/state.js';
import type {PowerAction} from '../../domain/src/combat.js';
import {footprint,nearestPair,type Hex} from '../../geometry/src/hex.js';
import {active,slowed} from './status.js';
import {sight,visibleTo} from './visibility.js';
import {addCondition,applyDamage,effectChance,immuneTo,roll} from './damage.js';
import {concentration} from './casting.js';
import {cleanupDeaths} from './lifecycle.js';
import {isLethal} from './illusions.js';
import {emit,type Event} from './events.js';

function definition(actor:Creature,action:PowerAction) {
 switch(action.type){
  case 'Gaze':return actor.gaze;
  case 'Spores':return actor.spores;
  case 'Wail':return actor.wail;
  case 'RootNetwork':return actor.rootNetwork;
  default:return actor.fearAction?.kind===action.type?actor.fearAction:undefined;
 }
}
const enemy=(actor:Creature,target:Creature)=>actor.id!==target.id&&(actor.controller===null||actor.controller!==target.controller);
const sporesLiving=(target:Creature)=>!target.undead&&!target.construct&&target.kind!=='illusion';
function eligibleTarget(s:GameState,actor:Creature,target:Creature,action:PowerAction,range:number,origin:Hex=actor.centre):boolean {
 const p=nearestPair(bodyFootprint(s,actor,origin),bodyFootprint(s,target));
 if(action.type==='Wail')return target.alive&&target.id!==actor.id&&p.distance<=range;
 return target.alive&&enemy(actor,target)&&p.distance<=range&&!!actor.controller&&visibleTo(s,target,actor.controller)&&sight(s,actor,p.from,p.to,'left')&&(action.type!=='Spores'||sporesLiving(target))&&(action.type!=='RootNetwork'||(target.size<actor.size&&rootContact(s,actor,target)));
}
export function validatePowerAction(s:GameState,actor:Creature,action:PowerAction):void {
 if(!definition(actor,action))throw new Error('NO_SUCH_POWER');
 if(action.type==='Wail'&&(actor.wailReadyTurn??1)>s.turn)throw new Error('POWER_COOLDOWN');
 if(!('targetId' in action))return;
 const target=s.creatures.find(c=>c.id===action.targetId);
 if(!target?.alive||!enemy(actor,target)||(action.type==='Spores'&&!sporesLiving(target)))throw new Error('INVALID_POWER_TARGET');
 if(!actor.controller||!visibleTo(s,target,actor.controller))throw new Error('UNKNOWN_TARGET');
 // Range and the actor's sight are rechecked after planned movement, like attacks.
}
export function beginPower(s:GameState,actor:Creature,action:PowerAction,events:Event[]):void {
 const power=definition(actor,action);
 if(!power||!active(actor)||!actor.controller||actor.readyTurn>s.turn||(action.type==='Wail'&&(actor.wailReadyTurn??1)>s.turn)){
  emit(s,events,{type:'ActionInvalid',creatureId:actor.id,action:action.type});return;
 }
 const targets='targetId' in action?[action.targetId]:s.creatures.filter(t=>eligibleTarget(s,actor,t,action,power.range)).map(t=>t.id).sort();
 s.pendingPower={actorId:actor.id,action:structuredClone(action),targets,index:0};
 if(action.type==='Wail'){
  actor.wailReadyTurn=s.turn+actor.wail!.cooldown;
  Object.assign(s.pendingPower,{origin:{...actor.centre},actionId:`power-${s.nextEntityId++}`,damageByTarget:[]});
 }
 emit(s,events,{type:'PowerStarted',creatureId:actor.id,action:action.type});
}
/** One victim's damage and resistance resolve together; completed victims and
 * concentration totals are authoritative continuation data. */
export function stepPower(s:GameState,events:Event[]):boolean {
 const pending=s.pendingPower!,actor=s.creatures.find(c=>c.id===pending.actorId)!;
 const power=definition(actor,pending.action);
 const emittedRealWail=pending.action.type==='Wail'&&actor.kind!=='illusion';
 if(!power||(!emittedRealWail&&(!active(actor)||!actor.controller))||pending.index>=pending.targets.length){
  emit(s,events,{type:'PowerFinished',creatureId:actor.id,action:pending.action.type});
  if(pending.damageByTarget)concentration(s,pending.damageByTarget,events);
  s.pendingPower=null;return true;
 }
 const targetId=pending.targets[pending.index++]!;
 const target=s.creatures.find(c=>c.id===targetId)!;
 const event={creatureId:actor.id,targetId:target.id,action:pending.action.type};
 if(!eligibleTarget(s,actor,target,pending.action,power.range,pending.origin)){emit(s,events,{type:'PowerInvalid',...event});return false;}
 if(pending.action.type==='Wail'){
  const wail=actor.wail!;
  if(actor.kind==='illusion'&&target.intelligence===0){emit(s,events,{type:'PowerUnaffected',...event});return false;}
  const half=!roll(s,effectChance(wail.potency,target.dex));
  const damage=applyDamage(s,target,[{type:'magic',amount:wail.damage}],events,{area:true,half,sourceId:actor.id,actionId:pending.actionId!});
  if(damage>0)pending.damageByTarget!.push({targetId:target.id,amount:damage});
  if(!isLethal(target)&&!target.undead&&!target.construct&&!immuneTo(target,'Fear')&&roll(s,effectChance(wail.fearPotency,target.intelligence)))addCondition(s,target,'Fear',actor.id,wail.fearPotency,wail.duration,'int',false);
  cleanupDeaths(s,events);emit(s,events,{type:'WailResolved',...event});return false;
 }
 const kind=pending.action.type==='RootNetwork'?'Restrained':pending.action.type==='Spores'?'Unconscious':pending.action.type==='Gaze'?(slowed(target)?'Restrained':'Slowed'):'Fear';
 if(immuneTo(target,kind)||(actor.kind==='illusion'&&target.intelligence===0)){emit(s,events,{type:'PowerUnaffected',...event});return false;}
 const resistance=pending.action.type==='RootNetwork'?'physical':pending.action.type==='Spores'?'con':'int';
 if(roll(s,effectChance(power.potency,resistance==='physical'?2*target.size:resistance==='con'?target.con:target.intelligence))){
  const duration=pending.action.type==='Spores'||pending.action.type==='RootNetwork'?null:pending.action.type==='Gaze'?actor.gaze!.duration:actor.fearAction!.duration;
  const extra=pending.action.type==='RootNetwork'?{rootNetwork:true as const}:pending.action.type==='Spores'?{expiresAfterPhase:s.phase==='early'?{turn:s.turn,phase:'late' as const}:{turn:s.turn+1,phase:'early' as const}}:{};
  // A longer-lasting existing instance of the same condition is kept instead (owner ruling, #35).
  if(addCondition(s,target,kind,actor.id,power.potency,duration,resistance,false,extra)&&pending.action.type==='RootNetwork')pruneRootNetworks(s);
  emit(s,events,{type:'PowerApplied',...event});
 }else emit(s,events,{type:'PowerResisted',...event});
 return false;
}
