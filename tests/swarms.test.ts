import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { createMatch, createCreature, applyCommand, applySystemCommand, systemCommand } from '../packages/engine/src/index.js';
import { applyDamage, heal, damageMultiplier } from '../packages/engine/src/damage.js';
import { cleanupDeaths } from '../packages/engine/src/lifecycle.js';
import { resizeSwarm, regrowSwarms, swarmSizeForHealth } from '../packages/engine/src/swarms.js';
import { restrained, health } from '../packages/engine/src/status.js';
import { beginAttack, stepAttack, hitModifiers, enqueueGuards, resolveCombatAction } from '../packages/engine/src/combat.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { forceMove, startCast, completeCast } from '../packages/engine/src/casting.js';
import { arenaOf } from '../packages/engine/src/orders.js';
import { swarmProfile } from '../packages/content/src/swarms.js';
import { summonProfile } from '../packages/content/src/summons.js';
import { placement, stepLegality, traceProjectile } from '../packages/geometry/src/occupancy.js';
import { footprint } from '../packages/geometry/src/hex.js';
import { edge } from '../packages/geometry/src/walls.js';
import { encodeSnapshot, restoreSnapshot, canonical } from '../packages/persistence/src/snapshot.js';
import { migrateEnvironmentSnapshot, migrateSwarmSnapshot } from '../packages/persistence/src/migration.js';
import { stateSchema as legacySchema } from '../packages/domain/src/legacy-v5.js';
import { projectView } from '../packages/views/src/index.js';
import type { Creature, GameState, Order } from '../packages/domain/src/state.js';
import type { AttackAction } from '../packages/domain/src/combat.js';
import type { CastAction } from '../packages/domain/src/spells.js';
import type { Event } from '../packages/engine/src/events.js';

const h=(q:number,r:number)=>({q,r});
const attack:AttackAction={type:'Attack',attackId:'swarm',targetIds:[],ground:null,side:'left'};
function fresh(level=4):GameState {
 const s=createMatch('swarms',['a','b'],6007);
 s.creatures[0]!.centre=h(3,3);s.creatures[1]!.centre=h(20,15);
 s.creatures.push(createCreature('swarm','a',h(10,10),summonProfile('Summon Serpent',level)!));
 return s;
}
const swarm=(s:GameState)=>s.creatures.find(c=>c.id==='swarm')!;
function victim(s:GameState,id='victim',centre=h(10,10),overrides:Partial<Creature>={}):Creature {
 const c=createCreature(id,'b',centre,overrides);s.creatures.push(c);return c;
}
function draft(s:GameState,id:string,early:Order['early'],path:Order['path']=[],late:Order['late']=null):GameState {
 return applyCommand(s,{matchId:s.matchId,playerId:s.creatures.find(c=>c.id===id)!.controller!,turn:s.turn,commandId:`draft-${s.revision}`,expectedRevision:s.revision,type:'SetOrder',order:{creatureId:id,early,late,path}}).state;
}
function start(s:GameState):GameState {
 for(const p of s.players)s=applyCommand(s,{matchId:s.matchId,playerId:p.id,turn:s.turn,commandId:`lock-${s.revision}`,expectedRevision:s.revision,type:'LockTurn'}).state;
 return applySystemCommand(s,systemCommand(s,'StartResolution',`start-${s.revision}`)).state;
}
function run(s:GameState,restore=false) {
 const events:Event[]=[];
 for(let n=0;!['planning','ended'].includes(s.phase);n++){
  if(n>1000)throw new Error('STEP_LIMIT');
  if(restore)s=restoreSnapshot(encodeSnapshot(s));
  const result=advanceAtomicStep(s);s=result.state;events.push(...result.events);
 }
 return {state:s,events};
}
function attackNow(s:GameState,source:'action'|'guard'='action',targetId='victim'):Event[] {
 s.phase='early';const events:Event[]=[];
 beginAttack(s,swarm(s),source==='guard'?{...attack,targetIds:[targetId]}:attack,source);
 for(let n=0;s.pendingAttack;n++){if(n>100)throw new Error('STEP_LIMIT');stepAttack(s,events);}
 return events;
}
function wall(s:GameState,material:GameState['walls'][number]['material']='stone') {
 s.walls.push({id:'wall',edge:edge(h(11,10),h(12,10)),material,hp:20,maxHp:20,burning:null});
}

