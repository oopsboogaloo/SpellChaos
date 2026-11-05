import { describe,it,expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { createMatch,createCreature,applyCommand,applySystemCommand,systemCommand,type Event } from '../packages/engine/src/index.js';
import { advanceAtomicStep,isDefending } from '../packages/engine/src/resolver.js';
import { castActionSchema,spellFamilies,type CastAction,type CastingTime } from '../packages/domain/src/spells.js';
import type { GameState,Order } from '../packages/domain/src/state.js';
import { castingRoll,selectOrigin,startCast,completeCast,interruptCast,forceMove,concentration,invalidateCasts } from '../packages/engine/src/casting.js';
import { alignment,manaCost,successChance,spellRange,completionAt,startingPool,damageSpells,utilitySpells } from '../packages/content/src/spells.js';
import { summonProfile } from '../packages/content/src/summons.js';
import { startingBook,awardAndRegenerate } from '../packages/engine/src/spellbooks.js';
import { beginAttack,stepAttack } from '../packages/engine/src/combat.js';
import { addCondition,applyDamage } from '../packages/engine/src/damage.js';
import { cleanupDeaths } from '../packages/engine/src/lifecycle.js';
import { encodeSnapshot,restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { migrateCombatSnapshot,migrateCastingSnapshot } from '../packages/persistence/src/migration.js';
import { projectView } from '../packages/views/src/index.js';
const h=(q:number,r:number)=>({q,r});
function fresh(seed=5):GameState {const s=createMatch('casting',['a','b'],seed);s.creatures[0]!.centre=h(5,5);s.creatures[1]!.centre=h(10,5);for(const c of s.creatures)c.spellbook=[...spellFamilies];return s;}
const cast=(spell:CastAction['spell']='Magic Bolt',overrides:Partial<CastAction>={}):CastAction=>({type:'Cast',spell,level:1,variant:'bound',targetId:'wizard-1',ground:null,side:'left',...overrides});
const summon=(variant:'bound'|'unbound'='bound'):CastAction=>cast('Summon Cat',{targetId:null,ground:h(7,5),variant});
function command(s:GameState,playerId:string,payload:Record<string,unknown>){return {matchId:s.matchId,turn:s.turn,playerId,commandId:`c${s.revision}`,expectedRevision:s.revision,...payload};}
function submit(s:GameState,id:string,early:Order['early'],path:Order['path']=[],late:Order['late']=null):GameState {return applyCommand(s,command(s,s.creatures.find(c=>c.id===id)!.controller!,{type:'SetOrder',order:{creatureId:id,path,early,late}})).state;}
function start(s:GameState):GameState {for(const p of s.players.filter(p=>!p.locked))s=applyCommand(s,command(s,p.id,{type:'LockTurn'})).state;return applySystemCommand(s,systemCommand(s,'StartResolution',`start-${s.turn}`)).state;}
function run(s:GameState,restore=false){const events:Event[]=[];for(let n=0;!['planning','ended'].includes(s.phase);n++){if(n>1000)throw new Error('STEP_LIMIT');if(restore)s=restoreSnapshot(encodeSnapshot(s));const r=advanceAtomicStep(s);s=r.state;events.push(...r.events);}return {state:s,events};}
function direct(s:GameState,a:CastAction,timing?:CastingTime):Event[]{s.phase='early';s.random.resolution=1;const events:Event[]=[];startCast(s,s.creatures[0]!,a,events,timing);return events;}

describe('spell formulas and books',()=>{
 it.each([1,2,3,4,5,6,7,8])('uses approved costs, chances and ranges at level %i',level=>{
  const a=cast('Fire Bolt',{level});expect(manaCost(a)).toBe(5*level);expect(successChance(a,0)).toBe(95-8*level);
  expect(successChance(a,80)).toBe(85-8*level);expect(successChance(a,-80)).toBe(Math.min(95,105-8*level));
  expect(manaCost({...summon('unbound'),level})).toBe(Math.ceil(5*level/2));expect(successChance({...summon('unbound'),level},0)).toBe(Math.min(95,115-8*level));
  expect(manaCost(cast('Disbelief',{level}))).toBe(2);expect(successChance(cast('Disbelief',{level}),0)).toBe(100);
  expect(spellRange(cast('Magic Bolt',{level}))).toBe(6+level);expect(spellRange(cast('Teleport',{level}))).toBe(2+2*level);
 });
 it('keeps fractional alignment modifiers and clamps probability',()=>{
  expect(successChance(cast('Fire Bolt'),1)).toBeCloseTo(87-10/40.5);
  expect(successChance(cast('Fire Bolt'),-1000000)).toBe(95);
  const s=fresh();s.random.resolution=1;expect(castingRoll(s,27.0368)).toBe(false);s.random.resolution=1;expect(castingRoll(s,27.037)).toBe(true);
 });
 it('uniformly samples only valid ten-family subsets plus guaranteed extras',()=>{
  expect(startingPool).toHaveLength(16);
  for(let seed=1;seed<=200;seed++){
   const {book}=startingBook(seed);expect(book).toHaveLength(13);expect(new Set(book).size).toBe(13);
   expect(book).toEqual(expect.arrayContaining(['Bind','Release','Disbelief']));expect(book.filter(s=>s.startsWith('Summon ')).length).toBeGreaterThanOrEqual(2);
   expect(book.some(s=>damageSpells.includes(s))).toBe(true);expect(book.some(s=>utilitySpells.includes(s))).toBe(true);
   expect(book.every(s=>spellFamilies.includes(s))).toBe(true);expect(startingBook(seed)).toEqual(startingBook(seed));
  }
 });
 it('awards unknown families on the third turn, or capped mana when exhausted',()=>{
  const s=fresh(),c=s.creatures[0]!;c.spellbook=['Bind'];c.mana=0;s.turn=2;awardAndRegenerate(s);expect(c.spellbook).toEqual(['Bind']);expect(c.mana).toBe(5);
  s.turn=3;awardAndRegenerate(s);expect(c.spellbook).toHaveLength(2);expect(new Set(c.spellbook).size).toBe(2);
  c.spellbook=[...spellFamilies];c.mana=80;awardAndRegenerate(s);expect(c.mana).toBe(95);awardAndRegenerate(s);expect(c.mana).toBe(100);
 });
 it('regenerates creature mana separately and grants at most one nearby real familiar bonus',()=>{
  const s=fresh(),wizard=s.creatures[0]!;wizard.mana=0;
  s.creatures.push(createCreature('f1','a',h(6,5),summonProfile('Summon Cat',1)!),createCreature('f2','a',h(7,5),summonProfile('Summon Cat',1)!),createCreature('mage','b',h(15,10),{mana:20,maxMana:25,manaRegen:1,spellLevelCap:3,spellbook:['Fire Bolt']}));
  awardAndRegenerate(s);expect(wizard.mana).toBe(6);expect(s.creatures[4]!.mana).toBe(21);
  s.creatures[2]!.kind='illusion';s.creatures[3]!.centre=h(15,5);awardAndRegenerate(s);expect(wizard.mana).toBe(11);
 });
});

describe('reservation and command validation',()=>{
 it('reserves drafts, replaces them, clears without payment and spends only on start',()=>{
  let s=fresh();s=submit(s,'wizard-0',cast('Fire Bolt',{level:4}));expect(s.reservations[0]!.amount).toBe(20);expect(s.creatures[0]!.mana).toBe(100);
  s=submit(s,'wizard-0',cast('Fire Bolt',{level:2}));expect(s.reservations[0]!.amount).toBe(10);
  s=applyCommand(s,command(s,'a',{type:'ClearOrder',creatureId:'wizard-0'})).state;expect(s.reservations).toEqual([]);expect(s.creatures[0]!.mana).toBe(100);
  s=submit(s,'wizard-0',cast('Fire Bolt',{level:2}));s=start(s);
  while(!s.castOccupied.length)s=advanceAtomicStep(s).state;
  expect(s.creatures[0]!.mana).toBe(90);expect(s.reservations).toEqual([]);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
 });
 it('rejects unknown spells, levels, unsupported content, bad variants and overspending',()=>{
  const s=fresh();s.creatures[0]!.mana=5;
  expect(()=>submit(s,'wizard-0',cast('Fire Bolt',{level:2}))).toThrow('INSUFFICIENT_MANA');
  expect(()=>submit(s,'wizard-0',cast('Fire Bolt',{variant:'unbound'}))).toThrow('INVALID_SPELL_TARGET_OR_VARIANT');
  expect(()=>submit(s,'wizard-0',cast('Summon Goblin',{targetId:null,ground:h(7,5)}))).toThrow('CONTENT_NOT_AVAILABLE');
  expect(()=>submit(s,'wizard-0',{...summon(),level:8})).toThrow('CONTENT_NOT_AVAILABLE');
  expect(()=>castActionSchema.parse({...cast(),level:9})).toThrow();s.creatures[0]!.spellbook=[];expect(()=>submit(s,'wizard-0',cast())).toThrow('SPELL_NOT_KNOWN');
 });
 it('reserves both Double Action slots without overspending',()=>{
  const s=fresh();s.creatures[0]!.doubleAction=true;s.creatures[0]!.mana=60;
  expect(()=>submit(s,'wizard-0',cast('Fire Bolt',{level:8}),[],cast('Magic Bolt',{level:8}))).toThrow('INSUFFICIENT_MANA');
  expect(submit(s,'wizard-0',cast('Fire Bolt',{level:4}),[],cast('Magic Bolt',{level:4})).reservations[0]!.amount).toBe(40);
 });
 it('rejects movement and extra slots through a Slow cast, but allows movement before late casting',()=>{
  const s=fresh();s.creatures.push(createCreature('target',null,h(7,5)));
  const bind=cast('Bind',{targetId:'target'});expect(()=>submit(s,'wizard-0',bind,[h(6,5)])).toThrow('CASTING_IMMOBILE');
  s.creatures[0]!.doubleAction=true;expect(()=>submit(s,'wizard-0',bind,[],cast())).toThrow('CASTING_OCCUPIES_ACTION');
  expect(submit(s,'wizard-0',null,[h(6,5)],bind).orders).toHaveLength(1);
 });
 it('enforces creature spell caps independently of summon level and excludes illusion casters',()=>{
  const s=fresh();s.creatures.push(createCreature('mage','a',h(5,6),{mana:25,maxMana:25,spellLevelCap:3,summonLevel:5,spellbook:['Fire Bolt']}));
  expect(submit(s,'mage',cast('Fire Bolt',{level:3})).reservations[0]!.amount).toBe(15);
  expect(()=>submit(s,'mage',cast('Fire Bolt',{level:4}))).toThrow('SPELL_NOT_KNOWN');s.creatures[2]!.kind='illusion';expect(()=>submit(s,'mage',cast('Fire Bolt'))).toThrow('SPELL_NOT_KNOWN');
 });
});

describe('timing and concentration',()=>{
 it('calculates Instant, Quick, Slow and two/three-turn ritual completion positions',()=>{
  expect(completionAt(1,'early','instant')).toEqual({turn:1,phase:'early'});expect(completionAt(1,'late','quick')).toEqual({turn:1,phase:'late'});
  expect(completionAt(1,'early','slow')).toEqual({turn:1,phase:'late'});expect(completionAt(1,'late','slow')).toEqual({turn:2,phase:'early'});
  expect(completionAt(1,'early','ritual2')).toEqual({turn:2,phase:'late'});expect(completionAt(1,'early','ritual3')).toEqual({turn:3,phase:'late'});expect(()=>completionAt(1,'late','ritual3')).toThrow('RITUAL_EARLY_ONLY');
 });
 it('Quick summons resolve after every ordinary/Slowed action and act only next turn',()=>{
  let s=fresh();s.creatures[0]!.dex=10;s.creatures[1]!.slowed=true;s=submit(s,'wizard-0',summon());s=start(s);s.random.resolution=1;
  const result=run(s,true),events=result.events;const completion=events.findIndex(e=>e.type==='CastSucceeded');
  expect(completion).toBeGreaterThan(events.findIndex(e=>e.type==='ActionResolved'&&e.creatureId==='wizard-1'&&e.phase==='early'));
  const pet=result.state.creatures.find(c=>c.id.startsWith('summon-'))!;expect(pet).toBeDefined();expect(pet.readyTurn).toBe(2);
  expect(events.some(e=>e.type==='ActionResolved'&&e.creatureId===pet.id)).toBe(false);expect(result.state.balanceUnits).toBe(2);
 });
 it('Slow early casts complete late at caster initiative, including with one normal action',()=>{
  let s=fresh();s.creatures.push(createCreature('target',null,h(7,5)));s=submit(s,'wizard-0',cast('Bind',{targetId:'target'}));
  const result=run(start(s),true);expect(result.events.find(e=>['CastSucceeded','CastFailed'].includes(e.type))!.phase).toBe('late');expect(result.state.casts).toEqual([]);
 });
 it('restores a late Slow cast in the next turn and consumes the completion slot',()=>{
  let s=fresh();s.creatures.push(createCreature('target',null,h(7,5)));s=submit(s,'wizard-0',null,[],cast('Bind',{targetId:'target'}));s=run(start(s),true).state;
  expect(s.casts).toHaveLength(1);expect(s.casts[0]!.dueTurn).toBe(2);expect(()=>submit(s,'wizard-0',cast())).toThrow('CASTING_OCCUPIES_ACTION');
  s=submit(s,'wizard-0',null,[h(5,6)]);s=start(s);expect(isDefending(s,'wizard-0','early')).toBe(false);
  const result=run(s,true);expect(result.events.find(e=>['CastSucceeded','CastFailed'].includes(e.type))!.phase).toBe('early');expect(result.state.creatures[0]!.centre).toEqual(h(5,6));
 });
 it('runs a scripted three-turn ritual without Double Action acceleration or movement',()=>{
  let s=start(fresh());s.creatures[0]!.doubleAction=true;startCast(s,s.creatures[0]!,cast('Magic Bolt'),[],'ritual3');
  for(let turn=1;turn<=3;turn++){
   if(turn>1)s=start(s);
   const result=run(s,true);s=result.state;
   if(turn<3){expect(s.casts).toHaveLength(1);expect(result.events.some(e=>e.type==='CastSucceeded')).toBe(false);}else expect(result.events.find(e=>['CastSucceeded','CastFailed'].includes(e.type))!.phase).toBe('late');
  }
  expect(s.casts).toEqual([]);
 });
 it('interrupts once on forced movement, retaining full paid mana and half alignment shift',()=>{
  const s=fresh();s.creatures.push(createCreature('target',null,h(7,5)));direct(s,cast('Bind',{level:4,targetId:'target'}));const events:Event[]=[];
  expect(s.creatures[0]!.mana).toBe(80);forceMove(s,s.creatures[0]!,h(5,6),events);invalidateCasts(s,events);
  expect(s.casts).toEqual([]);expect(s.balanceUnits).toBe(4);expect(s.creatures[0]!.mana).toBe(80);expect(events.filter(e=>e.type==='CastInterrupted')).toHaveLength(1);expect(s.reactions).toEqual([]);
 });
 it('checks concentration once using total multiattack damage, never on zero damage',()=>{
  const s=fresh();s.creatures[1]!.centre=h(6,5);const caster=s.creatures[0]!,attacker=s.creatures[1]!;
  s.creatures.push(createCreature('target',null,h(7,5)));direct(s,cast('Bind',{targetId:'target'}));
  attacker.attacks[0]!.shots=[{skill:99,crit:0,components:[{type:'physical',amount:1}],secondary:[]},{skill:99,crit:0,components:[{type:'physical',amount:1}],secondary:[]}];
  beginAttack(s,attacker,{type:'Attack',attackId:'staff',targetIds:[caster.id],ground:null,side:'left'},'action');const events:Event[]=[];
  while(s.pendingAttack)stepAttack(s,events);
  expect(events.filter(e=>e.type==='ConcentrationChecked')).toHaveLength(1);
  expect(events.find(e=>e.type==='ConcentrationChecked')!.amount).toBe(events.filter(e=>e.type==='DamageApplied').reduce((n,e)=>n+e.amount!,0));
  const before=s.random.resolution;concentration(s,[{targetId:caster.id,amount:0}],events);expect(s.random.resolution).toBe(before);
 });
 it('incapacitation interrupts without rolling and wizard death invalidates casts',()=>{
  const s=fresh();s.creatures.push(createCreature('target',null,h(7,5)));direct(s,cast('Bind',{targetId:'target'}));const before=s.random.resolution;
  applyDamage(s,s.creatures[0]!,[{type:'physical',amount:10}],[]);const events:Event[]=[];concentration(s,[{targetId:'wizard-0',amount:10}],events);expect(s.casts).toEqual([]);expect(s.random.resolution).toBe(before);expect(events.some(e=>e.type==='ConcentrationChecked')).toBe(false);
 });
 it('cancels an ongoing cast through an idempotent owned command with no refund',()=>{
  let s=fresh();s.creatures.push(createCreature('target',null,h(7,5)));s=submit(s,'wizard-0',null,[],cast('Bind',{targetId:'target'}));s=run(start(s)).state;
  const mana=s.creatures[0]!.mana,cmd=command(s,'a',{type:'CancelCast',creatureId:'wizard-0'});s=applyCommand(s,cmd).state;
  expect(s.casts).toEqual([]);expect(s.creatures[0]!.mana).toBe(mana);expect(s.balanceUnits).toBe(1);expect(applyCommand(s,cmd).state).toEqual(s);
 });
});

describe('familiar origins and spell effects',()=>{
 it('selects the nearest eligible origin without distance limit, preferring wizard then oldest familiar',()=>{
  const s=fresh();s.creatures[1]!.centre=h(20,10);s.creatures.push(createCreature('older','a',h(18,10),{...summonProfile('Summon Cat',1)!,createdSequence:1}),createCreature('newer','a',h(19,9),{...summonProfile('Summon Cat',1)!,createdSequence:2}));
  expect(selectOrigin(s,s.creatures[0]!,cast())!.id).toBe('older');s.creatures[0]!.centre=h(20,8);expect(selectOrigin(s,s.creatures[0]!,cast())!.id).toBe('wizard-0');
  s.creatures[0]!.centre=h(5,5);s.creatures[2]!.kind='illusion';expect(selectOrigin(s,s.creatures[0]!,cast())!.id).toBe('newer');
 });
 it('locks the familiar through a Slow cast and interrupts on binding loss or death',()=>{
  for(const loss of ['binding','death'] as const){
   const s=fresh();s.creatures[1]!.centre=h(20,10);s.creatures.push(createCreature('familiar','a',h(18,10),summonProfile('Summon Cat',1)!),createCreature('target',null,h(20,11)));
   direct(s,cast('Bind',{targetId:'target'}));expect(s.casts[0]!.originId).toBe('familiar');
   if(loss==='binding'){s.creatures[2]!.controller=null;s.creatures[2]!.bindingLevel=null;}else{s.creatures[2]!.hp=-3;cleanupDeaths(s,[]);}
   invalidateCasts(s,[]);expect(s.casts).toEqual([]);expect(s.balanceUnits).toBe(1);
  }
 });
 it('launches intercepted missiles from the familiar while charging the wizard',()=>{
  const s=fresh();s.creatures[1]!.centre=h(20,10);s.creatures.push(createCreature('familiar','a',h(16,10),summonProfile('Summon Cat',1)!),createCreature('interceptor','a',h(18,10),{incapacitated:true}));
  direct(s,cast());expect(s.creatures[0]!.mana).toBe(95);expect(s.creatures[2]!.mana).toBe(0);expect(s.creatures[3]!.hp).toBeLessThan(10);expect(s.creatures[1]!.hp).toBe(10);
 });
 it('Healing Bolt restores L+3 and removes Bleeding, bypassing interception',()=>{
  const s=fresh();s.creatures[1]!.hp=1;addCondition(s,s.creatures[1]!,'Bleeding',null,1,null);s.creatures.push(createCreature('blocker','a',h(7,5)));
  direct(s,cast('Healing Bolt',{level:2}));expect(s.creatures[1]!.hp).toBe(6);expect(s.creatures[1]!.conditions).toEqual([]);expect(s.balanceUnits).toBe(4);
  s.creatures[1]!.undead=true;expect(()=>submit(fresh(),'wizard-0',cast('Healing Bolt',{targetId:'missing'}))).toThrow('INVALID_SPELL_TARGET');
 });
 it('Teleport has no Guard trigger and checks the entire destination footprint',()=>{
  const s=fresh();direct(s,cast('Teleport',{ground:h(5,7),targetId:null}));expect(s.creatures[0]!.centre).toEqual(h(5,7));expect(s.reactions).toEqual([]);
  const t=fresh();t.creatures[1]!.centre=h(7,5);direct(t,cast('Teleport',{ground:h(7,5),targetId:null}));expect(t.creatures[0]!.centre).toEqual(h(5,5));expect(t.creatures[0]!.mana).toBe(95);
 });
 it('Bind and Release apply Int resistance, enforce binding levels and cancel old orders',()=>{
  const s=fresh();s.creatures.push(createCreature('target','b',h(7,5),{intelligence:0,bindingLevel:4}));
  expect(()=>submit(s,'wizard-0',cast('Bind',{targetId:'target',level:4}))).toThrow('INVALID_SPELL_TARGET');
  direct(s,cast('Bind',{targetId:'target',level:8}));s.phase='late';s.random.resolution=1;completeCast(s,s.casts[0]!.id,[]);expect(s.creatures[2]!.controller).toBe('a');expect(s.creatures[2]!.bindingLevel).toBe(8);expect(s.balanceUnits).toBe(16);
  direct(s,cast('Release',{targetId:'target',level:8}));expect(s.creatures[2]!.controller).toBeNull();expect(s.creatures[2]!.bindingLevel).toBeNull();expect(s.balanceUnits).toBe(16);
 });
 it('a resisted Bind still shifts balance as successful casting',()=>{
  const s=fresh();s.creatures.push(createCreature('target',null,h(7,5),{intelligence:100}));direct(s,cast('Bind',{targetId:'target'}));s.phase='late';s.random.resolution=1;const events:Event[]=[];completeCast(s,s.casts[0]!.id,events);
  expect(events.some(e=>e.type==='SpellResisted')).toBe(true);expect(s.balanceUnits).toBe(2);expect(s.creatures[2]!.controller).toBeNull();
 });
 it('blocked summon placement consumes full paid mana and half alignment without relocating',()=>{
  const s=fresh();direct(s,summon());s.creatures.push(createCreature('blocker','b',h(7,5)));completeCast(s,s.casts[0]!.id,[]);
  expect(s.creatures).toHaveLength(3);expect(s.creatures[0]!.mana).toBe(95);expect(s.balanceUnits).toBe(1);
 });
 it('Summon Only costs rounded half, creates an unbound familiar, and uses only one casting roll',()=>{
  const s=fresh();direct(s,summon('unbound'));s.random.resolution=1;const copy=structuredClone(s);castingRoll(copy,95);completeCast(s,s.casts[0]!.id,[]);
  const pet=s.creatures[2]!;expect(pet.controller).toBeNull();expect(pet.bindingLevel).toBeNull();expect(s.creatures[0]!.mana).toBe(97);expect(s.random.resolution).toBe(copy.random.resolution);
 });
 it('Disbelief costs two mana, consumes no dice and does nothing to real targets',()=>{
  const s=fresh();s.creatures[1]!.centre=h(8,5);direct(s,cast('Disbelief'));expect(s.creatures[0]!.mana).toBe(98);expect(s.creatures[1]!.hp).toBe(10);expect(s.random.resolution).toBe(1);expect(s.balanceUnits).toBe(0);
 });
});

describe('casting portability and privacy',()=>{
 it('matches uninterrupted resolution after restore at every spell boundary across seeds',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:0xffffffff}),seed=>{
   let s=fresh(seed);s=submit(s,'wizard-0',summon());s=submit(s,'wizard-1',cast('Fire Bolt',{targetId:'wizard-0'}));s=start(s);expect(run(s,true)).toEqual(run(s));
  }),{seed:5005,numRuns:40});
 },30000);
 it('keeps opponents spellbooks, mana, reservations and full cast records private',()=>{
  let s=fresh();s=submit(s,'wizard-0',summon());const a=projectView(s,'a'),b=projectView(s,'b');
  expect(a.creatures[0]!.mana).toBe(100);expect(b.creatures[0]).not.toHaveProperty('mana');expect(b.creatures[0]).not.toHaveProperty('spellbook');expect(b.reservations).toEqual([]);
  s=start(s);while(!s.casts.length)s=advanceAtomicStep(s).state;
  expect(projectView(s,'a').casts).toHaveLength(1);expect(projectView(s,'b').casts).toEqual([]);
 });
 it('explicitly migrates legacy combat saves without silently changing their version',()=>{
  const text=readFileSync('tests/fixtures/combat-v3-multiattack.json','utf8');expect(()=>restoreSnapshot(text)).toThrow();
  const s=migrateCombatSnapshot(text);expect(s.schemaVersion).toBe(11);expect(s.creatures[0]!.spellbook).toHaveLength(13);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
 });
});

