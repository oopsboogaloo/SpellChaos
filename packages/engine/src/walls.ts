import {bodyFootprint} from './bodies.js';
import type { Creature,GameState } from '../../domain/src/state.js';
import type { CastAction } from '../../domain/src/spells.js';
import type { StructureTarget } from '../../domain/src/structures.js';
import type { AttackDefinition,DamageComponent } from '../../domain/src/combat.js';
import { footprint,nearestPair,inside,equal,add,distance,type Hex } from '../../geometry/src/hex.js';
import { edge,edgeKey,clearProjectile,clearSight,type Material } from '../../geometry/src/walls.js';
import { legalWallLayout } from '../../geometry/src/wall-layout.js';
import { traceProjectile } from '../../geometry/src/occupancy.js';
import { arenaOf } from './orders.js';
import { sight } from './visibility.js';
import { applyDamage,damageWall,heal } from './damage.js';
import { damageWeed } from './tangleweed.js';
import { emit,type Event } from './events.js';

export const wallMaterials:readonly Material[]=['wood','stone','iron','crystal','thorns','fire','energy','death'];
export function wallMaterial(level:number):Material {return wallMaterials[level-1]!;}
export function legalCastWall(s:GameState,a:CastAction):boolean {
 return legalWallLayout(arenaOf(s),a.edges??[],wallMaterial(a.level),a.level+2);
}
export function wallOriginValid(s:GameState,origin:Creature,a:CastAction):boolean {
 return (a.edges??[]).every(e=>{const p=nearestPair(bodyFootprint(s,origin),[e.a,e.b].filter(h=>inside(h,s.board)));return p.distance<=8&&sight(s,origin,p.from,p.to,a.side);});
}
export function createWall(s:GameState,caster:Creature,a:CastAction,networkId:string,events:Event[]):void {
 for(const [i,e] of a.edges!.entries())s.walls.push({id:`${networkId}:${i}`,networkId,casterId:caster.id,edge:edge(e.a,e.b),material:wallMaterial(a.level),hp:5+3*a.level,maxHp:5+3*a.level,burning:null});
 emit(s,events,{type:'WallCreated',creatureId:caster.id,to:a.ground!});
}
export function crossedBy(s:GameState,c:Creature,from:Hex,to:Hex){
 if(c.height==='air'||distance(from,to)!==1)return [];
 const delta={q:to.q-from.q,r:to.r-from.r};
 const keys=new Set(bodyFootprint(s,c,from).map(h=>edgeKey(edge(h,add(h,delta)))));
 return s.walls.filter(w=>keys.has(edgeKey(w.edge)));
}
export function wallStepCost(s:GameState,c:Creature,from:Hex,to:Hex):number {
 return crossedBy(s,c,from,to).some(w=>w.material==='thorns')?2:1;
}
/** Returns damage for the resolver's concentration/death step before Guard. */
export function crossWallHazards(s:GameState,c:Creature,from:Hex,to:Hex,events:Event[]):number {
 let total=0;
 for(const w of crossedBy(s,c,from,to).sort((a,b)=>a.id<b.id?-1:1)){
  if(!['thorns','fire','death'].includes(w.material))continue;
  const networkId=w.networkId??w.id;
  if(s.wallCrossings.some(x=>x.creatureId===c.id&&x.networkId===networkId))continue;
  s.wallCrossings.push({creatureId:c.id,networkId});
  if(w.material==='death'&&c.undead)heal(s,c,10,events,'necromantic');
  else total+=applyDamage(s,c,[{type:w.material==='thorns'?'physical':w.material==='fire'?'fire':'necrotic',amount:w.material==='thorns'?3:w.material==='fire'?6:10}],events,{sourceId:w.casterId??null,actionId:networkId});
 }
 return total;
}
export function structureCells(s:GameState,target:StructureTarget):Hex[] {
 if(target.kind==='wall'){const w=s.walls.find(w=>w.id===target.id);return w?[w.edge.a,w.edge.b].filter(h=>inside(h,s.board)):[];}
 return s.tangleweed.some(w=>w.id===target.id&&w.cells.some(c=>equal(c.hex,target.hex)))?[target.hex]:[];
}
export function damageStructure(s:GameState,target:StructureTarget,components:readonly DamageComponent[],events:Event[],sourceId:string,ignite=false):void {
 if(target.kind==='wall'){
  damageWall(s,target.id,components,events,sourceId);
  const wall=s.walls.find(w=>w.id===target.id);
  if(ignite&&wall?.material==='wood'&&components.some(c=>c.type==='fire'&&c.amount>0)&&!s.creatures.some(c=>c.id===sourceId&&c.kind==='illusion'))wall.burning={startsTurn:wall.burning&&wall.burning.endsTurn>=s.turn?Math.min(wall.burning.startsTurn,s.turn+1):s.turn+1,endsTurn:s.turn+2};
 }else damageWeed(s,[target.hex],components,events,sourceId,target.id);
}
export function damageAreaWalls(s:GameState,cells:readonly Hex[],components:readonly DamageComponent[],events:Event[],sourceId:string):void {
 for(const w of [...s.walls])if(cells.some(h=>equal(h,w.edge.a)||equal(h,w.edge.b)))damageWall(s,w.id,components,events,sourceId);
}
export function structureReach(s:GameState,origin:Creature,target:StructureTarget,range:number,minRange:number,side:'left'|'right',melee=false):boolean {
 const cells=structureCells(s,target);if(!cells.length)return false;
 const p=nearestPair(bodyFootprint(s,origin),cells),d=target.kind==='wall'?Math.max(1,p.distance):p.distance;
 return d<=range&&d>=minRange&&(!melee||origin.height==='ground')&&
 (sight(s,origin,p.from,p.to,side)||(melee&&d<=1&&clearSight(p.from,p.to,side,s.walls)));
}
/** Intercepted creatures return to the ordinary hit/critical path. Terrain has no hit roll. */
export function strikeStructure(s:GameState,origin:Creature,target:StructureTarget,attack:Pick<AttackDefinition,'mode'|'range'|'minRange'>,side:'left'|'right',components:readonly DamageComponent[],events:Event[],sourceId:string,ignite=false):{kind:'invalid'}|{kind:'terrain'}|{kind:'creature';id:string} {
 const melee=attack.mode==='melee';
 if(!structureReach(s,origin,target,attack.range,attack.minRange,side,melee))return {kind:'invalid'};
 const p=nearestPair(bodyFootprint(s,origin),structureCells(s,target));
 if(attack.mode==='projectile'){
  const trace=traceProjectile(arenaOf(s),origin,p.to,'ground',side);
  if(trace.hit)return {kind:'creature',id:trace.hit};
  if(trace.blockedBy){damageStructure(s,{kind:'wall',id:trace.blockedBy},components,events,sourceId,ignite);return {kind:'terrain'};}
 }else if(!clearProjectile(p.from,p.to,side,s.walls))return {kind:'invalid'};
 damageStructure(s,target,components,events,sourceId,ignite);return {kind:'terrain'};
}
