import type { Creature,GameState } from '../../domain/src/state.js';
import type { CastAction } from '../../domain/src/spells.js';
import type { DamageComponent } from '../../domain/src/combat.js';
import { footprint,equal,inside,distance,compareHex,type Hex } from '../../geometry/src/hex.js';
import { clearProjectile } from '../../geometry/src/walls.js';
import { effectChance,roll } from './damage.js';
import { emit,type Event } from './events.js';

export function legalWeedLayout(s:GameState,a:CastAction):boolean {
 const cells=a.hexes??[];
 if(cells.length!==a.level||cells.some(h=>!inside(h,s.board)))return false;
 const reached=new Set<number>([0]);
 for(let i=0;i<cells.length;i++)for(let j=0;j<cells.length;j++)if([...reached].some(k=>distance(cells[k]!,cells[j]!)===1&&clearProjectile(cells[k]!,cells[j]!,'left',s.walls)))reached.add(j);
 return reached.size===cells.length;
}
const covered=(c:Creature,hex:Hex)=>c.alive&&c.height==='ground'&&footprint(c.centre,c.size).some(h=>equal(h,hex));
export function weedRestrained(s:GameState,c:Creature):boolean {
 return s.weedHolds.some(h=>h.creatureId===c.id&&covered(c,h.hex)&&s.tangleweed.some(w=>w.id===h.patchId&&w.cells.some(cell=>equal(cell.hex,h.hex))));
}
export function pruneWeedHolds(s:GameState):void {
 s.weedHolds=s.weedHolds.filter(h=>{const c=s.creatures.find(c=>c.id===h.creatureId);return !!c&&covered(c,h.hex)&&s.tangleweed.some(w=>w.id===h.patchId&&w.cells.some(cell=>equal(cell.hex,h.hex)));});
}
export function weedStepCost(s:GameState,c:Creature,to:Hex):number {
 return s.tangleweed.some(w=>w.cells.some(cell=>covered({...c,centre:to},cell.hex)))?2:1;
}
export function contactWeed(s:GameState,c:Creature,events:Event[]):void {
 pruneWeedHolds(s);
 if(!c.alive||c.height!=='ground'||s.weedAttempts.includes(c.id)||weedRestrained(s,c))return;
 const patch=s.tangleweed.filter(w=>w.cells.some(cell=>covered(c,cell.hex))).sort((a,b)=>b.level-a.level||(a.id<b.id?-1:1))[0];
 if(!patch)return;
 s.weedAttempts.push(c.id);
 const held=roll(s,effectChance(patch.level,2*c.size));
 if(held){const cell=patch.cells.filter(cell=>covered(c,cell.hex)).sort((a,b)=>compareHex(a.hex,b.hex))[0]!;s.weedHolds.push({creatureId:c.id,patchId:patch.id,hex:{...cell.hex}});}
 emit(s,events,{type:held?'WeedRestrained':'WeedResisted',creatureId:c.id});
}
export function createWeed(s:GameState,caster:Creature,a:CastAction,id:string,events:Event[]):void {
 s.tangleweed.push({id,casterId:caster.id,level:a.level,createdTurn:s.turn,endsTurn:s.turn+a.level,cells:a.hexes!.map(hex=>({hex:{...hex},hp:3*a.level}))});
 emit(s,events,{type:'TangleweedCreated',creatureId:caster.id,to:a.ground!});
 for(const c of [...s.creatures].filter(c=>a.hexes!.some(h=>covered(c,h))).sort((a,b)=>a.id<b.id?-1:1))contactWeed(s,c,events);
}
export function escapeWeed(s:GameState,c:Creature):void {
 pruneWeedHolds(s);
 s.weedHolds=s.weedHolds.filter(h=>{
  if(h.creatureId!==c.id)return true;
  const w=s.tangleweed.find(w=>w.id===h.patchId)!;
  // A resistance roll succeeds when the effect fails, matching condition Escape.
  return roll(s,effectChance(w.level,2*c.size));
 });
}
export function damageWeed(s:GameState,hexes:readonly Hex[],components:readonly DamageComponent[],events:Event[],sourceId:string):number {
 if(components.some(c=>!Number.isSafeInteger(c.amount)||c.amount<0))throw new Error('INVALID_DAMAGE');
 const source=s.creatures.find(c=>c.id===sourceId);if(!source)throw new Error('UNKNOWN_DAMAGE_SOURCE');
 if(source.kind==='illusion')return 0;
 const amount=components.reduce((n,c)=>n+c.amount,0);if(!amount)return 0;
 let total=0;
 for(const patch of s.tangleweed)for(const cell of patch.cells)if(hexes.some(h=>equal(h,cell.hex))){total+=Math.min(cell.hp,amount);cell.hp=Math.max(0,cell.hp-amount);}
 s.tangleweed=s.tangleweed.map(w=>({...w,cells:w.cells.filter(c=>c.hp>0)})).filter(w=>w.cells.length>0);
 pruneWeedHolds(s);
 // Terrain HP is public; no hidden creature references appear in this event.
 if(total)emit(s,events,{type:'TangleweedDamaged',amount:total});
 return total;
}
