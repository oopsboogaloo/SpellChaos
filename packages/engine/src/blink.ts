import {flightStepCost,prepareFlightPath} from './flight.js';
import {dragStepCost,prepareDragPath} from './drag.js';
import type {Creature,GameState,Order} from '../../domain/src/state.js';
import {add,distance,footprint,type Hex} from '../../geometry/src/hex.js';
import {traceRay} from '../../geometry/src/ray.js';
import {crossedWalls} from '../../geometry/src/walls.js';
import {placement,stepLegality,legalPathPrefix} from '../../geometry/src/occupancy.js';
import {arenaOf} from './orders.js';
import {active,restrained,fearAllowsStep} from './status.js';
import {castingLocksMovement} from './casting.js';
import {weedStepCost} from './tangleweed.js';
import {wallStepCost} from './walls.js';

export function blinkLegal(s:GameState,c:Creature,from:Hex,to:Hex,ignoreCreatures=false):boolean {
 const length=distance(from,to);
 if(!active(c)||c.readyTurn>s.turn||!c.blink||c.blinkUsedTurn===s.turn||length<1||length>c.blink.range||restrained(s,c)||castingLocksMovement(s,c)||!fearAllowsStep(s,{...c,centre:from},to)||!placement(ignoreCreatures?{...arenaOf(s),creatures:[]}:arenaOf(s),c,to).legal)return false;
 const delta={q:to.q-from.q,r:to.r-from.r};
 return footprint(from,c.size).every(origin=>!crossedWalls(traceRay(origin,add(origin,delta),'left'),s.walls).some(w=>w.material==='energy'));
}
export function movementStepCost(s:GameState,c:Creature,order:Order,index:number,from:Hex,to:Hex):number {
 if(order.flightSteps)return flightStepCost(s,c,order,index,from,to);
 if(order.dragTargetId!==undefined)return dragStepCost(s,c,order,from,to);
 return order.blinkIndex===index?distance(from,to):Math.max(weedStepCost(s,c,to),wallStepCost(s,c,from,to));
}
export function prepareMovementPath(s:GameState,c:Creature,order:Order,allowance:number):Hex[] {
 if(order.flightSteps)return prepareFlightPath(s,c,order,allowance);
 if(order.dragTargetId!==undefined)return prepareDragPath(s,c,order,allowance);
 if(order.blinkIndex===undefined)return legalPathPrefix(arenaOf(s),c,order.path,allowance);
 const path:Hex[]=[];let from=c.centre,paid=0,restingLength=0;
 for(let i=0;i<order.path.length;i++){
  const to=order.path[i]!,blink=order.blinkIndex===i;
  const cost=movementStepCost(s,c,order,i,from,to);
  if(paid+cost>allowance||!(blink?blinkLegal(s,c,from,to):stepLegality(arenaOf(s),c,from,to,true).legal))break;
  path.push({...to});paid+=cost;from=to;
  if(placement(arenaOf(s),c,to).legal)restingLength=path.length;
 }
 return path.slice(0,restingLength);
}
