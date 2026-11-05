import { startScenarioTurn } from '../packages/scenario/src/casting.js';
import { expect,it } from 'vitest';
import { createMatch,createCreature } from '../packages/engine/src/index.js';
import { beginAttack,stepAttack,creatureAttackModifiers } from '../packages/engine/src/combat.js';
import { summonProfile } from '../packages/content/src/summons.js';
import { approvedBlueprint } from '../packages/content/src/roster.js';
import { encodeSnapshot,restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
function setup(){const s=createMatch('traits',['a','b'],123);s.creatures[0]!.centre={q:2,r:2};s.creatures[1]!.centre={q:20,r:15};return startScenarioTurn(s);}
it('Brace deals two additional Guard damage through the production attack resolver and restore',()=>{
 const s=setup(),a=createCreature('hob','a',{q:10,r:10},summonProfile('Summon Goblin',4)!),b=createCreature('victim','b',{q:11,r:10},{hp:30,maxHp:30,incapacitated:true});s.creatures.push(a,b);a.attacks[0]!.shots[0]!.crit=0;
 beginAttack(s,a,{type:'Attack',attackId:'basic',targetIds:[b.id],ground:null,side:'left'},'guard');
 const restored=restoreSnapshot(encodeSnapshot(s));stepAttack(s,[]);stepAttack(restored,[]);
 expect(b.hp).toBe(24);expect(encodeSnapshot(restored)).toBe(encodeSnapshot(s));
});
it('Aim and longbow close disadvantage read planned and actual movement and target distance',()=>{
 const s=setup(),a=createCreature('bow','a',{q:10,r:10},summonProfile('Summon Archer',3)!),b=createCreature('target','b',{q:12,r:10});s.creatures.push(a,b);
 expect(creatureAttackModifiers(s,a,b,'action')).toMatchObject({skill:2,disadvantage:true});
 s.orders.push({creatureId:a.id,path:[{q:11,r:10}],early:null,late:null});expect(creatureAttackModifiers(s,a,b,'action').skill).toBe(0);
 s.phase='late';expect(creatureAttackModifiers(s,a,b,'action').skill).toBe(2);s.moved.push(a.id);expect(creatureAttackModifiers(s,a,b,'action').skill).toBe(0);
});
it('Rally excludes self, enemies and incapacitated sources and never stacks',()=>{
 const s=setup(),a=createCreature('king','a',{q:10,r:10},approvedBlueprint('Goblin',7)!.profile),b=createCreature('target','b',{q:20,r:10});s.creatures.push(a,b);
 expect(creatureAttackModifiers(s,a,b,'action').skill).toBe(0);
 for(let i=0;i<2;i++)s.creatures.push(createCreature(`ally-${i}`,'a',{q:11-i,r:10+i},{attackTraits:{...a.attackTraits,rallySource:true}}));
 expect(creatureAttackModifiers(s,a,b,'action').skill).toBe(1);
 s.creatures.find(c=>c.id==='ally-0')!.incapacitated=true;s.creatures.find(c=>c.id==='ally-1')!.controller='b';expect(creatureAttackModifiers(s,a,b,'action').skill).toBe(0);
});
it('Ambush sees phase-local activity, survives restore and resets at the phase boundary',()=>{
 let s=setup();const a=createCreature('adder','a',{q:10,r:10},summonProfile('Summon Serpent',2)!),b=createCreature('target','b',{q:11,r:10});s.creatures.push(a,b);
 expect(creatureAttackModifiers(s,a,b,'action').advantage).toBe(true);s.actedThisPhase.push(b.id);s.spentActions.push(b.id);
 s=restoreSnapshot(encodeSnapshot(s));expect(creatureAttackModifiers(s,a,b,'action').advantage).toBe(false);
 s.cursor.initialized=true;s.cursor.entries=[];s.quickQueue=[];s=advanceAtomicStep(s).state;
 expect(s.actedThisPhase).toEqual([]);expect(s.spentActions).toContain(b.id);
 expect(creatureAttackModifiers(s,a,b,'action').advantage).toBe(true);
});
it('rejects duplicate or unknown phase activity and missing runtime traits',()=>{
 const s=setup();for(const ids of [['unknown'],['wizard-0','wizard-0']])expect(()=>restoreSnapshot(JSON.stringify({...s,actedThisPhase:ids}))).toThrow();
 const raw=JSON.parse(encodeSnapshot(s));delete raw.creatures[0].attackTraits;expect(()=>restoreSnapshot(JSON.stringify(raw))).toThrow();
});
it('pending attack fixtures retain traits and phase history through exact continuation',async()=>{
 const {readFileSync}=await import('node:fs');
 for(const name of ['guard','ambush']){
  const text=readFileSync(`tests/fixtures/traits-v11-${name}.json`,'utf8').trim();
  const a=restoreSnapshot(text),b=restoreSnapshot(encodeSnapshot(a));expect(encodeSnapshot(a)).toBe(text);
  for(let n=0;a.pendingAttack;n++){if(n>10)throw new Error('ATTACK_LOOP');const ea:import('../packages/engine/src/events.js').Event[]=[],eb:import('../packages/engine/src/events.js').Event[]=[];stepAttack(a,ea);stepAttack(b,eb);expect(ea).toEqual(eb);expect(encodeSnapshot(a)).toBe(encodeSnapshot(b));}
 }
});
it('reanimation retains ordinary combat traits but removes the command aura',async()=>{
 const {reanimatedProfile}=await import('../packages/engine/src/reanimation.js');
 const archer=createCreature('bow','a',{q:10,r:10},summonProfile('Summon Archer',3)!);
 expect(reanimatedProfile(archer,true).attackTraits).toMatchObject({aim:true,closeDisadvantageBelow:3,rallySource:false});
 const king=createCreature('king','a',{q:10,r:10},approvedBlueprint('Goblin',7)!.profile);
 expect(reanimatedProfile(king,false).attackTraits?.rallySource).toBe(false);
});