describe('swarm health, footprint and coverage',()=>{
 it.each([[12,6],[11,4],[6,4],[5,2],[1,2]])('at %i/24 HP has Size %i with fixed maximum HP', (hp,size)=>{
  const s=fresh(),c=swarm(s),events:Event[]=[];applyDamage(s,c,[{type:'physical',amount:24-hp}],events,{raw:true});
  expect(c.size).toBe(size);expect(c.originalSize).toBe(6);expect(c.maxHp).toBe(24);expect(c.centre).toEqual(h(10,10));
  expect(footprint(c.centre,c.size)).toHaveLength(size===6?19:size===4?7:1);
 });
 it('clamps small swarms to Size 1 and preserves the exact half/quarter boundaries',()=>{
  const s=fresh(3),c=swarm(s);c.hp=8;resizeSwarm(s,c,[],false);expect(c.size).toBe(4);
  c.hp=7;resizeSwarm(s,c,[],false);expect(c.size).toBe(2);c.hp=4;resizeSwarm(s,c,[],false);expect(c.size).toBe(2);
  c.hp=3;resizeSwarm(s,c,[],false);expect(c.size).toBe(1);expect(swarmSizeForHealth(c)).toBe(1);
 });
 it('releases coverage immediately after shrinking and reapplies it after healing',()=>{
  const s=fresh(),c=swarm(s),outer=victim(s,'outer',h(12,10)),equalSize=victim(s,'equal',h(10,10),{size:4});
  expect(restrained(s,outer)).toBe(true);expect(restrained(s,equalSize)).toBe(true);
  applyDamage(s,c,[{type:'magic',amount:13}],[]);
  expect(c.size).toBe(4);expect(restrained(s,outer)).toBe(false);expect(restrained(s,equalSize)).toBe(false);
  heal(s,c,13,[]);expect(c.size).toBe(6);expect(restrained(s,outer)).toBe(true);expect(restrained(s,equalSize)).toBe(true);
 });
 it('restraint includes allies, constructs and smaller swarms but only at the same height',()=>{
  const s=fresh();const ally=victim(s,'ally',h(10,10),{controller:'a'}),engine=victim(s,'engine',h(11,10),{construct:true,intelligence:0});
  const smaller=victim(s,'small',h(10,11),{swarm:true,size:2}),air=victim(s,'air',h(10,10),{height:'air'});
  for(const c of [ally,engine,smaller])expect(restrained(s,c)).toBe(true);expect(restrained(s,air)).toBe(false);
  swarm(s).height='air';for(const c of [ally,engine,smaller])expect(restrained(s,c)).toBe(false);expect(restrained(s,air)).toBe(true);
 });
 it('derives release after movement, death and height changes without stale condition records',()=>{
  const s=fresh(),target=victim(s);expect(restrained(s,target)).toBe(true);
  forceMove(s,swarm(s),h(15,10),[]);expect(restrained(s,target)).toBe(false);
  forceMove(s,swarm(s),h(10,10),[]);target.height='air';expect(restrained(s,target)).toBe(false);
  target.height='ground';swarm(s).hp=0;expect(restrained(s,target)).toBe(false);cleanupDeaths(s,[]);
  expect(swarm(s).alive).toBe(false);expect(s.corpses.some(c=>c.creatureId==='swarm')).toBe(false);
 });
 it('cannot heal a dispersed swarm during the atomic interval before death cleanup',()=>{
  const s=fresh(),c=swarm(s);applyDamage(s,c,[{type:'magic',amount:24}],[]);expect(c.alive).toBe(true);
  expect(health(c)).toBe('dead');
  expect(heal(s,c,24,[])).toBe(0);cleanupDeaths(s,[]);expect(heal(s,c,24,[])).toBe(0);expect(c.alive).toBe(false);
 });
 it('Escape cannot remove occupancy restraint, but leaving the footprint can',()=>{
  const s=fresh(),target=victim(s);resolveCombatAction(s,target,'Escape',[]);expect(restrained(s,target)).toBe(true);
  forceMove(s,target,h(15,12),[]);expect(restrained(s,target)).toBe(false);
 });
 it('ignores illusory coverage for Int 0 while preserving real swarm restraint',()=>{
  const s=fresh(),target=victim(s,'mindless',h(10,10),{intelligence:0});swarm(s).kind='illusion';expect(restrained(s,target)).toBe(false);
  target.intelligence=1;expect(restrained(s,target)).toBe(true);swarm(s).kind='summon';target.intelligence=0;expect(restrained(s,target)).toBe(true);
 });
 it('regrows only as far as legal walls permit and retries at the next turn start',()=>{
  let s=fresh();swarm(s).hp=5;resizeSwarm(s,swarm(s),[],false);wall(s);
  heal(s,swarm(s),24,[]);expect(swarm(s).hp).toBe(24);expect(swarm(s).size).toBe(4);
  s.walls=[];s=run(start(s),true).state;expect(s.turn).toBe(2);expect(swarm(s).size).toBe(6);
 });
 it('does not regrow on damage or through the board edge, and overlaps creatures on legal growth',()=>{
  const s=fresh(),c=swarm(s);c.hp=5;resizeSwarm(s,c,[],false);c.centre=h(0,0);heal(s,c,24,[]);expect(c.size).toBe(2);
  c.centre=h(10,10);victim(s);applyDamage(s,c,[{type:'magic',amount:1}],[]);expect(c.size).toBe(2);
  regrowSwarms(s,[]);expect(c.size).toBe(6);expect(c.hp).toBe(23);
 });
 it('flying growth crosses ordinary walls but cannot straddle Energy',()=>{
  const s=fresh(),c=swarm(s);c.height='air';c.hp=5;resizeSwarm(s,c,[],false);wall(s,'energy');heal(s,c,24,[]);expect(c.size).toBe(4);
  s.walls[0]!.material='stone';regrowSwarms(s,[]);expect(c.size).toBe(6);
 });
 it('prevents planning movement while covered and exposes current restraint in the permitted view',()=>{
  const s=fresh(),target=victim(s);expect(()=>draft(s,target.id,null,[h(11,10)])).toThrow('RESTRAINED');
  expect(projectView(s,'b').creatures.find(c=>c.id===target.id)!.restrained).toBe(true);
  swarm(s).centre=h(15,10);expect(()=>draft(s,target.id,null,[h(11,10)])).not.toThrow();
 });
});

