import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createMatch, createCreature, applyCommand, applySystemCommand, systemCommand, type Event } from '../packages/engine/src/index.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { addCondition, applyDamage, damageMultiplier, effectChance, escapeChance, heal, hitChance, roll, damageCorpse, damageWall } from '../packages/engine/src/damage.js';
import { cleanupDeaths, ongoingDamage, recover, expireConditions } from '../packages/engine/src/lifecycle.js';
import { beginAttack, stepAttack, enqueueGuards, resolveCombatAction } from '../packages/engine/src/combat.js';
import { active, health, restrained } from '../packages/engine/src/status.js';
import { encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { randomBelow } from '../packages/domain/src/random.js';
import { staff, type AttackAction, type AttackDefinition } from '../packages/domain/src/combat.js';
import type { Creature, GameState, Order } from '../packages/domain/src/state.js';

const h=(q:number,r:number)=>({q,r});
function fresh(seed=123):GameState {
 const s=createMatch('combat',['a','b'],seed);s.creatures[0]!.centre=h(5,5);s.creatures[1]!.centre=h(6,5);return s;
}
function attack(overrides:Partial<AttackDefinition>={}):AttackDefinition {return {...staff(),...overrides};}
const action=(targetIds=['wizard-1']):AttackAction=>({type:'Attack',attackId:'staff',targetIds,ground:null,side:'left'});
function command(s:GameState,playerId:string,payload:Record<string,unknown>){return {matchId:s.matchId,turn:s.turn,playerId,commandId:`c${s.revision}`,expectedRevision:s.revision,...payload};}
function submit(s:GameState,id:string,early:Order['early'],path:Order['path']=[],late:Order['late']=null):GameState {
 return applyCommand(s,command(s,s.creatures.find(c=>c.id===id)!.controller!,{type:'SetOrder',order:{creatureId:id,path,early,late}})).state;
}
function start(s:GameState):GameState {
 for(const p of s.players)s=applyCommand(s,command(s,p.id,{type:'LockTurn'})).state;
 return applySystemCommand(s,systemCommand(s,'StartResolution',`start${s.turn}`)).state;
}
function run(s:GameState,restore=false):{state:GameState;events:Event[]} {
 const events:Event[]=[];
 for(let i=0;['early','movement','late','end'].includes(s.phase);i++){
  if(i>500)throw new Error('STEP_LIMIT');
  if(restore)s=restoreSnapshot(encodeSnapshot(s));
  const result=advanceAtomicStep(s);s=result.state;events.push(...result.events);
 }
 return {state:s,events};
}
function finishAttack(s:GameState):Event[]{const events:Event[]=[];for(let i=0;s.pendingAttack;i++){if(i>30)throw new Error('ATTACK_LIMIT');stepAttack(s,events);}return events;}
function wound(s:GameState,c:Creature,amount:number,type:'physical'|'fire'|'acid'='physical'){return applyDamage(s,c,[{type,amount}],[]);}

describe('combat probability and damage',()=>{
 it('clamps hit, effect and escape chances at specified boundaries',()=>{
  expect([hitChance(5,5),hitChance(100,0),hitChance(0,100)]).toEqual([70,95,10]);
  expect([effectChance(5,5),effectChance(100,0),effectChance(0,100)]).toEqual([50,90,10]);
  expect([escapeChance(5,5),escapeChance(10,1),escapeChance(1,10)]).toEqual([50,90,10]);
 });
 it('rolls twice for advantage/disadvantage, cancels both and records exact RNG state',()=>{
  for(let seed=1;seed<=40;seed++){
   const s=fresh(seed),first=randomBelow(s.random.resolution,100),second=randomBelow(first.state,100);
   for(const [adv,dis] of [[false,false],[true,true],[true,false],[false,true]]){
    const copy=structuredClone(s);const expected=adv===dis?first.value:adv?Math.min(first.value,second.value):Math.max(first.value,second.value);
    expect(roll(copy,70,adv,dis)).toBe(expected<70);expect(copy.random.resolution).toBe(adv===dis?first.state:second.state);
   }
  }
 });
 it('combines strongest resistance and vulnerability, rounding each component up',()=>{
  const s=fresh(),c=s.creatures[1]!;
  c.defences=[{type:'physical',multiplier:.5},{type:'physical',multiplier:.25},{type:'physical',multiplier:1.5},{type:'physical',multiplier:2},{type:'fire',multiplier:.5}];
  expect(applyDamage(s,c,[{type:'physical',amount:3},{type:'fire',amount:1}],[])).toBe(3);
  c.defences.push({type:'physical',multiplier:0});expect(damageMultiplier(c,'physical')).toBe(0);
 });
 it('uses explicit undead classes and swarm fire/area non-stacking rules',()=>{
  const c=fresh().creatures[0]!;c.undead=true;c.undeadClass='zombie';expect(damageMultiplier(c,'physical')).toBe(.5);
  c.undeadClass='skeleton';expect(damageMultiplier(c,'physical')).toBe(.25);
  c.undeadClass='higher';expect(damageMultiplier(c,'physical')).toBe(0);
  c.undeadClass='exception';c.swarm=true;
  expect(damageMultiplier(c,'physical')).toBe(.5);expect(damageMultiplier(c,'physical',true)).toBe(1.5);
  expect(damageMultiplier(c,'fire',true)).toBe(1.5);
  c.defences=[{type:'fire',multiplier:2}];expect(damageMultiplier(c,'fire',true)).toBe(2);
 });
 it('automatic hits bypass hit dice but retain independent critical dice',()=>{
  const s=fresh(),a=s.creatures[0]!,b=s.creatures[1]!;b.incapacitated=true;
  a.attacks[0]!.shots[0]!.crit=100;const before=s.random.resolution;
  beginAttack(s,a,action(),'action');const events=finishAttack(s);
  expect(b.hp).toBe(6);expect(s.random.resolution).toBe(randomBelow(before,100).state);
  expect(events.find(e=>e.type==='AttackFinished')!.damageByTarget).toEqual([{targetId:b.id,amount:4}]);
 });
 it('zero damage does not wake, suppress regeneration, or inject a secondary condition',()=>{
  const s=fresh(),a=s.creatures[0]!,b=s.creatures[1]!;
  b.defences=[{type:'fire',multiplier:0}];addCondition(s,b,'Unconscious',a.id,1,3);
  a.attacks[0]!.shots[0]={skill:99,crit:0,components:[{type:'fire',amount:9}],secondary:[{kind:'Poisoned',potency:99,resistance:'con',duration:3,requiresDamage:true}]};
  beginAttack(s,a,action(),'action');finishAttack(s);
  expect(b.hp).toBe(10);expect(b.conditions.map(c=>c.kind)).toEqual(['Unconscious']);expect(b.regenerationBlockedTurn).toBeNull();
 });
 it('validates attack identity, target shape and on-board ground targets transactionally',()=>{
  const s=fresh(),before=encodeSnapshot(s);
  expect(()=>submit(s,'wizard-0',{...action(),attackId:'missing'})).toThrow('UNKNOWN_ATTACK');
  expect(()=>submit(s,'wizard-0',{...action(),targetIds:[]})).toThrow('INVALID_ATTACK_TARGETS');
  expect(()=>submit(s,'wizard-0',{...action(),targetIds:['missing']})).toThrow('UNKNOWN_TARGET');
  expect(encodeSnapshot(s)).toBe(before);
 });
});

describe('attacks in the phase resolver',()=>{
 it('rechecks the selected creature after movement and wastes an out-of-range attack',()=>{
  let s=fresh();s.creatures[1]!.move=4;
  s=submit(s,'wizard-0',null,[],action());s=submit(s,'wizard-1',null,[h(7,5),h(8,5)]);
  const result=run(start(s),true);expect(result.state.creatures[1]!.hp).toBe(10);expect(result.events.some(e=>e.type==='AttackInvalid')).toBe(true);
 });
 it('intercepts direct projectiles with allies and uses the intercepted defence',()=>{
  const s=fresh(),a=s.creatures[0]!,b=s.creatures[1]!;b.centre=h(9,5);
  s.creatures.push(createCreature('ally','a',h(7,5),{incapacitated:true}));a.attacks[0]=attack({mode:'projectile',range:8});a.attacks[0]!.shots[0]!.crit=0;
  beginAttack(s,a,action(),'action');finishAttack(s);expect(b.hp).toBe(10);expect(s.creatures[2]!.hp).toBe(8);
 });
 it('hits each large area victim once with resistance instead of hit/critical rolls',()=>{
  const s=fresh(),a=s.creatures[0]!,b=s.creatures[1]!;a.centre=h(1,5);b.centre=h(10,10);b.size=4;b.maxHp=b.hp=20;
  a.attacks[0]=attack({mode:'area',range:20,radius:2});a.attacks[0]!.shots[0]!.crit=100;
  beginAttack(s,a,{...action([]),ground:b.centre},'action');const events=finishAttack(s);
  expect(events.filter(e=>e.type==='AttackHit')).toHaveLength(1);expect([18,19]).toContain(b.hp);expect(events.find(e=>e.type==='AttackHit')!.critical).toBe(false);
 });
 it('persists per-hit damage accumulation and continues identically at every atomic boundary',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:0xffffffff}),seed=>{
   let s=fresh(seed);s.creatures[0]!.dex=9;s.creatures[0]!.attacks[0]!.shots=Array.from({length:3},()=>({...staff().shots[0]!,crit:0}));
   s=submit(s,'wizard-0',action());s=start(s);
   const direct=run(s),restored=run(s,true);expect(restored).toEqual(direct);
   const finished=direct.events.find(e=>e.type==='AttackFinished')!;
   const damage=direct.events.filter(e=>e.type==='DamageApplied'&&e.creatureId==='wizard-1').reduce((n,e)=>n+e.amount!,0);
   expect(finished.damageByTarget!.reduce((n,d)=>n+d.amount,0)).toBe(damage);
  }),{seed:4004,numRuns:40});
 });
 it('Defend applies before defender initiative and advantage cancels its disadvantage',()=>{
  for(let seed=1;seed<=20;seed++){
   const s=fresh(seed),a=s.creatures[0]!,b=s.creatures[1]!;s.phase='early';
   a.attacks[0]!.shots[0]!.crit=0;s.defending=[{creatureId:b.id,phases:['early']}];
   const before=s.random.resolution;const r1=randomBelow(before,100),r2=randomBelow(r1.state,100);
   beginAttack(s,a,action(),'action');finishAttack(s);expect(b.hp<10).toBe(Math.max(r1.value,r2.value)<65);
   const t=fresh(seed);t.phase='early';t.defending=s.defending;t.creatures[0]!.packTactics=true;t.creatures[0]!.attacks[0]!.shots[0]!.crit=0;
   t.creatures.push(createCreature('ally','a',h(6,6)));
   beginAttack(t,t.creatures[0]!,action(),'action');finishAttack(t);expect(t.creatures[1]!.hp<10).toBe(r1.value<65);
  }
 });
});