it('Magic Attack rolls independently against Int and spreads once across teams without chaining',()=>{
 const s=fresh();s.creatures[0]!.centre=h(5,5);s.creatures[1]!.centre=h(10,5);s.creatures[1]!.family='Cat';
 s.creatures.push(createCreature('same-family-ally','a',h(13,5),{family:'Cat',intelligence:0}),createCreature('beyond-original','b',h(17,5),{family:'Cat'}),createCreature('other-family','b',h(11,6),{family:'Serpent'}));
 const events=direct(s,cast('Magic Attack',{level:1}));
 expect(events.filter(e=>e.type==='DamageApplied'||e.type==='SpellMissed')).toHaveLength(2);
 expect(s.creatures[3]!.hp).toBe(10);expect(s.creatures[4]!.hp).toBe(10);
 expect(s.creatures[2]!.hp).toBeLessThan(10);
});
it('solid crystal walls block Magic Attack family spread while original targeting uses sight',()=>{
 const s=fresh();s.creatures[1]!.centre=h(7,5);s.creatures[1]!.family='Cat';s.creatures.push(createCreature('behind-crystal','b',h(9,5),{family:'Cat',incapacitated:true}));
 s.walls.push({id:'crystal',material:'crystal',edge:{a:h(8,5),b:h(9,5)},hp:17,maxHp:17,burning:null});
 direct(s,cast('Magic Attack'));expect(s.creatures[2]!.hp).toBe(10);
});
it('Fire Bolt ignites flammable creatures only after positive damage',()=>{
 const s=fresh();s.creatures[1]!.incapacitated=true;s.creatures[1]!.flammable=true;direct(s,cast('Fire Bolt'));expect(s.creatures[1]!.conditions[0]!.kind).toBe('Burning');expect(s.creatures[1]!.conditions[0]!.startsTurn).toBe(2);
 const t=fresh();t.creatures[1]!.incapacitated=true;t.creatures[1]!.flammable=true;t.creatures[1]!.defences=[{type:'fire',multiplier:0}];direct(t,cast('Fire Bolt'));expect(t.creatures[1]!.conditions).toEqual([]);
});
it('invalid targets before casting starts cost no mana, but invalid completion costs full mana',()=>{
 const s=fresh();s.creatures[1]!.centre=h(25,15);const events=direct(s,cast());expect(events[0]!.type).toBe('CastInvalid');expect(s.creatures[0]!.mana).toBe(100);
 const t=fresh();t.creatures.push(createCreature('target',null,h(7,5)));direct(t,cast('Bind',{targetId:'target'}));t.creatures[2]!.centre=h(25,15);t.phase='late';completeCast(t,t.casts[0]!.id,[]);expect(t.creatures[0]!.mana).toBe(95);expect(t.balanceUnits).toBe(1);
});
it('evaluates casting probability against balance at completion and shifts once on failure',()=>{
 const s=fresh();direct(s,summon());s.balanceUnits=-80;
 // Choose a deterministic draw between Law L1 chances at B=-40 (77) and B=0 (87).
 let seed=1;for(;seed<10000;seed++){const trial=structuredClone(s);trial.random.resolution=seed;if(!castingRoll(trial,77)){trial.random.resolution=seed;if(castingRoll(trial,87))break;}}
 expect(seed).toBeLessThan(10000);s.random.resolution=seed;completeCast(s,s.casts[0]!.id,[]);expect(s.creatures).toHaveLength(2);expect(s.balanceUnits).toBe(-79);
});
it('each Quick completion observes earlier alignment changes and keeps deterministic phase order',()=>{
 let s=fresh();s.creatures[0]!.dex=9;s.creatures[1]!.dex=1;s.creatures[1]!.centre=h(12,5);
 s=submit(s,'wizard-0',summon());s=submit(s,'wizard-1',cast('Summon Serpent',{targetId:null,ground:h(11,5)}));
 const result=run(start(s),true);expect(result.events.filter(e=>['CastSucceeded','CastFailed'].includes(e.type)).map(e=>e.creatureId)).toEqual(['wizard-0','wizard-1']);
});
it('new early summons block movement before they receive any action',()=>{
 let s=fresh();s.creatures[1]!.centre=h(8,5);s.creatures[0]!.dex=10;s=submit(s,'wizard-0',summon());s=submit(s,'wizard-1',null,[h(7,5),h(6,5)]);s=start(s);s.random.resolution=1;
 const result=run(s,true);expect(result.state.creatures.some(c=>c.id.startsWith('summon-'))).toBe(true);expect(result.state.creatures[1]!.centre).toEqual(h(8,5));
});
it('familiar origin loss never silently switches to another eligible familiar',()=>{
 const s=fresh();s.creatures[1]!.centre=h(20,10);s.creatures.push(createCreature('origin','a',h(18,10),{...summonProfile('Summon Cat',1)!,createdSequence:1}),createCreature('backup','a',h(17,10),{...summonProfile('Summon Cat',1)!,createdSequence:2}),createCreature('target',null,h(21,10)));
 direct(s,cast('Bind',{targetId:'target'}));expect(s.casts[0]!.originId).toBe('origin');s.creatures[2]!.hp=0;invalidateCasts(s,[]);expect(s.casts).toEqual([]);expect(s.balanceUnits).toBe(1);
});
it('a locked familiar cannot move during a long cast or grant remote origin while incapacitated',()=>{
 let s=fresh();s.creatures[1]!.centre=h(20,10);s.creatures.push(createCreature('origin','a',h(18,10),summonProfile('Summon Cat',1)!),createCreature('target',null,h(21,10)));
 s=start(s);startCast(s,s.creatures[0]!,cast('Bind',{targetId:'target'}),[],'ritual3');s=run(s,true).state;
 expect(()=>submit(s,'origin',null,[h(18,11)])).toThrow('CASTING_IMMOBILE');s.creatures[2]!.hp=0;expect(selectOrigin(s,s.creatures[0]!,cast('Bind',{targetId:'target'}))).toBeNull();
});
it('wizard death interrupts its cast once and unbinds its real summoned familiar',()=>{
 const s=fresh();s.creatures.push(createCreature('pet','a',h(6,5),summonProfile('Summon Cat',1)!),createCreature('target',null,h(7,5)));direct(s,cast('Bind',{level:2,targetId:'target'}));s.creatures[0]!.hp=-10;const events:Event[]=[];cleanupDeaths(s,events);cleanupDeaths(s,events);
 expect(s.casts).toEqual([]);expect(s.balanceUnits).toBe(2);expect(s.creatures[2]!.controller).toBeNull();expect(s.creatures[2]!.bindingLevel).toBeNull();expect(events.filter(e=>e.type==='CastInterrupted')).toHaveLength(1);
});
it('malformed schedules, origin references and reservation ledgers fail before replacing a save',()=>{
 let s=fresh();s.creatures.push(createCreature('target',null,h(7,5)));s=submit(s,'wizard-0',cast('Bind',{targetId:'target'}));const bad=structuredClone(s);bad.reservations=[];expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();s=start(s);
 while(!s.casts.length)s=advanceAtomicStep(s).state;
 for(const mutate of [(t:GameState)=>{t.casts[0]!.originId='missing';},(t:GameState)=>{t.casts[0]!.dueTurn+=3;},(t:GameState)=>{t.casts[0]!.paid=0;},(t:GameState)=>{t.quickQueue=['missing'];}]){const t=structuredClone(s);mutate(t);expect(()=>restoreSnapshot(JSON.stringify(t))).toThrow();}
 expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
});
it('a familiar bonus needs a living nearby familiar, not multiple active bonuses',()=>{
 const s=fresh();s.creatures[0]!.mana=0;s.creatures.push(createCreature('resting-familiar','a',h(6,5),{...summonProfile('Summon Cat',1)!,hp:0}));awardAndRegenerate(s);expect(s.creatures[0]!.mana).toBe(6);
});

