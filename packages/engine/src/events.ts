import type { Creature, GameState } from '../../domain/src/state.js';
export interface Event {type:string;sequence:number;turn:number;phase:GameState['phase'];creatureId?:string;targetId?:string;playerId?:string;from?:Creature['centre'];to?:Creature['centre'];action?:string;amount?:number;critical?:boolean;damageByTarget?:{targetId:string;amount:number}[]}
export interface Transition {state:GameState;events:Event[];acknowledgedRevision:number}
export function emit(state:GameState,events:Event[],event:Omit<Event,'sequence'|'turn'|'phase'>):void {events.push({...event,sequence:++state.eventSequence,turn:state.turn,phase:state.phase});}
