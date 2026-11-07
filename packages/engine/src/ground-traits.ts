import {bodyFootprint} from './bodies.js';
import type {Creature,GameState} from '../../domain/src/state.js';
import type {AttackDefinition} from '../../domain/src/combat.js';
import {footprint,nearestPair} from '../../geometry/src/hex.js';
import {clearProjectile} from '../../geometry/src/walls.js';
import {active} from './status.js';

export function physicalContact(s:GameState,a:Creature,b:Creature,range:number):boolean {
 const p=nearestPair(bodyFootprint(s,a),bodyFootprint(s,b));
 return a.height===b.height&&p.distance<=range&&clearProjectile(p.from,p.to,'left',s.walls);
}
export function rootContact(s:GameState,a:Creature,b:Creature):boolean {
 return a.height==='ground'&&b.height==='ground'&&physicalContact(s,a,b,a.rootNetwork?.range??1);
}
export function pruneRootNetworks(s:GameState):void {
 for(const target of s.creatures)target.conditions=target.conditions.filter(e=>{
  if(!e.rootNetwork)return true;
  const source=s.creatures.find(c=>c.id===e.sourceId);
  return target.alive&&!!source&&!!source.rootNetwork&&active(source)&&rootContact(s,source,target);
 });
}
export function hasRangedCover(s:GameState,attacker:Creature,target:Creature,attack:AttackDefinition):boolean {
 if(!['projectile','direct'].includes(attack.mode)||target.controller===null)return false;
 return s.creatures.some(source=>source.id!==target.id&&source.controller===target.controller&&source.height===target.height&&!!source.rangedCover&&active(source)&&!(source.kind==='illusion'&&attacker.intelligence===0)&&nearestPair(bodyFootprint(s,source),bodyFootprint(s,target)).distance<=source.rangedCover.range);
}

/** Recheck only holds affected by a body's displacement or footprint change. */
export function pruneDisplacedHolds(s:GameState,creatureIds:readonly string[]):void {
 s.holds=s.holds.filter(h=>{
  if(!creatureIds.includes(h.grapplerId)&&!creatureIds.includes(h.targetId))return true;
  const g=s.creatures.find(c=>c.id===h.grapplerId)!,t=s.creatures.find(c=>c.id===h.targetId)!;
  return active(g)&&t.alive&&physicalContact(s,g,t,Math.max(1,...g.attacks.filter(a=>a.mode==='melee').map(a=>a.range)));
 });
}