it('plans normal movement from an early Teleport destination and records actual movement',()=>{
 let s=fresh();s.creatures[0]!.dex=9;
 s=submit(s,'wizard-0',cast('Teleport',{targetId:null,ground:h(5,7)}),[h(6,7)]);s=start(s);s.random.resolution=1;
 // Queue construction may consume randomness; set the cast's known-success seed at its actor step.
 s=advanceAtomicStep(s).state;s.random.resolution=1;
 const result=run(s,true);expect(result.state.creatures[0]!.centre).toEqual(h(6,7));expect(result.events.some(e=>e.type==='CreatureTeleported')).toBe(true);
});
it('Teleport preserves restraint and Fear restrictions rather than granting an unstated escape',()=>{
 const s=fresh();s.creatures[0]!.restrained=true;expect(()=>submit(s,'wizard-0',cast('Teleport',{targetId:null,ground:h(5,7)}))).toThrow('INVALID_TELEPORT_DESTINATION');
 s.creatures[0]!.restrained=false;addCondition(s,s.creatures[0]!,'Fear','wizard-1',3,2);expect(()=>submit(s,'wizard-0',cast('Teleport',{targetId:null,ground:h(7,5)}))).toThrow('INVALID_TELEPORT_DESTINATION');
});
it.each(['undead','illusion'] as const)('Healing Bolt rejects %s targets during planning',kind=>{
 const s=fresh();if(kind==='undead')s.creatures[1]!.undead=true;else {s.creatures[1]!.kind='illusion';s.creatures[1]!.knownIllusionBy=['a'];}
 expect(()=>submit(s,'wizard-0',cast('Healing Bolt'))).toThrow('INVALID_SPELL_TARGET');
});
it('cannot complete a long cast before its scheduled turn and phase',()=>{
 const s=fresh();s.creatures.push(createCreature('target',null,h(7,5)));direct(s,cast('Bind',{targetId:'target'}));expect(()=>completeCast(s,s.casts[0]!.id,[])).toThrow('CAST_NOT_DUE');expect(s.casts).toHaveLength(1);
});

