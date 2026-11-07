import type {Creature,GameState} from '../../domain/src/state.js';
import type {PowerAction} from '../../domain/src/combat.js';
import {footprint,nearestPair} from '../../geometry/src/hex.js';
import {active,slowed} from './status.js';
import {sight,visibleTo} from './visibility.js';
import {addCondition,effectChance,immuneTo,roll} from './damage.js';
import {emit,type Event} from './events.js';

function definition(actor:Creature,action:PowerAction) {
 return action.type==='Gaze'?actor.gaze:actor.fearAction?.kind===action.type?actor.fearAction:undefined;
}
const enemy=(actor:Creature,target:Creature)=>actor.id!==target.id&&(actor.controller===null||actor.controller!==target.controller);
function eligibleTarget(s:GameState,actor:Creature,target:Creature,range:number):boolean {
 const p=nearestPair(footprint(actor.centre,actor.size),footprint(target.centre,target.size));
 return target.alive&&enemy(actor,target)&&p.distance<=range&&!!actor.controller&&visibleTo(s,target,actor.controller)&&sight(s,actor,p.from,p.to,'left');
}
export function validatePowerAction(s:GameState,actor:Creature,action:PowerAction):void {
 if(!definition(actor,action))throw new Error('NO_SUCH_POWER');
 if(action.type==='Roar')return;
 const target=s.creatures.find(c=>c.id===action.targetId);
 if(!target?.alive||!enemy(actor,target))throw new Error('INVALID_POWER_TARGET');
 if(!actor.controller||!visibleTo(s,target,actor.controller))throw new Error('UNKNOWN_TARGET');
 // Range and the actor's sight are rechecked after planned movement, like attacks.
}
export function beginPower(s:GameState,actor:Creature,action:PowerAction,events:Event[]):void {
 const power=definition(actor,action);
 if(!power||!active(actor)||!actor.controller||actor.readyTurn>s.turn){emit(s,events,{type:'ActionInvalid',creatureId:actor.id,action:action.type});return;}
 const targets=action.type==='Roar'?s.creatures.filter(t=>eligibleTarget(s,actor,t,power.range)).map(t=>t.id).sort():[action.targetId];
 s.pendingPower={actorId:actor.id,action:structuredClone(action),targets,index:0};
 emit(s,events,{type:'PowerStarted',creatureId:actor.id,action:action.type});
}
/** One target's resistance and application per atomic step. Never reconstruct
 * the committed victim list or reroll a completed target after restoring. */
export function stepPower(s:GameState,events:Event[]):boolean {
 const pending=s.pendingPower!,actor=s.creatures.find(c=>c.id===pending.actorId)!;
 const power=definition(actor,pending.action);
 if(!power||!active(actor)||!actor.controller||pending.index>=pending.targets.length){
  emit(s,events,{type:'PowerFinished',creatureId:actor.id,action:pending.action.type});s.pendingPower=null;return true;
 }
 const targetId=pending.targets[pending.index++]!;
 const target=s.creatures.find(c=>c.id===targetId)!;
 const event={creatureId:actor.id,targetId:target.id,action:pending.action.type};
 if(!eligibleTarget(s,actor,target,power.range)){emit(s,events,{type:'PowerInvalid',...event});return false;}
 const kind=pending.action.type==='Gaze'?(slowed(target)?'Restrained':'Slowed'):'Fear';
 if(immuneTo(target,kind)||(actor.kind==='illusion'&&target.intelligence===0)){emit(s,events,{type:'PowerUnaffected',...event});return false;}
 if(roll(s,effectChance(power.potency,target.intelligence))){
  addCondition(s,target,kind,actor.id,power.potency,power.duration,'int',false);
  emit(s,events,{type:'PowerApplied',...event});
 }else emit(s,events,{type:'PowerResisted',...event});
 return false;
}