describe('Guard and grapples',()=>{
 it('interrupts movement immediately, persists the reaction, and stops an incapacitated mover',()=>{
  let s=fresh();s.creatures[1]!.centre=h(8,5);s.creatures[1]!.hp=1;s.creatures[1]!.dex=0;
  s.creatures[0]!.attacks[0]!.shots[0]={skill:99,crit:0,components:[{type:'physical',amount:2}],secondary:[]};
  s=submit(s,'wizard-0',{type:'Guard',attackId:'staff',targetId:null,area:[]});s=submit(s,'wizard-1',null,[h(7,5),h(6,5)]);
  const result=run(start(s),true);expect(result.events.some(e=>e.type==='AttackHit')).toBe(true);expect(result.state.creatures[1]!.hp).toBe(-1);
  expect(result.events.find(e=>e.type==='AttackHit')!.phase).toBe('movement');
 });
 it('melee Guard reacts once per enemy, ranged only once, and forced relocation queues nothing',()=>{
  const s=fresh(),guard=s.creatures[0]!,mover=s.creatures[1]!;
  resolveCombatAction(s,guard,{type:'Guard',attackId:'staff',targetId:null,area:[]},[]);
  enqueueGuards(s,mover,h(7,5));expect(s.reactions).toHaveLength(1);
  enqueueGuards(s,mover,h(7,5));expect(s.reactions).toHaveLength(1);
  s.creatures.push(createCreature('other','b',h(5,6)));enqueueGuards(s,s.creatures[2]!,h(5,7));expect(s.reactions).toHaveLength(2);
  const t=fresh();t.creatures[0]!.attacks[0]=attack({mode:'projectile',range:2});
  resolveCombatAction(t,t.creatures[0]!,{type:'Guard',attackId:'staff',targetId:null,area:[]},[]);
  t.creatures[1]!.centre=h(7,5);expect(t.reactions).toEqual([]);
  enqueueGuards(t,t.creatures[1]!,h(8,5));expect(t.reactions).toHaveLength(1);expect(t.guards[0]!.spent).toBe(true);
 });
 it('respects Guard target and area restrictions',()=>{
  const s=fresh();resolveCombatAction(s,s.creatures[0]!,{type:'Guard',attackId:'staff',targetId:'wizard-1',area:[h(4,5)]},[]);
  enqueueGuards(s,s.creatures[1]!,h(7,5));expect(s.reactions).toEqual([]);
 });
 it('contests each hold independently and keeps both holders and targets stationary',()=>{
  const s=fresh(),c=s.creatures[1]!;s.creatures[0]!.grappleLimbs=2;
  s.holds=[{grapplerId:'wizard-0',targetId:'wizard-1',limb:0},{grapplerId:'wizard-0',targetId:'wizard-1',limb:1}];
  expect(restrained(s,s.creatures[0]!)).toBe(true);expect(restrained(s,c)).toBe(true);
  expect(()=>submit(s,c.id,null,[h(7,5)])).toThrow('RESTRAINED');
  const copy=structuredClone(s);const results=[roll(copy,50),roll(copy,50)];
  resolveCombatAction(s,c,'Escape',[]);expect(s.holds.map(h=>h.limb)).toEqual([0,1].filter(i=>!results[i]));
  expect(s.random.resolution).toBe(copy.random.resolution);
 });
 it('releases holds freely through an owned, replayable command',()=>{
  let s=fresh();s.creatures[0]!.grappleLimbs=1;s.holds=[{grapplerId:'wizard-0',targetId:'wizard-1',limb:0}];
  const release=command(s,'a',{type:'ReleaseHold',creatureId:'wizard-0',targetId:null});
  s=applyCommand(s,release).state;expect(s.holds).toEqual([]);expect(applyCommand(s,release).state).toEqual(s);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
 });
});

