import type { Creature } from '../../domain/src/state.js';
import type { SpellFamily } from '../../domain/src/spells.js';
import { swarmProfile } from './swarms.js';
/** Approved familiar and swarm profiles. Full roster/actions are Stage 7. */
export function summonProfile(spell:SpellFamily,level:number):Partial<Creature>|null {
 if(level!==1)return swarmProfile(spell,level);
 const base:Partial<Creature>={size:1,con:3,hp:3,maxHp:3,familiar:true,mana:0,maxMana:0,manaRegen:0,spellLevelCap:0,summonLevel:1};
 const strike=(name:string,skill:number,amount:number,type:'physical'|'fire'='physical',range=1)=>({id:'basic',name,mode:range===1?'melee' as const:'projectile' as const,range,minRange:0,radius:0,shots:[{skill,crit:5,components:[{type,amount}],secondary:[]}]});
 if(spell==='Summon Cat')return {...base,species:'Cat familiar',family:'Cat',move:5,dex:8,intelligence:3,nimble:true,attacks:[strike('Claws',4,1)]};
 if(spell==='Summon Serpent'){
  const bite=strike('Bite',4,1);
  return {...base,species:'Snake familiar',family:'Serpent',move:3,dex:6,intelligence:2,defences:[{type:'poison',multiplier:.5},{type:'cold',multiplier:1.5}],attacks:[{...bite,shots:[{...bite.shots[0]!,secondary:[{kind:'Poisoned',potency:2,resistance:'con',duration:3,requiresDamage:true}]}]}]};
 }
 if(spell==='Summon Dragon')return {...base,species:'Dragonet familiar',family:'Dragon',move:5,dex:6,intelligence:4,height:'air',reanimationAttackIds:[],defences:[{type:'fire',multiplier:.5},{type:'cold',multiplier:1.5}],attacks:[strike('Spark',4,1,'fire',3)]};
 return null;
}
