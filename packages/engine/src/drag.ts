import type {Creature,GameState,Order} from '../../domain/src/state.js';
import {add,footprint,overlap,type Hex} from '../../geometry/src/hex.js';
import {stepLegality} from '../../geometry/src/occupancy.js';
import {active,restrained} from './status.js';
import {castingLocksMovement} from './casting.js';
import {arenaOf} from './orders.js';
import {physicalContact} from './ground-traits.js';
import {weedStepCost} from './tangleweed.js';
import {wallStepCost} from './walls.js';

export function dragTarget(s:GameState,c:Creature,order:Order):Creature|undefined {
 return s.creatures.find(t=>t.id===order.dragTargetId&&s.holds.some(h=>h.grapplerId===c.id&&h.targetId===t.id));
}
export function canDrag(s:GameState,c:Creature,order:Order):boolean {
 const target=dragTarget(s,c,order);
 if(!c.drag||!active(c)||!target?.alive||c.readyTurn>s.turn||!physicalContact(s,c,target,Math.max(1,...c.attacks.filter(a=>a.mode==='melee').map(a=>a.range)))||castingLocksMovement(s,c))return false;
 const withoutPair={...s,holds:s.holds.filter(h=>h.grapplerId!==c.id||h.targetId!==target.id)};
 return !restrained(withoutPair,c)&&!restrained(withoutPair,target);
}
function targetAt(s:GameState,c:Creature,order:Order,to:Hex):Hex {
 const target=dragTarget(s,c,order)!,anchor=s.creatures.find(a=>a.id===c.id)!;
 return add(to,{q:target.centre.q-anchor.centre.q,r:target.centre.r-anchor.centre.r});
}
export function dragDestination(s:GameState,c:Creature,order:Order,to:Hex):Hex {return targetAt(s,c,order,to);}
export function dragStepLegal(s:GameState,c:Creature,order:Order,from:Hex,to:Hex,ignoreCreatures=false):boolean {
 if(!canDrag(s,c,order))return false;
 const target=dragTarget(s,c,order)!,targetFrom=targetAt(s,c,order,from),targetTo=targetAt(s,c,order,to);
 if(overlap(footprint(to,c.size),footprint(targetTo,target.size)))return false;
 const arena={...arenaOf(s),creatures:ignoreCreatures?[]:arenaOf(s).creatures.filter(a=>a.id!==c.id&&a.id!==target.id)};
 const body=(a:Creature)=>({...a,height:'ground' as const,incorporeal:false,passCreatures:false,nimble:false,swarm:false});
 return stepLegality(arena,body(c),from,to,false).legal&&stepLegality(arena,body(target),targetFrom,targetTo,false).legal;
}
export function dragStepCost(s:GameState,c:Creature,order:Order,from:Hex,to:Hex):number {
 const target=dragTarget(s,c,order);
 if(!target)return 1;
 const targetFrom=targetAt(s,c,order,from),targetTo=targetAt(s,c,order,to);
 return Math.max(weedStepCost(s,c,to),wallStepCost(s,c,from,to),weedStepCost(s,target,targetTo),wallStepCost(s,target,targetFrom,targetTo));
}
export function prepareDragPath(s:GameState,c:Creature,order:Order,allowance:number):Hex[] {
 const path:Hex[]=[];let from=c.centre,spent=0;
 for(const to of order.path){
  const cost=dragStepCost(s,c,order,from,to);
  if(spent+cost>allowance||!dragStepLegal(s,c,order,from,to))break;
  path.push({...to});spent+=cost;from=to;
 }
 return path;
}

/** A planned Early Grapple can make Drag conditional; it never grants a hold
 * to authoritative state, and a miss wastes the movement rather than retrying. */
export function planningDragState(s:GameState,c:Creature,order:Order):GameState {
 if(order.dragTargetId===undefined||dragTarget(s,c,order))return s;
 const action=order.early,target=s.creatures.find(t=>t.id===order.dragTargetId);
 if(!c.drag||!action||typeof action==='string'||action.type!=='Grapple'||action.targetId!==order.dragTargetId||!target?.alive||target.size>c.size||(target.size===c.size&&!c.grappleEqualSize))return s;
 const limb=Array.from({length:c.grappleLimbs},(_,i)=>i).find(i=>!s.holds.some(h=>h.grapplerId===c.id&&h.limb===i));
 return limb===undefined?s:{...s,holds:[...s.holds,{grapplerId:c.id,targetId:target.id,limb}]};
}