describe('conditions and lifecycle',()=>{
 it('uses HP boundaries and heals damage-based incapacity without resurrecting',()=>{
  const s=fresh(),c=s.creatures[0]!;wound(s,c,10);expect(active(c)).toBe(false);expect(c.alive).toBe(true);expect(health(c)).toBe('incapacitated');
  heal(s,c,1,[]);expect(active(c)).toBe(true);wound(s,c,11);cleanupDeaths(s,[]);expect(c.alive).toBe(false);expect(heal(s,c,100,[])).toBe(0);
 });
 it('poison ticks on application and two following turns, refreshing without stacking',()=>{
  const s=fresh(),c=s.creatures[0]!;addCondition(s,c,'Poisoned',null,3,3,'con');addCondition(s,c,'Poisoned',null,3,3,'con');
  expect(c.conditions).toHaveLength(1);
  for(let turn=1;turn<=4;turn++){s.turn=turn;ongoingDamage(s,[]);expireConditions(s);}
  expect(c.hp).toBe(7);expect(c.conditions).toEqual([]);
 });
 it('acid/burning begin next turn, bleeding begins now and treatment removes it',()=>{
  const s=fresh(),c=s.creatures[0]!;addCondition(s,c,'Acid',null,1,2);addCondition(s,c,'Burning',null,1,2);addCondition(s,c,'Bleeding',null,1,null);
  ongoingDamage(s,[]);expect(c.hp).toBe(9);s.turn=2;ongoingDamage(s,[]);expect(c.hp).toBe(5);
  s.creatures[1]!.controller='a';resolveCombatAction(s,s.creatures[1]!,{type:'Treat',targetId:c.id},[]);expect(c.conditions.some(e=>e.kind==='Bleeding')).toBe(false);
  resolveCombatAction(s,s.creatures[1]!,{type:'Extinguish',targetId:c.id},[]);expect(c.conditions.some(e=>e.kind==='Burning')).toBe(false);
 });
 it('positive damage wakes ordinary sleep and regeneration never treats bleeding',()=>{
  const s=fresh(),c=s.creatures[0]!;c.regeneration=2;addCondition(s,c,'Unconscious',null,1,3);addCondition(s,c,'Bleeding',null,1,null);
  wound(s,c,1);expect(c.conditions.some(e=>e.kind==='Unconscious')).toBe(false);recover(s,[]);expect(c.hp).toBe(10);expect(c.conditions.some(e=>e.kind==='Bleeding')).toBe(true);
  heal(s,c,0,[]);expect(c.conditions).toEqual([]);
 });
 it('fire and acid suppress regeneration that turn, including at non-positive HP',()=>{
  for(const type of ['fire','acid'] as const){const s=fresh(),c=s.creatures[0]!;c.regeneration=3;wound(s,c,10,type);recover(s,[]);expect(c.hp).toBe(0);s.turn++;recover(s,[]);expect(c.hp).toBe(3);}
 });
 it('enforces undead, plant, construct and mindless condition immunities',()=>{
  const s=fresh(),c=s.creatures[0]!;c.undead=true;
  for(const kind of ['Bleeding','Poisoned','Disease'] as const)expect(addCondition(s,c,kind,null,1,3)).toBe(false);
  c.undead=false;c.plant=true;expect(addCondition(s,c,'Poisoned',null,1,3)).toBe(false);
  c.intelligence=0;expect(addCondition(s,c,'Fear',null,1,3)).toBe(false);expect(addCondition(s,c,'Unconscious',null,1,3)).toBe(false);
  expect(addCondition(s,c,'Restrained',null,1,3)).toBe(true);
 });
 it('disease becomes Subdued after three ends and Fear blocks voluntary approach',()=>{
  const s=fresh(),c=s.creatures[0]!;addCondition(s,c,'Disease',null,1,null,'con');
  recover(s,[]);expect(c.conditions[0]!.active).toBe(false);s.turn=2;recover(s,[]);expect(c.conditions[0]!.active).toBe(false);
  s.turn=3;recover(s,[]);expect(c.conditions[0]!.active).toBe(true);
  const t=fresh();t.creatures[1]!.centre=h(8,5);addCondition(t,t.creatures[0]!,'Fear','wizard-1',4,2);
  expect(()=>submit(t,'wizard-0',null,[h(6,5)])).toThrow('FEAR_APPROACH');expect(submit(t,'wizard-0',null,[h(4,5)]).orders).toHaveLength(1);
 });
 it('snapshots simultaneous end damage before death and victory so both wizards can draw',()=>{
  let s=fresh();for(const c of s.creatures){c.hp=-9;addCondition(s,c,'Bleeding',null,1,null);}
  const result=run(start(s),true);expect(result.state.result).toEqual({type:'draw'});expect(result.state.corpses).toHaveLength(2);
 });
 it('wizard death unbinds summons, collapses servants and wins only at phase end',()=>{
  let s=fresh();s.creatures.push(createCreature('pet','b',h(10,10)),createCreature('servant','b',h(12,10),{kind:'reanimated'}));
  s.creatures[1]!.incapacitated=true;s.creatures[1]!.hp=-9;s.creatures[0]!.attacks[0]!.shots[0]!.crit=0;
  s=submit(s,'wizard-0',action());const result=run(start(s),true);
  expect(result.state.result).toEqual({type:'winner',playerId:'a'});expect(result.state.creatures[2]!.controller).toBeNull();expect(result.state.creatures[3]!.alive).toBe(false);
  expect(result.events.find(e=>e.type==='MatchEnded')!.phase).toBe('ended');expect(result.events.findIndex(e=>e.type==='PhaseEnded')).toBeLessThan(result.events.findIndex(e=>e.type==='MatchEnded'));
 });
 it('keeps corpses nonblocking and accumulates fire/acid exposure before and after death',()=>{
  const s=fresh(),c=s.creatures[1]!;wound(s,c,4,'fire');wound(s,c,20);cleanupDeaths(s,[]);
  expect(s.corpses[0]!.skeletal).toBe(false);damageCorpse(s,s.corpses[0]!.id,[{type:'acid',amount:1}]);expect(s.corpses[0]!.skeletal).toBe(true);
 });
 it.each([{swarm:true},{plant:true},{construct:true},{kind:'illusion' as const},{corpseEligible:false}])('does not create usable corpses for excluded bodies %j',overrides=>{
  const s=fresh();s.creatures.push(createCreature('body',null,h(10,10),overrides));const c=s.creatures[2]!;wound(s,c,30);cleanupDeaths(s,[]);expect(s.corpses).toEqual([]);
 });
 it('swarms die at zero and iron walls ignore ordinary fire',()=>{
  const s=fresh();s.creatures.push(createCreature('swarm',null,h(10,10),{swarm:true,hp:0}));cleanupDeaths(s,[]);expect(s.creatures[2]!.alive).toBe(false);
  s.walls.push({id:'wall',edge:{a:h(10,5),b:h(11,5)},material:'iron',hp:8,maxHp:8,burning:null});
  expect(damageWall(s,'wall',[{type:'fire',amount:20}],[])).toBe(0);damageWall(s,'wall',[{type:'physical',amount:8}],[]);expect(s.walls).toEqual([]);
 });
});

