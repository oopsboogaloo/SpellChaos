import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { createMatch, createCreature, applyCommand, applySystemCommand, systemCommand } from '../packages/engine/src/index.js';
import { cleanupDeaths } from '../packages/engine/src/lifecycle.js';
import { canReanimate, reanimatedProfile, reanimate } from '../packages/engine/src/reanimation.js';
import { startCast, completeCast, interruptCast, selectOrigin } from '../packages/engine/src/casting.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { damageCorpse, damageMultiplier } from '../packages/engine/src/damage.js';
import { encodeSnapshot, restoreSnapshot, canonical } from '../packages/persistence/src/snapshot.js';
import { migrateCastingSnapshot, migrateEnvironmentSnapshot } from '../packages/persistence/src/migration.js';
import { stateSchema as legacySchema } from '../packages/domain/src/legacy-v4.js';
import { summonProfile } from '../packages/content/src/summons.js';
import { projectView } from '../packages/views/src/index.js';
import type { Creature, GameState } from '../packages/domain/src/state.js';
import type { CastAction } from '../packages/domain/src/spells.js';
import type { Event } from '../packages/engine/src/events.js';

const h = (q:number,r:number) => ({q,r});
function setup(overrides:Partial<Creature> = {}):GameState {
 const s = createMatch('reanimation',['a','b'],5);
 s.creatures[0]!.centre=h(5,5);s.creatures[0]!.spellbook=['Reanimate'];s.creatures[1]!.centre=h(15,15);
 const body=createCreature('body','b',h(8,5),{...summonProfile('Summon Serpent',1)!,...overrides});
 body.hp=-body.maxHp;s.creatures.push(body);cleanupDeaths(s,[]);
 return s;
}
const action=(level=1,targetId='corpse:body'):CastAction=>({type:'Cast',spell:'Reanimate',level,targetId,ground:null,variant:'bound',side:'left'});
function draft(s:GameState,a:CastAction=action(),late=false):GameState {
 return applyCommand(s,{matchId:s.matchId,playerId:'a',turn:s.turn,expectedRevision:s.revision,commandId:`draft-${s.revision}`,type:'SetOrder',order:{creatureId:'wizard-0',path:[],early:late?null:a,late:late?a:null}}).state;
}
function start(s:GameState):GameState {
 for(const p of s.players)s=applyCommand(s,{matchId:s.matchId,playerId:p.id,turn:s.turn,expectedRevision:s.revision,commandId:`lock-${s.revision}`,type:'LockTurn'}).state;
 return applySystemCommand(s,systemCommand(s,'StartResolution',`start-${s.revision}`)).state;
}
function run(s:GameState,restore=false) {
 const events:Event[]=[];
 for(let steps=0;!['planning','ended'].includes(s.phase);steps++){
  if(steps>200)throw new Error('STEP_LIMIT');
  if(restore)s=restoreSnapshot(encodeSnapshot(s));
  const result=advanceAtomicStep(s);s=result.state;events.push(...result.events);
 }
 return {state:s,events};
}
function complete(s:GameState,level=1):Event[] {
 s.phase='early';const events:Event[]=[];startCast(s,s.creatures[0]!,action(level),events);
 s.phase='late';s.random.resolution=1;completeCast(s,s.casts[0]!.id,events);return events;
}

