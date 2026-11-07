import {bodyFootprint} from './bodies.js';
import { randomBelow } from '../../domain/src/random.js';
import type { GameState } from '../../domain/src/state.js';
import type { SpellFamily } from '../../domain/src/spells.js';
import { mvpSpellFamilies,startingPool,guaranteed,damageSpells,utilitySpells } from '../../content/src/spells.js';
import { footprint,nearestPair } from '../../geometry/src/hex.js';

/** Enumerate valid subsets once, then draw one index: exactly uniform, bounded work. */
const validBooks:SpellFamily[][]=[];
function enumerate(index:number,chosen:SpellFamily[]):void {
 if(chosen.length===10){
  if(chosen.filter(s=>s.startsWith('Summon ')).length>=2&&chosen.some(s=>damageSpells.includes(s))&&chosen.some(s=>utilitySpells.includes(s)))validBooks.push([...chosen]);return;
 }
 for(let i=index;i<=startingPool.length-(10-chosen.length);i++){chosen.push(startingPool[i]!);enumerate(i+1,chosen);chosen.pop();}
}
enumerate(0,[]);
export function startingBook(seed:number):{book:SpellFamily[];state:number}{const draw=randomBelow(seed,validBooks.length);return {book:[...validBooks[draw.value]!,...guaranteed],state:draw.state};}
export function awardAndRegenerate(s:GameState):void {
 for(const c of s.creatures.filter(c=>c.alive && c.kind!=='illusion')){
  const familiar=c.kind==='wizard'&&s.creatures.some(f=>f.familiar&&f.controller===c.controller&&f.kind!=='illusion'&&f.alive&&nearestPair(bodyFootprint(s,c),bodyFootprint(s,f)).distance<=4)?1:0;
  c.mana=Math.min(c.maxMana,c.mana+c.manaRegen+familiar);
  if(c.kind==='wizard'&&s.turn%3===0){
   const unknown=mvpSpellFamilies.filter(f=>!c.spellbook.includes(f));
   if(unknown.length){const draw=randomBelow(s.random.setup,unknown.length);s.random.setup=draw.state;c.spellbook.push(unknown[draw.value]!);}
   else c.mana=Math.min(c.maxMana,c.mana+10);
  }
 }
}
