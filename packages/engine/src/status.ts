import {bodyFootprint} from './bodies.js';
import { weedRestrained } from './tangleweed.js';
import { restrainedBySwarm } from './swarms.js';
import { footprint, nearestPair } from '../../geometry/src/hex.js';
import type { Creature,GameState } from '../../domain/src/state.js';
import type { Condition } from '../../domain/src/combat.js';
export const has=(c:Creature,kind:Condition['kind'])=>c.conditions.some(e=>e.kind===kind && e.active);
export const incapacitated=(c:Creature)=>c.incapacitated || c.hp<=0 || has(c,'Unconscious');
export const active=(c:Creature)=>c.alive && !incapacitated(c);
/** Planning/phase preparation can account for known waking without altering
 * authoritative Sleep or granting an Early action. Other incapacity remains. */
export function afterEarlyWake(c:Creature,turn:number):Creature {
 const sleep=c.conditions.filter(e=>e.kind==='Unconscious'&&e.active);
 return sleep.length>0&&sleep.every(e=>e.expiresAfterPhase?.turn===turn&&e.expiresAfterPhase.phase==='early')?{...c,conditions:c.conditions.filter(e=>!sleep.includes(e))}:c;
}
export const slowed=(c:Creature)=>c.slowed || has(c,'Slowed');
export const subdued=(c:Creature)=>c.subdued || has(c,'Subdued') || has(c,'Disease');
export const restrained=(s:GameState,c:Creature)=>c.restrained || weedRestrained(s,c) || has(c,'Restrained') || restrainedBySwarm(s,c) || s.holds.some(h=>h.targetId===c.id || h.grapplerId===c.id);
export function health(c:Creature):'healthy'|'wounded'|'critical'|'incapacitated'|'dead' {
 if(!c.alive||(c.swarm&&c.hp<=0))return 'dead';if(c.hp<=0)return 'incapacitated';if(c.hp*3>c.maxHp*2)return 'healthy';if(c.hp*3>c.maxHp)return 'wounded';return 'critical';
}

export function fearAllowsStep(s:GameState,c:Creature,to:Creature['centre']):boolean {
 const fears=c.conditions.filter(e=>e.kind==='Fear'&&e.active);
 return fears.every(fear=>{
  const source=s.creatures.find(x=>x.id===fear.sourceId&&x.alive);if(!source)return true;
  const target=bodyFootprint(s,source);
  return nearestPair(bodyFootprint(s,c,to),target).distance>=nearestPair(bodyFootprint(s,c),target).distance;
 });
}