describe('Reanimate body and casting rules',()=>{
 it.each([1,2,3,4,5,6,7,8])('uses Slow casting, level %i cost and binding, and one casting roll',level=>{
  const s=setup({summonLevel:level}),events=complete(s,level),servant=s.creatures.at(-1)!;
  expect(servant.kind).toBe('reanimated');expect(servant.bindingLevel).toBe(level);expect(servant.summonLevel).toBe(level);
  expect(servant.controller).toBe('a');expect(servant.readyTurn).toBe(2);expect(s.creatures[0]!.mana).toBe(100-5*level);
  expect(s.balanceUnits).toBe(-2*level);expect(s.random.resolution).toBe(270369);
  expect(events.map(e=>e.type)).toEqual(['CastStarted','CastSucceeded','CreatureReanimated']);
 });
 it('retains body attacks and wings while stripping poison, mana, familiar, regeneration and escape traits',()=>{
  const s=setup({height:'air',move:7,dex:7,regeneration:3,nimble:true,doubleAction:true,mana:25,maxMana:25,manaRegen:1,spellbook:['Fire Bolt'],spellLevelCap:3});
  complete(s);const servant=s.creatures.at(-1)!;
  expect(servant).toMatchObject({kind:'reanimated',height:'air',size:1,con:3,hp:3,maxHp:3,move:3,dex:3,intelligence:2,undead:true,undeadClass:'zombie',restorationUsed:true,familiar:false,nimble:false,doubleAction:false,regeneration:0,mana:0,maxMana:0,manaRegen:0,spellLevelCap:0,spellbook:[],conditions:[]});
  expect(servant.attacks[0]!.shots[0]!.components).toEqual([{type:'physical',amount:1}]);
  expect(servant.attacks[0]!.shots[0]!.secondary).toEqual([]);expect(damageMultiplier(servant,'physical')).toBe(.5);
 });
 it('skeletons retain Move and Dex after cumulative fire/acid reaches half original HP',()=>{
  const s=setup({size:2,con:5,maxHp:10,hp:10,move:5,dex:7,fireAcidDamage:4});
  expect(s.corpses[0]!.skeletal).toBe(false);damageCorpse(s,'corpse:body',[{type:'acid',amount:1}]);
  complete(s);const servant=s.creatures.at(-1)!;
  expect(servant).toMatchObject({move:5,dex:7,hp:10,undeadClass:'skeleton',fireAcidDamage:5});
  expect(damageMultiplier(servant,'physical')).toBe(.25);
 });
 it('uses explicit body attack selection and does not turn dragonet Spark into an undead power',()=>{
  const s=setup(summonProfile('Summon Dragon',1)!);complete(s);
  expect(s.creatures.at(-1)!.attacks).toEqual([]);expect(s.creatures.at(-1)!.height).toBe('air');
  const body=s.creatures[2]!;body.reanimationAttackIds=['basic'];expect(reanimatedProfile(body,false).attacks).toHaveLength(1);
 });
 it('preserves zero movement and rounds positive half statistics down to at least one',()=>{
  const body=setup({move:0,dex:1}).creatures[2]!;
  expect(reanimatedProfile(body,false)).toMatchObject({move:0,dex:1});
 });
 it('does not refresh restoration eligibility on the original or descendant corpse',()=>{
  const s=setup();complete(s);expect(s.corpses[0]!.restorationUsed).toBe(true);
  expect(canReanimate(s,'corpse:body',8,'a')).toBe(false);
  const servant=s.creatures.at(-1)!;servant.hp=-servant.maxHp;cleanupDeaths(s,[]);
  expect(s.corpses.at(-1)!.restorationUsed).toBe(true);expect(canReanimate(s,s.corpses.at(-1)!.id,8,'a')).toBe(false);
  expect(()=>reanimate(s,'corpse:body',8,'a','illegal')).toThrow('INVALID_REANIMATION');
 });
 it.each([{plant:true},{construct:true},{swarm:true},{kind:'illusion' as const},{corpseEligible:false}])('rejects excluded corpse categories %j',overrides=>{
  const s=setup(overrides);expect(s.corpses).toEqual([]);expect(()=>draft(s)).toThrow('INVALID_SPELL_TARGET');
 });
 it('rejects living creatures, unknown corpses, ground targets and corpses above spell level',()=>{
  const s=setup({summonLevel:4});
  for(const a of [action(),action(8,'body'),action(8,'missing'),{...action(8),targetId:null,ground:h(8,5)}])expect(()=>draft(s,a)).toThrow();
  expect(()=>draft(s,action(4))).not.toThrow();s.creatures[2]!.alive=true;expect(canReanimate(s,'corpse:body',8,'a')).toBe(false);
 });
 it('cannot raise eliminated wizards, including with level 8',()=>{
  const s=setup();s.creatures[1]!.hp=-10;cleanupDeaths(s,[]);
  expect(canReanimate(s,'corpse:wizard-1',8,'a')).toBe(false);expect(s.players[1]!.eliminated).toBe(true);
 });
 it('checks whole-footprint placement at planning and completion without relocation',()=>{
  const s=setup({size:3,con:5,maxHp:15});s.creatures.push(createCreature('blocker','b',h(9,5)));
  expect(()=>draft(s)).toThrow('INVALID_SPELL_TARGET');s.creatures.at(-1)!.centre=h(12,5);
  expect(()=>draft(s)).not.toThrow();s.phase='early';startCast(s,s.creatures[0]!,action(),[]);
  s.creatures.at(-1)!.centre=h(9,5);s.phase='late';const events:Event[]=[];completeCast(s,s.casts[0]!.id,events);
  expect(events[0]!.type).toBe('CastFailed');expect(s.creatures[0]!.mana).toBe(95);expect(s.balanceUnits).toBe(-1);expect(s.corpses[0]!.restorationUsed).toBe(false);
 });
 it('keeps the opportunity after interruption or a failed casting roll',()=>{
  const s=setup();s.phase='early';startCast(s,s.creatures[0]!,action(),[]);interruptCast(s,s.casts[0]!.id,[],'cancelled');
  expect(s.corpses[0]!.restorationUsed).toBe(false);expect(s.creatures[0]!.mana).toBe(95);
  startCast(s,s.creatures[0]!,action(8),[]);s.phase='late';s.random.resolution=5;const events:Event[]=[];
  completeCast(s,s.casts[0]!.id,events);expect(events[0]!.type).toBe('CastFailed');expect(s.corpses[0]!.restorationUsed).toBe(false);
 });
 it('allows only the first successful competing cast to consume a corpse',()=>{
  const s=setup();s.creatures[1]!.centre=h(10,5);s.phase='early';
  for(const wizard of s.creatures.slice(0,2))startCast(s,wizard,action(),[]);
  expect(s.casts).toHaveLength(2);s.phase='late';const events:Event[]=[];
  for(const cast of [...s.casts]){s.random.resolution=1;completeCast(s,cast.id,events);}
  expect(s.creatures.filter(c=>c.kind==='reanimated')).toHaveLength(1);
  expect(events.filter(e=>e.type==='CastFailed')).toHaveLength(1);expect(s.creatures[1]!.mana).toBe(95);
 });
 it('uses a real familiar origin and collapses servants on controller death',()=>{
  const s=setup();s.creatures[0]!.centre=h(20,20);s.creatures.push(createCreature('origin','a',h(6,5),summonProfile('Summon Cat',1)!));
  expect(selectOrigin(s,s.creatures[0]!,action())!.id).toBe('origin');complete(s);
  const servant=s.creatures.at(-1)!;s.creatures[0]!.hp=-10;cleanupDeaths(s,[]);
  expect(servant.alive).toBe(false);expect(s.corpses.find(c=>c.creatureId===servant.id)!.restorationUsed).toBe(true);
 });
});

