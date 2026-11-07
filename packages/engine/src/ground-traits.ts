import type {Creature,GameState} from '../../domain/src/state.js';
import type {AttackDefinition} from '../../domain/src/combat.js';
import {footprint,nearestPair} from '../../geometry/src/hex.js';
import {clearProjectile} from '../../geometry/src/walls.js';
import {active} from './status.js';

export function physicalContact(s:GameState,a:Creature,b:Creature,range:number):boolean {
 const p=nearestPair(footprint(a.centre,a.size),footprint(b.centre,b.size));
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
 return s.creatures.some(source=>source.id!==target.id&&source.controller===target.controller&&source.height===target.height&&!!source.rangedCover&&active(source)&&!(source.kind==='illusion'&&attacker.intelligence===0)&&nearestPair(footprint(source.centre,source.size),footprint(target.centre,target.size)).distance<=source.rangedCover.range);
}
