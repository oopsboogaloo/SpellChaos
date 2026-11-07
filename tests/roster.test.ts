import { describe, expect, it } from 'vitest';
import { rosterAbilities } from '../packages/content/src/roster-abilities.js';
import { approvedBlueprint, approvedRoster } from '../packages/content/src/roster.js';
import { summonProfile } from '../packages/content/src/summons.js';
import { summonFamilies, type SpellFamily } from '../packages/domain/src/spells.js';
import { creatureSchema } from '../packages/domain/src/state.js';
import { createCreature } from '../packages/engine/src/index.js';
import { reanimatedProfile } from '../packages/engine/src/reanimation.js';

// Independent numeric transcription of the approved MVP tables (Size/Con/Move/Dex/Int).
const expected = {
 Cat:['1/3/5/8/3','2/4/6/7/2','3/5/5/6/2','3/6/4/5/2','2/5/6/9/6','4/6/6/6/4','5/6/5/6/3','2/7/7/10/8'],
 Serpent:['1/3/3/6/2','1/4/3/7/1','4/4/3/5/1','6/4/3/5/1','3/6/3/4/3','3/5/7/8/4','5/7/3/4/3','8/8/3/4/8'],
 Goblin:['1/3/4/6/3','1/4/4/5/3','2/4/5/6/4','2/6/4/5/5','1/5/3/5/7','2/7/4/7/5','2/7/3/5/8','2/8/4/7/9'],
 Dragon:['1/3/5/6/4','2/5/4/4/2','3/5/6/6/3','3/5/5/5/5','4/7/5/5/6','4/7/5/5/7','5/8/4/5/9','6/8/4/4/8'],
 Spirit:['1/2/4/7/3','2/3/4/6/4','2/4/4/6/5','2/5/5/7/5','2/6/5/7/6','2/5/4/6/8','3/7/3/5/8','3/8/4/7/10'],
 Plant:['1/4/2/2/0','2/5/2/3/0','3/5/1/2/0','3/6/2/2/0','4/7/3/3/6','6/5/1/2/0','5/8/2/3/8','8/7/1/2/8'],
 Archer:['2/3/4/5/4','2/4/4/5/4','2/4/3/6/4','2/4/5/8/6','3/7/1/1/0','4/7/1/1/0','5/8/1/1/0','6/8/0/1/0'],
};
// Basic attack Skill/Dmg pairs, including every shot and alternative ordinary attack.
const expectedAttacks = {
 Cat:['4/1','5/3','6/4','7/5','7/4','7/4,6/3','8/8','9/5'],
 Serpent:['4/1','5/2','5/2','6/3','6/4','7/4;7/3','7/3,7/3,7/3','9/10'],
 Goblin:['4/1','5/2','6/3;5/2','6/4','6/3','8/5','7/5','8/7'],
 Dragon:['4/1','5/3','6/3,5/2','6/4','7/6','7/6','8/8','8/4,8/4,8/4'],
 Spirit:['3/1','4/2','5/3','6/4','7/5','6/3','8/7','9/8'],
 Plant:['3/1','4/2','5/3','5/4','7/6','6/3','8/8','8/6'],
 Archer:['4/1','5/2','6/3','7/3;7/3','7/7','5/5','6/7','6/6+6'],
};
const c = (family: typeof summonFamilies[number], level: number) => createCreature('subject','a',{q:10,r:10},approvedBlueprint(family,level)!.profile);