describe('combat save and privacy regressions',()=>{
 it('permanent combat fixtures restore and continue identically',async()=>{
  const {readFileSync}=await import('node:fs');
  for(const file of ['combat-multiattack','combat-guard','combat-end-damage']){
   const text=readFileSync(`tests/fixtures/${file}.json`,'utf8').trim(),state=restoreSnapshot(text);
   
   expect(restoreSnapshot(encodeSnapshot(state))).toEqual(state);expect(run(state,true)).toEqual(run(state));
  }
 });
 it('rejects unknown attack/condition/hold references and corrupt pending positions',async()=>{
  const {readFileSync}=await import('node:fs');
  const text=readFileSync('tests/fixtures/combat-multiattack.json','utf8');
  for(const mutate of [(s:GameState)=>{s.pendingAttack!.shotIndex=100;},(s:GameState)=>{s.pendingAttack!.attackerId='missing';},(s:GameState)=>{s.pendingAttack!.areaVictims=['missing'];},(s:GameState)=>{s.holds=[{grapplerId:'wizard-0',targetId:'wizard-1',limb:99}];},(s:GameState)=>{s.phase='planning';}]){
   const s=restoreSnapshot(text);mutate(s);expect(()=>restoreSnapshot(JSON.stringify(s))).toThrow('INVALID_OR_UNSUPPORTED_SNAPSHOT');
  }
 });
 it('exposes public health bands but only owner HP and damage totals',async()=>{
  const {projectView,projectEvents}=await import('../packages/views/src/index.js');
  const s=fresh();s.creatures[1]!.hp=6;
  expect(projectView(s,'a').creatures[1]!.health).toBe('wounded');expect(projectView(s,'a').creatures[1]).not.toHaveProperty('hp');
  expect(projectView(s,'b').creatures[1]!.hp).toBe(6);
  const events:Event[]=[{type:'DamageApplied',turn:1,phase:'early',sequence:1,creatureId:'wizard-1',amount:4},{type:'AttackFinished',turn:1,phase:'early',sequence:2,creatureId:'wizard-0',damageByTarget:[{targetId:'wizard-1',amount:4}]}];
  const enemy=projectEvents(s,'a',events);expect(enemy[0]).not.toHaveProperty('amount');expect(enemy[1]!.damageByTarget).toEqual([]);
  expect(projectEvents(s,'b',events)[0]!.amount).toBe(4);expect(events[0]!.amount).toBe(4);
 });
 it('grapples use attack reach, limited limbs, hit plus physical resistance and release on incapacity',()=>{
  const s=fresh(),a=s.creatures[0]!,b=s.creatures[1]!;a.grappleLimbs=1;a.size=2;b.size=1;b.centre=h(7,5);b.incapacitated=true;
  a.attacks[0]!.range=2;
  const copy=structuredClone(s),success=roll(copy,effectChance(4,2));
  resolveCombatAction(s,a,{type:'Grapple',targetId:b.id},[]);
  expect(s.holds.length).toBe(success?1:0);expect(s.random.resolution).toBe(copy.random.resolution);
  if(success){resolveCombatAction(s,a,{type:'Grapple',targetId:b.id},[]);expect(s.holds).toHaveLength(1);a.hp=0;cleanupDeaths(s,[]);expect(s.holds).toEqual([]);}
 });
 it('rolls Fear recovery against Int at each end and expires it after its final turn',()=>{
  const s=fresh(),c=s.creatures[0]!;addCondition(s,c,'Fear','wizard-1',5,2);
  const copy=structuredClone(s),remains=roll(copy,effectChance(5,7));recover(s,[]);expect(c.conditions.some(e=>e.kind==='Fear')).toBe(remains);
  s.turn=2;expireConditions(s);expect(c.conditions).toEqual([]);
 });
 it('limits newly Subdued actors by actual movement/actions, and newly Slowed movement by allowance',()=>{
  let s=fresh();s.creatures[1]!.centre=h(20,10);s.creatures[0]!.doubleAction=true;s.creatures[0]!.move=4;
  s=submit(s,'wizard-0','Defend',[h(6,5),h(7,5),h(8,5)],'Defend');s=start(s);
  while(s.phase==='early')s=advanceAtomicStep(s).state;
  addCondition(s,s.creatures[0]!,'Subdued',null,1,2);
  const result=run(s,true);expect(result.state.creatures[0]!.centre).toEqual(h(5,5));expect(result.events.filter(e=>e.type==='ActionResolved'&&e.creatureId==='wizard-0')).toEqual([]);
  let t=fresh();t.creatures[1]!.centre=h(20,10);t.creatures[0]!.move=4;t=submit(t,'wizard-0',null,[h(6,5),h(7,5),h(8,5)]);t=start(t);
  while(t.creatures[0]!.centre.q!==6)t=advanceAtomicStep(t).state;
  addCondition(t,t.creatures[0]!,'Slowed',null,1,2);expect(run(t,true).state.creatures[0]!.centre).toEqual(h(7,5));
 });
 it('extinguishes an adjacent edge wall using a normal action',()=>{
  const s=fresh();s.walls.push({id:'wood',edge:{a:h(4,5),b:h(4,6)},material:'wood',hp:8,maxHp:8,burning:{startsTurn:1,endsTurn:2}});
  expect(submit(s,'wizard-0',{type:'Extinguish',targetId:'wood'}).orders).toHaveLength(1);
  resolveCombatAction(s,s.creatures[0]!,{type:'Extinguish',targetId:'wood'},[]);expect(s.walls[0]!.burning).toBeNull();
 });
});

