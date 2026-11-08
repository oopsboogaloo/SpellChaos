import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { createMatch, createCreature, applyCommand, applySystemCommand, systemCommand, checkVictory } from '../packages/engine/src/index.js';
import { applyDamage, addCondition, heal, damageWall, damageCorpse } from '../packages/engine/src/damage.js';
import { cleanupDeaths, ongoingDamage, recover } from '../packages/engine/src/lifecycle.js';
import { detectIllusion, reverseIllusion } from '../packages/engine/src/illusions.js';
import { beginAttack, stepAttack, resolveCombatAction } from '../packages/engine/src/combat.js';
import { startCast, completeCast, selectOrigin } from '../packages/engine/src/casting.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { movementAllowance, arenaOf } from '../packages/engine/src/orders.js';
import { restrained, fearAllowsStep } from '../packages/engine/src/status.js';
import { awardAndRegenerate } from '../packages/engine/src/spellbooks.js';
import { placement } from '../packages/geometry/src/occupancy.js';
import { edge } from '../packages/geometry/src/walls.js';
import { summonProfile } from '../packages/content/src/summons.js';
import { manaCost, successChance } from '../packages/content/src/spells.js';
import { encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { projectView, projectEvents } from '../packages/views/src/index.js';
import type { Creature, GameState, Order } from '../packages/domain/src/state.js';
import type { CastAction } from '../packages/domain/src/spells.js';
import type { Event } from '../packages/engine/src/events.js';

const h=(q:number,r:number)=>({q,r});
function fresh():GameState {
 const s=createMatch('illusions',['a','b'],7001);s.creatures[0]!.centre=h(5,5);s.creatures[1]!.centre=h(20,15);
 s.creatures[0]!.spellbook=['Summon Cat','Disbelief','Healing Bolt','Magic Bolt'];
 return s;
}
function fake(s:GameState,id='fake',overrides:Partial<Creature>={}):Creature {
 const c=createCreature(id,'a',h(8,5),{...summonProfile('Summon Cat',1)!,kind:'illusion',creatorId:'wizard-0',knownIllusionBy:['a'],corpseEligible:false,...overrides});
 s.creatures.push(c);return c;
}
function victim(s:GameState,id='victim',overrides:Partial<Creature>={}):Creature {
 const c=createCreature(id,'b',h(9,5),overrides);s.creatures.push(c);return c;
}
const wound=(s:GameState,c:Creature,amount:number,sourceId:string|null)=>applyDamage(s,c,[{type:'physical',amount}],[],{sourceId});
function remove(s:GameState,c:Creature):Event[]{c.alive=false;const events:Event[]=[];cleanupDeaths(s,events);return events;}
const spell=(name:CastAction['spell'],targetId:string|null='fake',level=1):CastAction=>({type:'Cast',spell:name,level,targetId,ground:null,variant:'bound',side:'left'});
function draft(s:GameState,id:string,early:Order['early'],late:Order['late']=null):GameState {
 return applyCommand(s,{matchId:s.matchId,playerId:s.creatures.find(c=>c.id===id)!.controller!,turn:s.turn,commandId:`draft-${s.revision}`,expectedRevision:s.revision,type:'SetOrder',order:{creatureId:id,path:[],early,late}}).state;
}
function start(s:GameState):GameState {
 for(const p of s.players)s=applyCommand(s,{matchId:s.matchId,playerId:p.id,turn:s.turn,commandId:`lock-${s.revision}`,expectedRevision:s.revision,type:'LockTurn'}).state;
 return applySystemCommand(s,systemCommand(s,'StartResolution',`start-${s.revision}`)).state;
}
function run(s:GameState,restore=false){
 const events:Event[]=[];
 for(let n=0;!['planning','ended'].includes(s.phase);n++){
  if(n>1000)throw new Error('STEP_LIMIT');
  if(restore)s=restoreSnapshot(encodeSnapshot(s));const r=advanceAtomicStep(s);s=r.state;events.push(...r.events);
 }
 return {state:s,events};
}

describe('illusion casting and copied capabilities',()=>{
 it.each([1,2,3,4,5,6,7,8])('has half rounded mana and guaranteed success at level %i',level=>{
  const a={...spell('Summon Cat',null,level),ground:h(8,5),variant:'illusion' as const};
  expect(manaCost(a)).toBe(Math.ceil(5*level/2));for(const balance of [-1000,0,1000])expect(successChance(a,balance)).toBe(100);
 });
 it('summons an illusion without a roll, shifts balance once and keeps the claimed familiar profile',()=>{
  const s=fresh(),a={...spell('Summon Cat',null),ground:h(8,5),variant:'illusion' as const};
  expect(draft(s,'wizard-0',a).reservations[0]!.amount).toBe(3);s.phase='early';startCast(s,s.creatures[0]!,a,[]);
  const rng=s.random.resolution;completeCast(s,s.casts[0]!.id,[]);const c=s.creatures.at(-1)!;
  expect(s.random.resolution).toBe(rng);expect(s.balanceUnits).toBe(2);expect(s.creatures[0]!.mana).toBe(97);
  expect(c).toMatchObject({kind:'illusion',creatorId:'wizard-0',knownIllusionBy:['a'],species:'Cat familiar',move:5,dex:8,familiar:true,readyTurn:2,mana:0,manaRegen:0,spellbook:[],corpseEligible:false});
 });
 it('adds at most two movement steps per turn, including Dash, without changing public Move',()=>{
  const s=fresh(),c=fake(s);const order:Order={creatureId:c.id,path:[],early:null,late:null};
  expect(movementAllowance(c,order)).toBe(7);expect(movementAllowance(c,{...order,early:'Dash'})).toBe(12);
  c.slowed=true;expect(movementAllowance(c,order)).toBe(4);expect(c.move).toBe(5);
  expect(movementAllowance(c,{...order,early:'TotalDefence'})).toBe(0);
 });
 it('cannot cast, supply familiar origins, regenerate mana or grant a familiar mana bonus',()=>{
  const s=fresh(),c=fake(s,'fake',{mana:10,maxMana:20,manaRegen:1,spellbook:['Magic Bolt'],spellLevelCap:8});
  expect(()=>draft(s,c.id,spell('Magic Bolt','wizard-1'))).toThrow('SPELL_NOT_KNOWN');
  s.creatures[0]!.mana=0;awardAndRegenerate(s);expect(c.mana).toBe(10);expect(s.creatures[0]!.mana).toBe(5);
  c.centre=h(18,15);expect(selectOrigin(s,s.creatures[0]!,spell('Magic Bolt','wizard-1'))).toBeNull();
  s.phase='early';startCast(s,c,spell('Magic Bolt','wizard-1'),[]);expect(s.casts).toEqual([]);
 });
 it('blocks ordinary movement through belief but allows Int 0 passage',()=>{
  const s=fresh(),c=fake(s),target=victim(s);expect(placement(arenaOf(s),target,c.centre).legal).toBe(false);
  target.intelligence=0;expect(placement(arenaOf(s),target,c.centre).legal).toBe(true);
 });
 it('Disbelief removes an illusion, restores surviving damage, costs two mana and rolls no dice',()=>{
  const s=fresh(),c=fake(s),target=victim(s);wound(s,target,4,c.id);s.phase='early';const rng=s.random.resolution;
  startCast(s,s.creatures[0]!,spell('Disbelief'),[]);
  expect(c.alive).toBe(false);expect(target.hp).toBe(10);expect(s.corpses).toEqual([]);
  expect(s.creatures[0]!.mana).toBe(98);expect(s.random.resolution).toBe(rng);expect(s.balanceUnits).toBe(0);
 });
 it('ends an illusion on its original caster death even after release or transfer',()=>{
  for(const controller of [null,'b']){
   const s=fresh(),c=fake(s,'fake',{controller,bindingLevel:controller?1:null}),target=victim(s);wound(s,target,4,c.id);
   s.creatures[0]!.hp=-10;cleanupDeaths(s,[]);expect(c.alive).toBe(false);expect(target.hp).toBe(10);
  }
 });
});

describe('reversible loss and permanent death',()=>{
 it('restores only the removing source and preserves real damage and other illusions',()=>{
  const s=fresh(),a=fake(s,'a-fake'),b=fake(s,'b-fake'),target=victim(s);
  wound(s,target,2,null);wound(s,target,3,a.id);wound(s,target,4,b.id);expect(target.hp).toBe(1);
  remove(s,a);expect(target.hp).toBe(4);remove(s,b);expect(target.hp).toBe(8);
  reverseIllusion(s,a.id,[]);expect(target.hp).toBe(8);
 });
 it('heals oldest reversible damage before real damage and cannot double-restore healed loss',()=>{
  const s=fresh(),a=fake(s,'a-fake'),b=fake(s,'b-fake'),target=victim(s);
  wound(s,target,3,null);wound(s,target,3,a.id);wound(s,target,3,b.id);
  heal(s,target,4,[]);expect(s.damageLedger.map(d=>d.remaining)).toEqual([3,0,2]);
  remove(s,a);expect(target.hp).toBe(5);remove(s,b);expect(target.hp).toBe(7);
  heal(s,target,3,[]);expect(s.damageLedger.map(d=>d.remaining)).toEqual([0,0,0]);
 });
 it('caps reversal at maximum HP even for trusted scenarios with separately adjusted HP',()=>{
  const s=fresh(),c=fake(s),target=victim(s);wound(s,target,5,c.id);target.hp=9;remove(s,c);expect(target.hp).toBe(10);
 });
 it('restores damage-incapacitated survivors but never revives shock deaths',()=>{
  const s=fresh(),c=fake(s),survivor=victim(s,'survivor'),dead=victim(s,'dead');
  wound(s,survivor,12,c.id);wound(s,dead,20,c.id);cleanupDeaths(s,[]);remove(s,c);
  expect(survivor.hp).toBe(10);expect(survivor.alive).toBe(true);expect(dead.alive).toBe(false);expect(dead.hp).toBe(-10);
 });
 it.each([['a-fake','z-victim'],['z-fake','a-victim']])('freezes simultaneous deaths independently of ID ordering %s/%s',(sourceId,targetId)=>{
  const s=fresh(),c=fake(s,sourceId),target=victim(s,targetId);wound(s,target,20,c.id);c.hp=-c.maxHp;
  cleanupDeaths(s,[]);expect(target.alive).toBe(false);expect(target.hp).toBe(-10);expect(c.alive).toBe(false);
 });
 it('keeps mutual illusion kills permanent while reversing both sources on surviving creatures',()=>{
  const s=fresh(),a=fake(s,'a-fake'),b=fake(s,'b-fake'),target=victim(s);
  wound(s,target,2,a.id);wound(s,target,3,b.id);wound(s,a,6,b.id);wound(s,b,6,a.id);cleanupDeaths(s,[]);
  expect(a.alive).toBe(false);expect(b.alive).toBe(false);expect(target.hp).toBe(10);expect(s.corpses).toEqual([]);
 });
 it('allows illusions to damage other illusions and restoration to regrow a surviving swarm legally',()=>{
  const s=fresh(),a=fake(s,'a-fake'),b=fake(s,'b-fake',{...summonProfile('Summon Serpent',4)!});
  applyDamage(s,b,[{type:'magic',amount:13}],[],{sourceId:a.id});expect(b.size).toBe(4);
  remove(s,a);expect(b.hp).toBe(24);expect(b.size).toBe(6);
 });
 it('records post-defence amounts and action provenance for each hit of a multiattack',()=>{
  const s=fresh(),c=fake(s),target=victim(s,'victim',{incapacitated:true,defences:[{type:'physical',multiplier:.5}]});
  c.attacks[0]!.shots=[0,1,2].map(()=>({skill:5,crit:0,components:[{type:'physical' as const,amount:3}],secondary:[]}));
  s.phase='early';beginAttack(s,c,{type:'Attack',attackId:'basic',targetIds:[target.id],ground:null,side:'left'},'action');
  const actionId=s.pendingAttack!.actionId;while(s.pendingAttack)stepAttack(s,[]);
  expect(s.damageLedger.map(d=>d.amount)).toEqual([2,2,2]);expect(s.damageLedger.every(d=>d.actionId===actionId&&d.illusionId===c.id)).toBe(true);
  remove(s,c);expect(target.hp).toBe(10);
 });
});

describe('condition and resource provenance',()=>{
 it('preserves real poison when overlapping illusory poison is removed and never doubles ticks',()=>{
  const s=fresh(),c=fake(s),target=victim(s);addCondition(s,target,'Poisoned',c.id,3,3,'con');addCondition(s,target,'Poisoned','wizard-1',5,3,'con');
  ongoingDamage(s,[]);expect(target.hp).toBe(9);expect(s.damageLedger[0]!.illusionId).toBeNull();
  remove(s,c);expect(target.hp).toBe(9);expect(target.conditions).toHaveLength(1);expect(target.conditions[0]!.sourceId).toBe('wizard-1');
 });
 it('refreshes only the matching illusion condition and reverses its ongoing damage',()=>{
  const s=fresh(),a=fake(s,'a-fake'),b=fake(s,'b-fake'),target=victim(s);
  for(const c of [a,b,a])addCondition(s,target,'Poisoned',c.id,3,3,'con');expect(target.conditions).toHaveLength(2);
  ongoingDamage(s,[]);expect(target.hp).toBe(9);remove(s,a);expect(target.hp).toBe(10);
  s.turn=2;ongoingDamage(s,[]);expect(target.hp).toBe(9);remove(s,b);expect(target.hp).toBe(10);expect(target.conditions).toEqual([]);
 });
 it('removes illusory bleeding, restraint and grapples while retaining real holds and conditions',()=>{
  const s=fresh(),c=fake(s,'fake',{grappleLimbs:1}),real=victim(s,'real',{controller:'a',grappleLimbs:1}),target=victim(s);
  addCondition(s,target,'Bleeding',c.id,2,null);addCondition(s,target,'Restrained',c.id,2,null);addCondition(s,target,'Restrained',real.id,2,null);
  s.holds=[{grapplerId:c.id,targetId:target.id,limb:0},{grapplerId:real.id,targetId:target.id,limb:0}];
  remove(s,c);expect(target.conditions.map(e=>e.sourceId)).toEqual([real.id]);expect(s.holds.map(h=>h.grapplerId)).toEqual([real.id]);expect(restrained(s,target)).toBe(true);
 });
 it('blocks all illusory damage and secondary restraints against Int 0 creatures',()=>{
  const s=fresh(),c=fake(s,'fake',{grappleLimbs:1,size:4}),target=victim(s,'mindless',{intelligence:0});
  expect(wound(s,target,50,c.id)).toBe(0);expect(addCondition(s,target,'Restrained',c.id,8,2)).toBe(false);
  resolveCombatAction(s,c,{type:'Grapple',targetId:target.id},[]);expect(s.holds).toEqual([]);expect(target.hp).toBe(10);expect(s.damageLedger).toEqual([]);
 });
 it('cannot burn real corpses or structures, but illusory fire still suppresses current-turn regeneration',()=>{
  const s=fresh(),c=fake(s),target=victim(s,'victim',{regeneration:3});
  applyDamage(s,target,[{type:'fire',amount:3}],[],{sourceId:c.id});expect(target.fireAcidDamage).toBe(0);recover(s,[]);expect(target.hp).toBe(7);
  target.hp=-10;cleanupDeaths(s,[]);damageCorpse(s,'corpse:victim',[{type:'fire',amount:50}],c.id);expect(s.corpses[0]!.skeletal).toBe(false);
  s.walls.push({id:'wall',edge:edge(h(10,10),h(11,10)),material:'wood',hp:8,maxHp:8,burning:null});
  expect(damageWall(s,'wall',[{type:'fire',amount:50}],[],c.id)).toBe(0);expect(s.walls[0]!.hp).toBe(8);
 });
 it('regenerates only its own HP and cannot heal or perform real-resource aid actions',()=>{
  const s=fresh(),c=fake(s,'fake',{regeneration:1}),target=victim(s);wound(s,c,2,null);wound(s,target,2,null);recover(s,[]);
  expect(c.hp).toBe(2);expect(heal(s,target,2,[],'ordinary',c.id)).toBe(0);expect(heal(s,c,2,[])).toBe(0);
  expect(()=>draft(s,c.id,{type:'Treat',targetId:target.id})).toThrow('ILLUSION_CANNOT_MANIPULATE');
 });
 it('considers every remaining Fear source after an illusory Fear is removed',()=>{
  const s=fresh(),c=fake(s),target=victim(s);s.creatures[1]!.centre=h(12,5);
  addCondition(s,target,'Fear',c.id,3,2);addCondition(s,target,'Fear','wizard-1',4,2);
  expect(fearAllowsStep(s,target,h(10,5))).toBe(false);remove(s,c);expect(fearAllowsStep(s,target,h(10,5))).toBe(false);
 });
});

describe('illusion privacy and portable continuation',()=>{
 it.each(['planning','attack','before-disbelief','removed'])('permanent illusion %s fixture restores with exact continuation',name=>{
  const text=readFileSync(`tests/fixtures/illusions-${name}.json`,'utf8').trim(),s=restoreSnapshot(text);
  expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);const ready=s.phase==='planning'?start(s):s;
  expect(run(ready,true)).toEqual(run(ready));
 });
 it('preserves permanent wizard elimination after illusion reversal and rejects tampered resurrection',()=>{
  const s=fresh(),c=fake(s),wizard=s.creatures[1]!;wound(s,wizard,20,c.id);remove(s,c);
  expect(s.players[1]!.eliminated).toBe(true);expect(wizard.alive).toBe(false);checkVictory(s,[]);
  expect(s.result).toEqual({type:'winner',playerId:'a'});const saved=encodeSnapshot(s),bad=JSON.parse(saved);
  bad.creatures.find((x:Creature)=>x.id===c.id).alive=true;expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();
  expect(restoreSnapshot(saved)).toEqual(s);
 });
 it('projects the same apparent stats, species and events until a player learns the truth',()=>{
  const s=fresh(),c=fake(s),real=structuredClone(s);real.creatures.find(x=>x.id===c.id)!.kind='summon';
  expect(projectView(s,'b')).toEqual(projectView(real,'b'));expect(projectView(s,'a').creatures.find(x=>x.id===c.id)).toHaveProperty('illusion',true);
  const events:Event[]=[];expect(detectIllusion(s,c.id,'b',events)).toBe(true);expect(c.alive).toBe(true);
  expect(projectView(s,'b').creatures.find(x=>x.id===c.id)).toHaveProperty('illusion',true);
  expect(projectEvents(s,'a',events)).toEqual([]);expect(projectEvents(s,'b',events)).toHaveLength(1);
  const visible:Event={type:'PhaseStarted',sequence:2,turn:1,phase:'early'};
  expect(projectEvents(s,'a',[...events,visible])).toEqual(projectEvents(real,'a',[{...visible,sequence:1}]));
  detectIllusion(s,c.id,'b',events);expect(events).toHaveLength(1);expect(()=>detectIllusion(s,c.id,'unknown',[])).toThrow();
  expect(detectIllusion(real,c.id,'b',[])).toBe(false);
 });
 it('does not reveal an enemy illusion by rejecting Healing Bolt before casting',()=>{
  const s=fresh(),c=fake(s,'fake',{controller:'b',creatorId:'wizard-1',knownIllusionBy:['b']});c.hp=1;
  expect(()=>draft(s,'wizard-0',spell('Healing Bolt'))).not.toThrow();s.phase='early';s.random.resolution=1;startCast(s,s.creatures[0]!,spell('Healing Bolt'),[]);
  expect(c.hp).toBe(1);expect(s.creatures[0]!.mana).toBe(95);
  detectIllusion(s,c.id,'a',[]);s.phase='planning';expect(()=>draft(s,'wizard-0',spell('Healing Bolt'))).toThrow('INVALID_SPELL_TARGET');
 });
 it('restores multi-hit provenance and Disbelief identically at every boundary over generated seeds',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:100000}),seed=>{
   let s=fresh();s.random.resolution=seed;const c=fake(s),target=victim(s);
   c.attacks[0]!.shots=[...c.attacks[0]!.shots,...c.attacks[0]!.shots];
   s=draft(s,c.id,{type:'Attack',attackId:'basic',targetIds:[target.id],ground:null,side:'left'});s=draft(s,'wizard-0',null,spell('Disbelief'));s=start(s);
   expect(run(s,true)).toEqual(run(s));
  }),{seed:7001,numRuns:30});
 },30000);
 it('rejects missing sources, invalid remaining loss and leaked player references without replacing a save',()=>{
  const s=fresh(),c=fake(s),target=victim(s);wound(s,target,3,c.id);const original=encodeSnapshot(s),bad=JSON.parse(original);
  bad.damageLedger[0].illusionId='missing';expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();bad.damageLedger[0].illusionId=c.id;
  bad.damageLedger[0].remaining=4;expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();bad.damageLedger[0].remaining=3;
  bad.creatures[2].knownIllusionBy=['unknown'];expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();bad.creatures[2].knownIllusionBy=['a'];
  bad.damageLedger[0].components=[];expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();expect(encodeSnapshot(s)).toBe(original);
 });
});