describe('swarm attacks, defence and movement',()=>{
 it('rolls once per covered or adjacent enemy without friendly fire or cross-height attacks',()=>{
  const s=fresh(),c=swarm(s);c.attacks[0]!.shots[0]!.crit=0;c.attacks[0]!.shots[0]!.secondary=[];
  victim(s,'covered',h(10,10),{incapacitated:true});victim(s,'adjacent',h(13,10),{incapacitated:true});
  const large=victim(s,'large',h(10,12),{size:3,incapacitated:true}),ally=victim(s,'ally',h(10,10),{controller:'a'}),air=victim(s,'air',h(10,10),{height:'air'});
  const far=victim(s,'far',h(16,10)),events=attackNow(s);
  expect(events.filter(e=>e.type==='AttackHit').map(e=>e.targetId)).toEqual(['adjacent','covered','large']);
  expect(large.hp).toBe(12);expect(ally.hp).toBe(10);expect(air.hp).toBe(10);expect(far.hp).toBe(10);
  expect(events.at(-1)!.damageByTarget).toHaveLength(3);
 });
 it('uses ordinary hit and critical rolls per victim and does not count as ranged fire while threatened',()=>{
  const s=fresh(),c=swarm(s),target=victim(s,'victim',h(13,10));
  expect(hitModifiers(s,c,target,c.attacks[0]!)).toEqual([false,false]);
  const outcomes=new Set<string>();
  for(let seed=1;seed<=20;seed++){const trial=structuredClone(s);trial.random.resolution=seed;const events=attackNow(trial);for(const e of events)outcomes.add(e.type);}
  expect(outcomes.has('AttackHit')).toBe(true);expect(outcomes.has('AttackMissed')).toBe(true);
  s.defending=[{creatureId:target.id,phases:['early']}];s.phase='early';expect(hitModifiers(s,c,target,c.attacks[0]!)[1]).toBe(true);
 });
 it('a swarm attack has no manual victim selection and terminates when there are no victims',()=>{
  const s=fresh();expect(()=>draft(s,'swarm',attack)).not.toThrow();
  expect(()=>draft(s,'swarm',{...attack,targetIds:['wizard-1']})).toThrow('INVALID_ATTACK_TARGETS');
  expect(()=>draft(s,'swarm',{...attack,ground:h(10,10)})).toThrow('INVALID_ATTACK_TARGETS');
  expect(attackNow(s).filter(e=>e.type==='AttackHit')).toEqual([]);
 });
 it('snapshots candidate victims but rechecks range and allegiance before each hit',()=>{
  const s=fresh();victim(s,'a-target');const b=victim(s,'b-target',h(10,11));
  s.phase='early';beginAttack(s,swarm(s),attack,'action');stepAttack(s,[]);
  expect(s.pendingAttack!.areaVictims).toEqual(['a-target','b-target']);b.centre=h(20,10);const events:Event[]=[];stepAttack(s,events);
  expect(events[0]!.type).toBe('AttackInvalid');
 });
 it('Guard attacks only the entering enemy and can react once to each different enemy',()=>{
  const s=fresh(),c=swarm(s),one=victim(s,'one',h(13,10)),two=victim(s,'two',h(10,13));
  resolveCombatAction(s,c,{type:'Guard',attackId:'swarm',targetId:null,area:[]},[]);
  enqueueGuards(s,one,h(14,10));enqueueGuards(s,one,h(14,10));enqueueGuards(s,two,h(10,14));
  expect(s.reactions.map(r=>r.targetId)).toEqual(['one','two']);expect(s.guards[0]!.spent).toBe(false);
  const events=attackNow(s,'guard','one');expect(events.filter(e=>e.type==='AttackHit'||e.type==='AttackMissed').map(e=>e.targetId)).toEqual(['one']);
 });
 it('restores a swarm Guard reaction during an actual movement phase without attacking bystanders',()=>{
  let s=fresh();victim(s,'mover',h(14,10));victim(s,'bystander');
  s=draft(s,'swarm',{type:'Guard',attackId:'swarm',targetId:null,area:[]});s=draft(s,'mover',null,[h(13,10)]);s=start(s);
  const direct=run(s),restored=run(s,true);expect(restored).toEqual(direct);
  expect(direct.events.filter(e=>e.type==='AttackHit'||e.type==='AttackMissed').map(e=>e.targetId)).toEqual(['mover']);
 });
 it('uses the listed swarm poison and never injects it after zero damage',()=>{
  const s=fresh(),c=swarm(s),target=victim(s,'victim',h(10,10),{con:1,size:4});
  c.attacks[0]!.shots[0]!.crit=0;s.random.resolution=1;attackNow(s);
  expect(target.conditions).toEqual([expect.objectContaining({kind:'Poisoned',potency:5,sourceId:'swarm',duration:3,startsTurn:1,endsTurn:3})]);
  const immune=fresh(),protectedTarget=victim(immune,'victim',h(10,10),{con:1,size:4,defences:[{type:'physical',multiplier:0}]});
  immune.random.resolution=1;const events=attackNow(immune);
  expect(protectedTarget.conditions).toEqual([]);expect(events.some(e=>e.type==='DamageApplied')).toBe(false);
 });
 it.each([
  ['physical',false,.5],['physical',true,1.5],['fire',false,1.5],['fire',true,1.5],['magic',true,1.5],['cold',false,1.5],
 ] as const)('applies %s area=%s multiplier %s exactly once',(type,area,multiplier)=>{
  expect(damageMultiplier(swarm(fresh()),type,area)).toBe(multiplier);
 });
 it('preserves Grove major fire vulnerability without stacking another swarm bonus',()=>{
  const c=createCreature('grove','a',h(10,10),summonProfile('Summon Plant',6)!);
  expect(damageMultiplier(c,'fire')).toBe(2);expect(damageMultiplier(c,'fire',true)).toBe(2);
  expect(damageMultiplier(c,'physical',true)).toBe(1.5);expect(damageMultiplier(c,'poison')).toBe(0);
 });
 it('rounds separate mixed damage components after their individual swarm defences',()=>{
  const s=fresh(),c=swarm(s);expect(applyDamage(s,c,[{type:'physical',amount:3},{type:'fire',amount:3}],[])).toBe(7);
  expect(c.hp).toBe(17);
 });
 it('overlaps creatures, siege constructs and swarms but cannot cross solid walls on the ground',()=>{
  const s=fresh(),c=swarm(s);victim(s,'engine',h(13,10),{construct:true,intelligence:0});victim(s,'other-swarm',h(11,10),{swarm:true});
  expect(placement(arenaOf(s),c,h(11,10)).legal).toBe(true);wall(s);
  expect(stepLegality(arenaOf(s),c,c.centre,h(11,10),true).legal).toBe(false);
  c.height='air';expect(stepLegality(arenaOf(s),c,c.centre,h(11,10),true).legal).toBe(true);
  s.walls[0]!.material='energy';expect(stepLegality(arenaOf(s),c,c.centre,h(11,10),true).legal).toBe(false);
 });
 it('intercepts direct projectiles using its current footprint',()=>{
  const s=fresh(),c=swarm(s),origin=s.creatures[0]!;origin.centre=h(6,10);
  expect(traceProjectile(arenaOf(s),origin,h(15,10),'ground','left').hit).toBe('swarm');
  c.height='air';expect(traceProjectile(arenaOf(s),origin,h(15,10),'ground','left').hit).toBeNull();
 });
});