it('allows visible empty-hex projectile orders and intercepts occupants without retargeting',()=>{
 const s=fresh(),a=s.creatures[0]!,b=s.creatures[1]!;b.incapacitated=true;a.attacks[0]=attack({mode:'projectile',range:8});a.attacks[0]!.shots[0]!.crit=0;
 const shot={...action([]),ground:h(9,5)};expect(submit(s,a.id,shot).orders).toHaveLength(1);
 beginAttack(s,a,shot,'action');finishAttack(s);expect(b.hp).toBe(8);
 b.centre=h(6,6);beginAttack(s,a,shot,'action');finishAttack(s);expect(b.hp).toBe(8);
});

it('returns an interrupted flyer to its last legal resting footprint',()=>{
 let s=fresh();s.creatures[0]!.centre=h(6,6);s.creatures[0]!.height='air';s.creatures[0]!.attacks[0]!.shots[0]!.skill=99;s.creatures[0]!.attacks[0]!.shots[0]!.crit=0;
 s.creatures[1]!.centre=h(5,5);s.creatures[1]!.height='air';s.creatures[1]!.hp=1;
 s.creatures.push(createCreature('ground-ally','b',h(6,5)));
 s=submit(s,'wizard-0',{type:'Guard',attackId:'staff',targetId:null,area:[]});s=submit(s,'wizard-1',null,[h(6,5),h(7,5)]);
 const result=run(start(s),true);expect(result.state.creatures[1]!.centre).toEqual(h(5,5));expect(result.events.some(e=>e.type==='MovementInterrupted')).toBe(true);
});
it('rejects an area shot that becomes invalid without consuming victim dice',()=>{
 const s=fresh(),a=s.creatures[0]!;a.attacks[0]=attack({mode:'area',range:8,minRange:4,radius:1});const before=s.random.resolution;
 beginAttack(s,a,{...action([]),ground:h(6,5)},'action');const events=finishAttack(s);
 expect(events.some(e=>e.type==='AttackInvalid')).toBe(true);expect(s.random.resolution).toBe(before);
});
it('flanking grants advantage and ranged melee threat imposes disadvantage',()=>{
 for(let seed=1;seed<=20;seed++){
  const s=fresh(seed),a=s.creatures[0]!,b=s.creatures[1]!;a.attacks[0]!.shots[0]!.crit=0;
  s.creatures.push(createCreature('flanker','a',h(7,5)));
  const r1=randomBelow(s.random.resolution,100),r2=randomBelow(r1.state,100);
  beginAttack(s,a,action(),'action');finishAttack(s);expect(b.hp<10).toBe(Math.min(r1.value,r2.value)<65);
  const t=fresh(seed);t.creatures[0]!.attacks[0]=attack({mode:'projectile',range:8});t.creatures[0]!.attacks[0]!.shots[0]!.crit=0;
  beginAttack(t,t.creatures[0]!,action(),'action');finishAttack(t);expect(t.creatures[1]!.hp<10).toBe(Math.max(r1.value,r2.value)<65);
 }
});
it('uses strict health-band boundaries and validates negative damage',()=>{
 const s=fresh(),c=s.creatures[0]!;c.maxHp=9;
 for(const [hp,status] of [[9,'healthy'],[6,'wounded'],[3,'critical'],[0,'incapacitated']] as const){c.hp=hp;expect(health(c)).toBe(status);}
 c.alive=false;expect(health(c)).toBe('dead');expect(()=>wound(s,c,-1)).toThrow('INVALID_DAMAGE');
});