it('upgrading an existing friendly binding preserves its already-planned orders',()=>{
 let s=fresh();s.creatures.push(createCreature('target','a',h(7,5),{intelligence:0,bindingLevel:1}));s=submit(s,'target',null,[h(8,5)]);direct(s,cast('Bind',{targetId:'target',level:8}));s.phase='late';s.random.resolution=1;completeCast(s,s.casts[0]!.id,[]);
 expect(s.creatures[2]!.bindingLevel).toBe(8);expect(s.orders.find(o=>o.creatureId==='target')!.path).toEqual([h(8,5)]);
});
it('permanent planning, Quick, Slow and ritual fixtures migrate explicitly and continue after restore',()=>{
 for(const name of ['planning','slow','ritual','quick']){
  const text=readFileSync(`tests/fixtures/casting-v4-${name}.json`,'utf8').trim();expect(()=>restoreSnapshot(text)).toThrow();const s=migrateCastingSnapshot(text);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
  const ready=s.phase==='planning'?start(s):s;expect(run(ready,true)).toEqual(run(ready));
 }
});

it('a Double Action caster may Defend late after early completion, but cannot take Total Defence',()=>{
 let s=fresh();s.creatures[0]!.doubleAction=true;s.creatures.push(createCreature('target',null,h(7,5)));s=submit(s,'wizard-0',null,[],cast('Bind',{targetId:'target'}));s=run(start(s)).state;
 expect(()=>submit(s,'wizard-0',null,[],'TotalDefence')).toThrow('CASTING_OCCUPIES_ACTION');s=submit(s,'wizard-0',null,[],'Defend');s=start(s);expect(isDefending(s,'wizard-0','late')).toBe(true);expect(isDefending(s,'wizard-0','early')).toBe(false);
 expect(run(s,true).events.some(e=>e.type==='ActionResolved'&&e.creatureId==='wizard-0'&&e.phase==='late'&&e.action==='Defend')).toBe(true);
});
it('early long-cast completion consumes Subdued movement eligibility',()=>{
 let s=fresh();s.creatures.push(createCreature('target',null,h(7,5)));s=submit(s,'wizard-0',null,[],cast('Bind',{targetId:'target'}));s=run(start(s)).state;
 s=submit(s,'wizard-0',null,[h(5,6)]);addCondition(s,s.creatures[0]!,'Subdued',null,1,2);
 const result=run(start(s),true);expect(result.state.creatures[0]!.centre).toEqual(h(5,5));
});