describe('swarm content, casting and persistence',()=>{
 it('fixed maximum HP and bounded Size survive generated damage/healing sequences',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:10}),fc.array(fc.integer({min:-10,max:10}),{maxLength:30}),(size,changes)=>{
   const s=createMatch('generated-swarm',['a','b'],1),c=createCreature('swarm','a',h(10,10),{size,swarm:true,con:4});s.creatures.push(c);
   for(const amount of changes){
    if(amount<0)applyDamage(s,c,[{type:'magic',amount:-amount}],[]);else heal(s,c,amount,[]);
    cleanupDeaths(s,[]);expect(c.maxHp).toBe(4*size);expect(c.originalSize).toBe(size);
    expect(c.size).toBeGreaterThanOrEqual(1);expect(c.size).toBeLessThanOrEqual(size);
    expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
   }
  }),{seed:6004,numRuns:60});
 });
 it.each(['planning','movement','attack','blocked-growth'])('explicitly migrates the immutable v6 %s fixture and continues identically',name=>{
  const text=readFileSync(`tests/fixtures/swarms-v6-${name}.json`,'utf8').trim();expect(()=>restoreSnapshot(text)).toThrow();const s=migrateSwarmSnapshot(text);
  expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);const ready=s.phase==='planning'?start(s):s;
  expect(run(ready,true)).toEqual(run(ready));
 });
 it.each([['Summon Serpent',3,4,4,16,5,2],['Summon Serpent',4,6,4,24,6,3],['Summon Plant',6,6,5,30,6,3]] as const)('loads the approved %s level %i profile', (spell,level,size,con,hp,skill,damage)=>{
  const profile=summonProfile(spell,level)!;expect(profile).toMatchObject({size,originalSize:size,con,hp,maxHp:hp,summonLevel:level,swarm:true,corpseEligible:false});
  expect(profile.attacks![0]!.shots[0]).toMatchObject({skill,components:[{type:'physical',amount:damage}]});
  expect(swarmProfile('Summon Cat',level)).toBeNull();
 });
 it('summons a bound swarm with the original size and next-turn readiness',()=>{
  const s=fresh();s.creatures=s.creatures.slice(0,2);const c=s.creatures[0]!;c.spellbook=['Summon Serpent'];c.centre=h(5,5);
  const a:CastAction={type:'Cast',spell:'Summon Serpent',level:4,variant:'bound',targetId:null,ground:h(8,5),side:'left'};
  expect(()=>draft(s,c.id,a)).not.toThrow();s.phase='early';startCast(s,c,a,[]);s.random.resolution=1;completeCast(s,s.casts[0]!.id,[]);
  expect(s.creatures.at(-1)).toMatchObject({swarm:true,size:6,originalSize:6,maxHp:24,readyTurn:2,bindingLevel:4});
 });
 it('requires an empty summoning footprint even though swarms can overlap after creation',()=>{
  const s=fresh(),c=s.creatures[0]!;c.spellbook=['Summon Serpent'];
  const a:CastAction={type:'Cast',spell:'Summon Serpent',level:4,variant:'bound',targetId:null,ground:h(10,10),side:'left'};
  expect(()=>draft(s,c.id,a)).toThrow('INVALID_SUMMON_PLACEMENT');
 });
 it('matches restored resolution at every per-victim attack boundary over generated seeds',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:100000}),seed=>{
   let s=fresh();s.random.resolution=seed;victim(s,'one');victim(s,'two',h(13,10));victim(s,'air',h(10,10),{height:'air'});
   s=start(draft(s,'swarm',attack));expect(run(s,true)).toEqual(run(s));
  }),{seed:6003,numRuns:30});
 },30000);
 it('restores a partially damaged swarm with blocked growth and derived coverage',()=>{
  const s=fresh(),target=victim(s,'outer',h(12,10));applyDamage(s,swarm(s),[{type:'magic',amount:13}],[]);wall(s);heal(s,swarm(s),13,[]);
  const restored=restoreSnapshot(encodeSnapshot(s));expect(restored).toEqual(s);expect(restrained(restored,restored.creatures.find(c=>c.id===target.id)!)).toBe(false);
  restored.walls=[];regrowSwarms(restored,[]);expect(swarm(restored).size).toBe(6);
 });
 it('rejects corrupted original size, maximum HP and duplicate pending victims transactionally',()=>{
  let s=fresh();victim(s,'one');victim(s,'two',h(13,10));s=start(draft(s,'swarm',attack));
  while(!s.pendingAttack?.areaVictims)s=advanceAtomicStep(s).state;
  const original=encodeSnapshot(s);const bad=JSON.parse(original);bad.pendingAttack.areaVictims=['one','one'];
  expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();bad.pendingAttack.areaVictims=['one','two'];
  bad.creatures[2].originalSize=2;expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();bad.creatures[2].originalSize=6;bad.creatures[2].maxHp=30;
  expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();expect(encodeSnapshot(s)).toBe(original);
 });
 it('explicitly migrates v5 without rewriting the frozen fixture or consuming randomness',()=>{
  const text=readFileSync('tests/fixtures/reanimation-v5-casting.json','utf8').trim(),old=legacySchema.parse(JSON.parse(text));
  expect(canonical(old)).toBe(text);expect(()=>restoreSnapshot(text)).toThrow();
  const s=migrateEnvironmentSnapshot(text);expect(s.schemaVersion).toBe(14);expect(s.random).toEqual(old.random);
  expect(s.creatures.map(c=>c.originalSize)).toEqual(old.creatures.map(c=>c.size));expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
 });
});
