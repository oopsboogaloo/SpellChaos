import type {Creature,GameState} from '../../domain/src/state.js';
import {distance,footprint,nearestPair,overlap,type Hex} from '../../geometry/src/hex.js';
import {placement,stepLegality} from '../../geometry/src/occupancy.js';
import {arenaOf} from './orders.js';
import {active} from './status.js';
import {sight} from './visibility.js';
import {emit,type Event} from './events.js';

export function revealInvisible(s:GameState,target:Creature,playerId:string,events:Event[]):void {
 if(!target.invisible)return;
 target.revealedTo=[...(target.revealedTo??[]).filter(r=>r.playerId!==playerId),{playerId,turn:s.turn,phase:s.phase}];
 emit(s,events,{type:'InvisibleRevealed',creatureId:target.id,playerId,audience:[playerId]});
}
export function expireReveals(s:GameState):void {for(const c of s.creatures)delete c.revealedTo;}
export function executeHaunt(s:GameState,actor:Creature,ground:Hex,events:Event[]):void {
 const origin=nearestPair(footprint(actor.centre,actor.size),[ground]);
 if(!actor.haunt||!actor.controller||!active(actor)||actor.readyTurn>s.turn||origin.distance>actor.haunt.range||!sight(s,actor,origin.from,ground,'left')){
  emit(s,events,{type:'ActionInvalid',creatureId:actor.id,action:'Haunt'});return;
 }
 const target=s.creatures.filter(c=>c.id!==actor.id&&c.alive&&c.invisible&&footprint(c.centre,c.size).some(h=>distance(h,ground)===0)).sort((a,b)=>a.id<b.id?-1:1)[0];
 if(target)revealInvisible(s,target,actor.controller,events);
 emit(s,events,{type:'HauntResolved',creatureId:actor.id,action:'Haunt'});
}
/** Reveal only the actual next blocked contact, never distant occupancy while
 * preparing a full path. Passage, height and illusion/Int0 exceptions still apply. */
export function revealBlockedContact(s:GameState,actor:Creature,to:Hex,height:Creature['height'],events:Event[]):void {
 if(!actor.controller)return;
 const mover={...actor,height},arena=arenaOf(s);
 const terrain={...arena,creatures:[]};
 if(!(distance(actor.centre,to)===0?placement(terrain,mover,to):stepLegality(terrain,mover,actor.centre,to,false)).legal)return;
 const legality=distance(actor.centre,to)===0?placement(arena,mover,to):stepLegality(arena,mover,actor.centre,to,false);
 if(legality.legal||legality.reason!=='CREATURE')return;
 for(const target of s.creatures.filter(c=>c.id!==actor.id&&c.alive&&c.invisible&&!c.swarm&&!(c.kind==='illusion'&&actor.intelligence===0)&&overlap(footprint(to,actor.size),footprint(c.centre,c.size))))revealInvisible(s,target,actor.controller,events);
}