describe('approved MVP roster data (runtime ability integration remains gated)',()=>{
 it('has an explicit integration requirement for every special ability',()=>{
  const ids=new Set(approvedRoster().flatMap(r=>r.abilities.map(a=>a.id)));
  expect([...ids].sort()).toEqual(Object.keys(rosterAbilities).sort());
  for(const description of Object.values(rosterAbilities))expect(description.length).toBeGreaterThan(30);
 });
 it('contains exactly seven families and eight unique named profiles per family',()=>{
  const roster=approvedRoster();expect(roster).toHaveLength(56);
  expect(new Set(roster.map(r=>r.profile.species)).size).toBe(56);
  for(const family of summonFamilies)expect(roster.filter(r=>r.profile.family===family).map(r=>r.profile.summonLevel)).toEqual([1,2,3,4,5,6,7,8]);
 });
 for(const family of summonFamilies)it.each([1,2,3,4,5,6,7,8])(`${family} level %i preserves approved ratings and portable core data`,level=>{
  const subject=c(family,level), blueprint=approvedBlueprint(family,level)!;
  expect([subject.size,subject.con,subject.move,subject.dex,subject.intelligence].join('/')).toBe(expected[family][level-1]);
  expect(subject.attacks.map(a=>a.shots.map(s=>`${s.skill}/${s.components.map(c=>c.amount).join('+')}`).join(',')).join(';')).toBe(expectedAttacks[family][level-1]);
  expect(subject.hp).toBe(subject.size*subject.con);expect(subject.maxHp).toBe(subject.hp);
  expect(creatureSchema.parse(JSON.parse(JSON.stringify(subject)))).toEqual(subject);
  expect(JSON.parse(JSON.stringify(blueprint))).toEqual(blueprint);
  expect(new Set(subject.attacks.map(a=>a.id)).size).toBe(subject.attacks.length);
 });
 it('returns isolated copies and rejects unknown levels without falling back to a generic creature',()=>{
  for(const level of [-1,0,9,1.5,NaN])expect(approvedBlueprint('Cat',level)).toBeNull();
  const first=approvedBlueprint('Dragon',8)!;first.profile.attacks![0]!.shots[0]!.components[0]!.amount=999;
  first.abilities[1]!.parameters.damage=999;
  expect(c('Dragon',8).attacks[0]!.shots[0]!.components[0]!.amount).toBe(4);
  expect(approvedBlueprint('Dragon',8)!.abilities[1]!.parameters.damage).toBe(8);
 });
 it('matches the enabled engine creatures without enabling unfinished profiles',()=>{
  let enabled=0;
  for(const family of summonFamilies)for(let level=1;level<=8;level++){
   const profile=summonProfile(`Summon ${family}` as SpellFamily,level);
   if(profile){enabled++;expect(createCreature('subject','a',{q:10,r:10},profile)).toEqual(c(family,level));}
  }
  expect(enabled).toBe(27);
 });
 it('preserves the four explicit caster pools, caps and spell lists',()=>{
  const casters=approvedRoster().filter(r=>r.profile.mana).map(r=>({name:r.profile.species,mana:r.profile.mana,cap:r.profile.spellLevelCap,regen:r.profile.manaRegen,spells:r.profile.spellbook}));
  expect(casters).toEqual([
   {name:'Goblin shaman',mana:25,cap:3,regen:1,spells:['Darkness','Fire Bolt','Release']},
   {name:'The Once and Future Goblin',mana:40,cap:5,regen:1,spells:['Magic Attack','Bind','Teleport']},
   {name:'The Pale Monarch',mana:40,cap:6,regen:1,spells:['Reanimate','Release','Darkness']},
   {name:'Ancient treant',mana:35,cap:4,regen:1,spells:['Tangleweed','Healing Bolt']},
  ]);
 });
 it('keeps compound attacks in one action and alternative breaths out of bite sequences',()=>{
  expect(c('Cat',6).attacks[0]!.shots.map(s=>[s.skill,s.components[0]!.amount])).toEqual([[7,4],[6,3]]);
  expect(c('Dragon',3).attacks[0]!.shots.map(s=>[s.skill,s.components[0]!.amount])).toEqual([[6,3],[5,2]]);
  for(const [family,level,amount] of [['Serpent',7,3],['Dragon',8,4]] as const){
   const attacks=c(family,level).attacks;expect(attacks).toHaveLength(1);expect(attacks[0]!.shots.map(s=>s.components[0]!.amount)).toEqual([amount,amount,amount]);
  }
  const breaths=approvedBlueprint('Dragon',8)!.abilities.filter(a=>a.id==='breath');
  expect(breaths.map(b=>b.parameters.type)).toEqual(['fire','cold','lightning']);
  for(const b of breaths)expect(b.parameters).toMatchObject({length:3,cooldown:2,damage:8,skill:8,targets:'all'});
 });
 it('records D01–D08 ability choices rather than losing them in generic attacks',()=>{
  expect(approvedBlueprint('Spirit',7)!.abilities).toContainEqual({id:'marked-quarry',parameters:{skill:2,selection:'action',duration:'until-target-death'}});
  expect(approvedBlueprint('Serpent',5)!.abilities[0]!.parameters).toMatchObject({duration:2,escapeResistance:'int'});
  expect(c('Spirit',2).attacks[0]!.shots[0]!.secondary[0]).toMatchObject({kind:'Slowed',resistance:'int',requiresDamage:true});
  expect(c('Spirit',4).attacks[0]!.shots[0]!.secondary[0]).toMatchObject({kind:'Subdued',resistance:'int',requiresDamage:true});
  expect(approvedBlueprint('Spirit',6)!.abilities[0]!.parameters).toMatchObject({targets:'all-others',damageResistance:'dex',fearResistance:'int'});
  expect(approvedBlueprint('Archer',5)!.abilities[1]!.parameters).toMatchObject({secondDamage:4,separateHitRoll:true,continuesOnMiss:true});
  for(const [family,level,id] of [['Goblin',5,'basic'],['Goblin',8,'basic'],['Serpent',6,'spit']] as const)expect(c(family,level).attacks.find(a=>a.id===id)!.mode).toBe('projectile');
  expect(c('Plant',6).defences).toContainEqual({type:'fire',multiplier:2});
  expect(approvedBlueprint('Goblin',7)!.abilities[1]!.parameters).toMatchObject({stacks:false,affectsSelf:false});
 });
 it('retains physical immunity exceptions and corpse exclusions',()=>{
  for(let level=1;level<=8;level++){
   const spirit=c('Spirit',level);expect(spirit.undead).toBe(true);expect(spirit.corpseEligible).toBe(false);
   expect(spirit.defences).toContainEqual({type:'physical',multiplier:level===1?.5:level===2?.25:0});
   expect(c('Plant',level).corpseEligible).toBe(false);
  }
  expect(c('Spirit',7).incorporeal).toBe(false);
  for(let level=5;level<=8;level++){expect(c('Archer',level).construct).toBe(true);expect(c('Archer',level).corpseEligible).toBe(false);}
 });
 it('does not turn magical projectiles or poison production into reanimated body attacks',()=>{
  for(const [family,level] of [['Goblin',5],['Goblin',8],['Dragon',1]] as const)expect(reanimatedProfile(c(family,level),false).attacks).toEqual([]);
  const amphiptere=reanimatedProfile(c('Serpent',6),true);
  expect(amphiptere.attacks!.map(a=>a.id)).toEqual(['basic']);expect(amphiptere.height).toBe('air');
  expect(amphiptere.attacks![0]!.shots[0]!.secondary).toEqual([]);
 });
 it('keeps siege minimum ranges, areas, components and immobility distinct',()=>{
  for(const [level,range,minRange,radius,potency] of [[6,12,4,1,5],[7,15,5,1,6],[8,18,6,2,6]]){
   const a=c('Archer',level!).attacks[0]!;expect(a).toMatchObject({mode:'area',range,minRange,radius});expect(a.shots[0]!.skill).toBe(potency);expect(a.shots[0]!.crit).toBe(0);
  }
  expect(c('Archer',8).move).toBe(0);expect(c('Archer',8).attacks[0]!.shots[0]!.components).toEqual([{type:'physical',amount:6},{type:'fire',amount:6}]);
  expect(c('Archer',3).attacks[0]!.minRange).toBe(0); // Close-range disadvantage is not an illegal shot.
 });
});
