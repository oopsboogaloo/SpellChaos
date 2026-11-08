import {bodyFootprint} from './bodies.js';
import type { Creature,GameState } from '../../domain/src/state.js';
import { distance,footprint,nearestPair,nearestPairs,type Hex } from '../../geometry/src/hex.js';
import { traceRay,type RaySide } from '../../geometry/src/ray.js';
import { clearSight } from '../../geometry/src/walls.js';
import { active } from './status.js';

export function darkAt(s:GameState,h:Hex):boolean {
 return s.darkness.some(d=>distance(d.centre,h)<=1+Math.floor(d.level/3));
}
export function darkRay(s:GameState,from:Hex,to:Hex,side:RaySide):boolean {
 return s.darkness.length>0&&traceRay(from,to,side).some(h=>darkAt(s,h));
}
export function sight(s:GameState,observer:Creature,from:Hex,to:Hex,side:RaySide):boolean {
 return clearSight(from,to,side,s.walls)&&(!darkRay(s,from,to,side)||(observer.darknessSightRange>0&&distance(from,to)<=observer.darknessSightRange));
}
export const BOTH_SIDES:readonly RaySide[]=['left','right'];
/**
 * #20/#22: range is the minimum distance between footprints, so a check passes if ANY minimum-distance
 * cell pair passes it. Pairs are tried in canonical order, then the given ray sides; the first passing
 * pair (with its side) is returned, or null.
 */
export function clearNearestPair(from:readonly Hex[],to:readonly Hex[],test:(from:Hex,to:Hex,side:RaySide)=>boolean,sides:readonly RaySide[]=BOTH_SIDES):{from:Hex;to:Hex;distance:number;side:RaySide}|null {
 for(const p of nearestPairs(from,to))for(const side of sides)if(test(p.from,p.to,side))return {...p,side};
 return null;
}
export function seesCreature(s:GameState,observer:Creature,target:Creature,adjacent=true):boolean {
 return clearNearestPair(bodyFootprint(s,observer),bodyFootprint(s,target),(from,to,side)=>(adjacent&&distance(from,to)<=1&&clearSight(from,to,side,s.walls))||sight(s,observer,from,to,side))!==null;
}
export function visibleTo(s:GameState,target:Creature,playerId:string):boolean {
 if(target.controller===playerId)return true;
 if(target.invisible&&!target.revealedTo?.some(r=>r.playerId===playerId&&r.turn===s.turn&&r.phase===s.phase)&&!s.creatures.some(c=>c.controller===playerId&&active(c)&&c.seeInvisibleRange!==undefined&&nearestPair(bodyFootprint(s,c),bodyFootprint(s,target)).distance<=c.seeInvisibleRange&&seesCreature(s,c,target)))return false;
 // The open arena has no general fog of war. Darkness and invisibility hide occupants.
 if(!bodyFootprint(s,target).some(h=>darkAt(s,h)))return true;
 return s.creatures.some(c=>c.controller===playerId&&active(c)&&seesCreature(s,c,target));
}

/** Independent units do not share a controller's or any other observer's sight. */
export function perceives(s:GameState,observer:Creature,target:Creature):boolean {
 if(!target.alive)return false;
 if(target.invisible&&!(observer.seeInvisibleRange!==undefined&&nearestPair(bodyFootprint(s,observer),bodyFootprint(s,target)).distance<=observer.seeInvisibleRange))return false;
 return seesCreature(s,observer,target);
}
export const targetVisible=(s:GameState,observer:Creature,target:Creature)=>observer.controller===null?perceives(s,observer,target):visibleTo(s,target,observer.controller);
/**
 * #15: what a player can perceive. Planning-time validators check against this, so an error code never
 * reveals invisible creatures, Darkness occupants or hidden corpses; resolution re-checks full state.
 */
export function knownState(s:GameState,playerId:string):GameState {
 return {...s,creatures:s.creatures.filter(c=>visibleTo(s,c,playerId)),corpses:s.corpses.filter(b=>{const body=s.creatures.find(c=>c.id===b.creatureId);return !!body&&visibleTo(s,{...body,centre:b.centre,size:b.size},playerId);})};
}
