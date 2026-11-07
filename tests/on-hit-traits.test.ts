import {migrateOnHitSnapshot} from '../packages/persistence/src/migration.js';
import {expect,it} from 'vitest';
import {createMatch,createCreature} from '../packages/engine/src/index.js';
import {summonProfile} from '../packages/content/src/summons.js';
import {beginAttack,stepAttack} from '../packages/engine/src/combat.js';
import {startScenarioTurn} from '../packages/scenario/src/casting.js';
import {encodeSnapshot,restoreSnapshot} from '../packages/persistence/src/snapshot.js';
import {reverseIllusion} from '../packages/engine/src/illusions.js';
import {reanimatedProfile} from '../packages/engine/src/reanimation.js';
import type {Creature,GameState} from '../packages/domain/src/state.js';
import type {Event} from '../packages/engine/src/events.js';
function setup(){const s=createMatch('on-hit',['a','b'],678);s.creatures[0]!.centre={q:2,r:2};s.creatures[1]!.centre={q:20,r:15};return s;}
function strike(s:GameState,attacker:Creature,target:Creature){
 s=startScenarioTurn(s);beginAttack(s,attacker,{type:'Attack',attackId:attacker.attacks[0]!.id,targetIds:[target.id],ground:null,side:'left'},'guard');
 let restored=restoreSnapshot(encodeSnapshot(s));const events:Event[]=[];
 while(s.pendingAttack){const a:Event[]=[],b:Event[]=[];stepAttack(s,a);restored=restoreSnapshot(encodeSnapshot(restored));stepAttack(restored,b);expect(b).toEqual(a);expect(encodeSnapshot(restored)).toBe(encodeSnapshot(s));events.push(...a);}
 return {s,events};
}
it.each(['melee','projectile','zero'] as const)('Bristles triggers only on a damaging melee hit (%s)',mode=>{
 const s=setup(),thorn=createCreature('thorn','b',{q:10,r:10},{...summonProfile('Summon Plant',3)!,incapacitated:true});
 const a=createCreature('attacker','a',{q:12,r:10},{bristles:1});a.attacks[0]!.range=5;a.attacks[0]!.shots[0]!.crit=0;a.attacks[0]!.shots[0]!.components[0]!.amount=mode==='zero'?0:4;if(mode==='projectile')a.attacks[0]!.mode='projectile';s.creatures.push(a,thorn);
 const result=strike(s,a,thorn);expect(result.s.creatures.find(c=>c.id===a.id)!.hp).toBe(mode==='melee'?9:10);
 expect(result.s.creatures.find(c=>c.id===thorn.id)!.hp).toBe(mode==='zero'?15:13); // No recursive retaliation.
 if(mode==='melee')expect(result.events.find(e=>e.type==='AttackFinished')!.damageByTarget).toContainEqual({targetId:a.id,amount:1});
});
it('Bristles still retaliates against a lethal damaging hit, and illusion retaliation reverses',()=>{
 const s=setup(),thorn=createCreature('thorn','b',{q:10,r:10},{...summonProfile('Summon Plant',3)!,kind:'illusion',creatorId:'wizard-1',knownIllusionBy:['b'],incapacitated:true,hp:-14});
 const a=createCreature('attacker','a',{q:12,r:10});a.attacks[0]!.range=2;a.attacks[0]!.shots[0]!.crit=0;s.creatures.push(a,thorn);
 const result=strike(s,a,thorn);expect(result.events.some(e=>e.type==='DamageApplied'&&e.creatureId===a.id)).toBe(true);
 expect(result.s.creatures.find(c=>c.id===thorn.id)!.alive).toBe(false);expect(result.s.creatures.find(c=>c.id===a.id)!.hp).toBe(10);
});
it.each(['living','undead','construct','illusion','immune'] as const)('Wraith drains only damaging hits on a living real target (%s)',kind=>{
 const s=setup(),wraith=createCreature('wraith','a',{q:10,r:10},{...summonProfile('Summon Spirit',5)!,hp:6});wraith.attacks[0]!.shots[0]!.crit=0;
 const target=createCreature('target','b',{q:11,r:10},{incapacitated:true,undead:kind==='undead',construct:kind==='construct',...(kind==='illusion'?{kind:'illusion' as const,creatorId:'wizard-1',knownIllusionBy:['b']}:{}),...(kind==='immune'?{defences:[{type:'magic' as const,multiplier:0 as const}]}:{})});s.creatures.push(wraith,target);
 const result=strike(s,wraith,target);expect(result.s.creatures.find(c=>c.id===wraith.id)!.hp).toBe(kind==='living'?8:6);
});
it('illusory Wraith can restore its own HP but cannot make its damage real',()=>{
 const s=setup(),wraith=createCreature('wraith','a',{q:10,r:10},{...summonProfile('Summon Spirit',5)!,kind:'illusion',creatorId:'wizard-0',knownIllusionBy:['a'],hp:11});wraith.attacks[0]!.shots[0]!.crit=0;
 const target=createCreature('target','b',{q:11,r:10},{incapacitated:true});s.creatures.push(wraith,target);
 const result=strike(s,wraith,target);expect(result.s.creatures.find(c=>c.id===wraith.id)!.hp).toBe(12);
 reverseIllusion(result.s,wraith.id,[]);expect(result.s.creatures.find(c=>c.id===target.id)!.hp).toBe(10);
});
it('new on-hit state rejects negative values and reanimation does not gain life drain',()=>{
 const s=setup();s.creatures[0]!.bristles=-1;expect(()=>encodeSnapshot(s)).toThrow();
 const wraith=createCreature('wraith','a',{q:10,r:10},summonProfile('Summon Spirit',5)!);
 expect(createCreature('body','a',{q:10,r:10},reanimatedProfile(wraith,false)).lifeDrain).toBe(0);
});
it.each(['bristles','drain'])('permanent %s fixture resumes exactly through all attack boundaries',async name=>{
 const {readFileSync}=await import('node:fs');const text=readFileSync(`tests/fixtures/onhit-v12-${name}.json`,'utf8').trim();
 const a=migrateOnHitSnapshot(text);let b=restoreSnapshot(encodeSnapshot(a));expect(()=>restoreSnapshot(text)).toThrow();
 while(a.pendingAttack){const ea:Event[]=[],eb:Event[]=[];stepAttack(a,ea);b=restoreSnapshot(encodeSnapshot(b));stepAttack(b,eb);expect(ea).toEqual(eb);expect(encodeSnapshot(a)).toBe(encodeSnapshot(b));}
 expect(a.creatures.find(c=>c.id==='attacker')!.hp).toBe(name==='bristles'?9:8);
});
it('Wraith can drain a living plant while its physical immunity prevents Bristles damage',()=>{
 const s=setup(),wraith=createCreature('wraith','a',{q:12,r:10},{...summonProfile('Summon Spirit',5)!,hp:6}),thorn=createCreature('thorn','b',{q:10,r:10},{...summonProfile('Summon Plant',3)!,incapacitated:true});wraith.attacks[0]!.shots[0]!.crit=0;s.creatures.push(wraith,thorn);
 const result=strike(s,wraith,thorn);expect(result.s.creatures.find(c=>c.id==='wraith')!.hp).toBe(8);expect(result.s.creatures.find(c=>c.id==='thorn')!.hp).toBe(10);
});
it('Bristles incapacitation stops remaining compound-attack bites without another retaliation loop',()=>{
 const s=setup(),hydra=createCreature('hydra','a',{q:14,r:10},{...summonProfile('Summon Serpent',7)!,hp:2}),thorn=createCreature('thorn','b',{q:10,r:10},{...summonProfile('Summon Plant',3)!,incapacitated:true});hydra.attacks[0]!.shots.forEach(shot=>shot.crit=0);s.creatures.push(hydra,thorn);
 const result=strike(s,hydra,thorn);expect(result.s.creatures.find(c=>c.id==='hydra')!.hp).toBe(0);expect(result.s.creatures.find(c=>c.id==='thorn')!.hp).toBe(11);expect(result.events.filter(e=>e.type==='AttackHit')).toHaveLength(2);
});
it('schema-11 content-v3 migration supplies neutral on-hit traits and preserves pending work',async()=>{
 const {readFileSync}=await import('node:fs');const {migrateAttackTraitContent}=await import('../packages/persistence/src/migration.js');
 const text=readFileSync('tests/fixtures/traits-content-v3-guard.json','utf8'),old=JSON.parse(text),next=migrateAttackTraitContent(text);
 expect(()=>restoreSnapshot(text)).toThrow();expect(next.schemaVersion).toBe(23);expect(next.random).toEqual(old.random);expect(next.pendingAttack).toEqual(old.pendingAttack);
 expect(next.creatures).toEqual(old.creatures.map((c:object)=>({...c,reload:null,canMarkQuarry:false,quarryTargetId:null,bristles:0,lifeDrain:0})));
 expect(restoreSnapshot(encodeSnapshot(next))).toEqual(next);
});