it.each([
 ['Summon Cat','Cat familiar',5,8,3,1],
 ['Summon Serpent','Snake familiar',3,6,2,-1],
 ['Summon Dragon','Dragonet familiar',5,6,4,0],
] as const)('uses the approved level-one profile for %s without substituting higher levels',(spell,species,move,dex,intelligence,a)=>{
 const profile=summonProfile(spell,1)!;const c=createCreature('profile','a',h(5,5),profile);
 expect({species:c.species,size:c.size,con:c.con,hp:c.hp,move:c.move,dex:c.dex,intelligence:c.intelligence,mana:c.mana}).toEqual({species,size:1,con:3,hp:3,move,dex,intelligence,mana:0});
 expect(c.familiar).toBe(true);expect(c.attacks[0]!.shots[0]!.skill).toBe(4);expect(c.attacks[0]!.shots[0]!.components[0]!.amount).toBe(1);expect(alignment(spell)).toBe(a);expect(summonProfile(spell,8)).toBeNull();
 if(spell==='Summon Cat')expect(c.nimble).toBe(true);
 if(spell==='Summon Serpent')expect(c.attacks[0]!.shots[0]!.secondary[0]!.potency).toBe(2);
 if(spell==='Summon Dragon'){expect(c.height).toBe('air');expect(c.attacks[0]!.range).toBe(3);expect(c.attacks[0]!.shots[0]!.components[0]!.type).toBe('fire');}
});
it('allocates summoned creature IDs without colliding with existing scenario or migrated IDs',()=>{
 const s=fresh();s.creatures.push(createCreature('summon-1','b',h(15,10)));direct(s,summon());s.random.resolution=1;completeCast(s,s.casts[0]!.id,[]);
 expect(new Set(s.creatures.map(c=>c.id)).size).toBe(s.creatures.length);expect(s.creatures.at(-1)!.id).toBe('summon-2');
});