describe('reanimation persistence and permitted views',()=>{
 it.each(['planning','casting','restored'])('explicitly migrates the published v5 %s fixture and preserves continuation',name=>{
  const text=readFileSync(`tests/fixtures/reanimation-v5-${name}.json`,'utf8').trim();
  expect(()=>restoreSnapshot(text)).toThrow();const s=migrateEnvironmentSnapshot(text);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
  const ready=s.phase==='planning'?start(s):s;expect(run(ready,true)).toEqual(run(ready));
 });
 it('rejects negative or non-finite corpse exposure without changing skeletal state',()=>{
  const s=setup(),before=encodeSnapshot(s);
  for(const amount of [-1,NaN,Infinity,.5])expect(()=>damageCorpse(s,'corpse:body',[{type:'fire',amount}])).toThrow('INVALID_DAMAGE');
  expect(encodeSnapshot(s)).toBe(before);
 });
 it('restores every atomic boundary including late-to-next-turn casting, across seeds',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:100000}),fc.boolean(),(seed,late)=>{
   let s=setup();s.random.resolution=seed;s=start(draft(s,action(),late));
   const direct=run(s),resumed=run(s,true);expect(resumed).toEqual(direct);
   if(late){const next=start(direct.state);expect(run(next,true)).toEqual(run(next));}
  }),{seed:6001,numRuns:25});
 },30000);
 it('explicitly migrates the frozen v4 fixture without altering RNG or corpse data',()=>{
  const text=readFileSync('tests/fixtures/casting-v4.json','utf8').trim();const old=legacySchema.parse(JSON.parse(text));
  expect(canonical(old)).toBe(text);expect(()=>restoreSnapshot(text)).toThrow();
  const s=migrateCastingSnapshot(text);expect(s.schemaVersion).toBe(12);expect(s.random).toEqual(old.random);expect(s.corpses).toEqual(old.corpses);
  expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
  expect(()=>migrateCastingSnapshot(encodeSnapshot(s))).toThrow();
 });
 it('rejects malformed body attack references and pending corpse references transactionally',()=>{
  let s=start(draft(setup()));while(!s.casts.length)s=advanceAtomicStep(s).state;
  const original=encodeSnapshot(s),bad=JSON.parse(original);bad.casts[0].action.targetId='missing-corpse';
  expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();bad.casts[0].action.targetId='corpse:body';bad.creatures[2].reanimationAttackIds=['missing-attack'];
  expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();expect(encodeSnapshot(s)).toBe(original);
 });
 it('exposes corpse targeting information without exact HP, exposure or hidden spell orders',()=>{
  const s=draft(setup()),view=projectView(s,'b');
  expect(view.corpses).toEqual([{id:'corpse:body',centre:h(8,5),size:1,skeletal:false,restorationUsed:false}]);
  expect(view.orders).toEqual([]);expect(view.casts).toEqual([]);
 });
});
