import {expect,it} from 'vitest';
import {createMatch,createCreature} from '../packages/engine/src/index.js';
import {summonProfile} from '../packages/content/src/summons.js';
import {resolveCombatAction,beginAttack,stepAttack} from '../packages/engine/src/combat.js';
import {startScenarioTurn} from '../packages/scenario/src/casting.js';
import {startCast,validateCast,completeCast} from '../packages/engine/src/casting.js';
import {encodeSnapshot,restoreSnapshot} from '../packages/persistence/src/snapshot.js';
import {restrained} from '../packages/engine/src/status.js';
import {applyDamage} from '../packages/engine/src/damage.js';
import {reverseIllusion} from '../packages/engine/src/illusions.js';
import {reanimatedProfile} from '../packages/engine/src/reanimation.js';
import type {CastAction,SpellFamily} from '../packages/domain/src/spells.js';
function setup(){const s=createMatch('control-casters',['a','b'],789);s.creatures[0]!.centre={q:2,r:2};s.creatures[1]!.centre={q:20,r:15};return s;}
it('vine uses two distinct tendrils at reach two against equal-sized targets and cannot take a third hold',()=>{
 let s=setup();const vine=createCreature('vine','a',{q:10,r:10},summonProfile('Summon Plant',2)!);s.creatures.push(vine);
 for(let i=0;i<3;i++)s.creatures.push(createCreature(`target-${i}`,'b',{q:12-i,r:10+i},{dex:0}));
 for(let i=0;i<3;i++){s.random.resolution=4;resolveCombatAction(s,vine,{type:'Grapple',targetId:`target-${i}`},[]);}
 expect(s.holds.map(h=>[h.targetId,h.limb])).toEqual([['target-0',0],['target-1',1]]);
 s=restoreSnapshot(encodeSnapshot(s));expect(restrained(s,s.creatures.find(c=>c.id==='vine')!)).toBe(true);
 expect(restrained(s,s.creatures.find(c=>c.id==='target-2')!)).toBe(false);
 s.random.resolution=2;resolveCombatAction(s,s.creatures.find(c=>c.id==='target-0')!,'Escape',[]);expect(s.holds.map(h=>h.targetId)).toEqual(['target-1']);
});
it.each([false,true])('Spectre Wither requires damage and retains reversible illusion provenance (%s)',illusion=>{
 let s=setup();const spectre=createCreature('spectre','a',{q:10,r:10},{...summonProfile('Summon Spirit',4)!,...(illusion?{kind:'illusion' as const,creatorId:'wizard-0',knownIllusionBy:['a']}:{} )});
 const victim=createCreature('victim','b',{q:11,r:10},{incapacitated:true,intelligence:5});s.creatures.push(spectre,victim);s=startScenarioTurn(s);s.random.resolution=4;
 beginAttack(s,spectre,{type:'Attack',attackId:'basic',targetIds:['victim'],ground:null,side:'left'},'guard');
 const resumed=restoreSnapshot(encodeSnapshot(s));stepAttack(s,[]);stepAttack(resumed,[]);expect(encodeSnapshot(resumed)).toBe(encodeSnapshot(s));
 const target=s.creatures.find(c=>c.id==='victim')!;expect(target.conditions).toContainEqual(expect.objectContaining({kind:'Subdued',potency:4,endsTurn:1,illusionId:illusion?'spectre':null}));
 if(illusion){reverseIllusion(s,'spectre',[]);expect(target.hp).toBe(10);expect(target.conditions).toEqual([]);}
});
it('Spectre immunity stops mundane damage and magic immunity prevents Wither on the victim',()=>{
 let s=setup();const spectre=createCreature('spectre','a',{q:10,r:10},summonProfile('Summon Spirit',4)!);s.creatures.push(spectre);
 expect(applyDamage(s,spectre,[{type:'physical',amount:20}],[])).toBe(0);expect(applyDamage(s,spectre,[{type:'light',amount:2}],[])).toBe(3);
 s.creatures.push(createCreature('immune','b',{q:11,r:10},{incapacitated:true,defences:[{type:'magic',multiplier:0}]}));s=startScenarioTurn(s);
 beginAttack(s,spectre,{type:'Attack',attackId:'basic',targetIds:['immune'],ground:null,side:'left'},'guard');stepAttack(s,[]);expect(s.creatures.find(c=>c.id==='immune')!.conditions).toEqual([]);
});
const casters:[SpellFamily,number,number,number,SpellFamily][]=[['Summon Goblin',5,25,3,'Darkness'],['Summon Plant',7,35,4,'Tangleweed'],['Summon Spirit',8,40,6,'Darkness']];
it.each(casters)('%s level %i pays from its own mana, respects its cap and restores its pending cast',(family,level,mana,cap,spell)=>{
 let s=setup();const caster=createCreature('caster','a',{q:10,r:10},summonProfile(family,level)!);s.creatures.push(caster);s=startScenarioTurn(s);
 const a:CastAction={type:'Cast',spell,level:1,variant:'bound',targetId:null,ground:{q:14,r:10},side:'left',...(spell==='Tangleweed'?{hexes:[{q:14,r:10}]}:{})};
 const c=s.creatures.find(c=>c.id==='caster')!;expect(c.mana).toBe(mana);validateCast(s,c,a);
 expect(()=>validateCast(s,c,{...a,level:cap+1})).toThrow('SPELL_NOT_KNOWN');
 startCast(s,c,a,[]);expect(c.mana).toBe(mana-5);expect(s.creatures[0]!.mana).toBe(100);
 const restored=restoreSnapshot(encodeSnapshot(s));const cast=s.casts[0]!;s.phase=cast.duePhase;restored.phase=cast.duePhase;
 completeCast(s,cast.id,[]);completeCast(restored,cast.id,[]);expect(encodeSnapshot(restored)).toBe(encodeSnapshot(s));
 expect(reanimatedProfile(c,false).spellbook).toBeUndefined();
 const illusion=createCreature('fake','a',{q:10,r:10},{...summonProfile(family,level)!,kind:'illusion'});
 expect(()=>validateCast(s,illusion,a)).toThrow('SPELL_NOT_KNOWN');
});
it('vine cannot grapple a larger creature even with a free limb',()=>{
 const s=setup(),vine=createCreature('vine','a',{q:10,r:10},summonProfile('Summon Plant',2)!),target=createCreature('large','b',{q:12,r:10},{size:3});s.creatures.push(vine,target);s.random.resolution=4;
 resolveCombatAction(s,vine,{type:'Grapple',targetId:target.id},[]);expect(s.holds).toEqual([]);expect(s.random.resolution).toBe(4);
});
it('Spectre crosses creatures and ordinary walls in transit, but not Energy walls or occupied endpoints',async()=>{
 const {stepLegality}=await import('../packages/geometry/src/occupancy.js');const {arenaOf}=await import('../packages/engine/src/orders.js');
 const s=setup(),spectre=createCreature('spectre','a',{q:10,r:10},summonProfile('Summon Spirit',4)!);s.creatures.push(spectre,createCreature('blocker','b',{q:11,r:10}));
 s.walls.push({id:'wall',edge:{a:{q:10,r:10},b:{q:11,r:10}},material:'stone',hp:11,maxHp:11,burning:null});
 expect(stepLegality(arenaOf(s),spectre,spectre.centre,{q:11,r:10},true).legal).toBe(true);
 expect(stepLegality(arenaOf(s),spectre,spectre.centre,{q:11,r:10},false).legal).toBe(false);
 s.walls[0]!.material='energy';expect(stepLegality(arenaOf(s),spectre,spectre.centre,{q:11,r:10},true).legal).toBe(false);
});
it('explicitly migrates content v2 without changing creature data, RNG, pending attack or phase activity',async()=>{
 const {readFileSync}=await import('node:fs');const {migrateAttackTraitContent}=await import('../packages/persistence/src/migration.js');
 const text=readFileSync('tests/fixtures/traits-content-v2-guard.json','utf8'),old=JSON.parse(text),next=migrateAttackTraitContent(text);
 expect(()=>restoreSnapshot(text)).toThrow();expect(next.contentVersion).toBe('treant-0.1');
 for(const key of ['random','pendingAttack','actedThisPhase'] as const)expect(next[key]).toEqual(old[key]);
 expect(next.creatures).toEqual(old.creatures.map((c:object)=>({...c,reload:null,canMarkQuarry:false,quarryTargetId:null,bristles:0,lifeDrain:0})));
 const direct=structuredClone(next),restored=restoreSnapshot(encodeSnapshot(next));stepAttack(direct,[]);stepAttack(restored,[]);expect(encodeSnapshot(restored)).toBe(encodeSnapshot(direct));
 expect(()=>migrateAttackTraitContent(JSON.stringify({...old,contentVersion:'unknown'}))).toThrow();
});
