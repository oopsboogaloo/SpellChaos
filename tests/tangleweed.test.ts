import { describe,it,expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { createMatch,createCreature,applyCommand } from '../packages/engine/src/index.js';
import { createWeed,contactWeed,weedStepCost,damageWeed,weedRestrained } from '../packages/engine/src/tangleweed.js';
import { startCast,completeCast,selectOrigin,forceMove } from '../packages/engine/src/casting.js';
import { resolveCombatAction,beginAttack,stepAttack } from '../packages/engine/src/combat.js';
import { expireConditions,cleanupDeaths } from '../packages/engine/src/lifecycle.js';
import { addCondition } from '../packages/engine/src/damage.js';
import { restrained } from '../packages/engine/src/status.js';
import { projectView } from '../packages/views/src/index.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { startScenarioTurn } from '../packages/scenario/src/casting.js';
import { encodeSnapshot,restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { manaCost,castingTime,alignment } from '../packages/content/src/spells.js';
import type { GameState,Order } from '../packages/domain/src/state.js';
import type { CastAction } from '../packages/domain/src/spells.js';
import type { Event } from '../packages/engine/src/events.js';
const h=(q:number,r:number)=>({q,r});
const weed=(level=1,hexes=Array.from({length:level},(_,i)=>h(7+i,5))):CastAction=>({type:'Cast',spell:'Tangleweed',level,variant:'bound',targetId:null,ground:hexes[0]!,hexes,side:'left'});
function fresh(){const s=createMatch('weed',['a','b'],9001);s.creatures[0]!.centre=h(5,5);s.creatures[0]!.spellbook=['Tangleweed','Fire Bolt','Teleport'];s.creatures[1]!.centre=h(20,15);return s;}
function draft(s:GameState,id:string,early:Order['early'],path:Order['path']=[],late:Order['late']=null){return applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:s.creatures.find(c=>c.id===id)!.controller!,turn:s.turn,commandId:`order-${s.revision}`,expectedRevision:s.revision,order:{creatureId:id,path,early,late}}).state;}
function patch(s:GameState,a=weed(),id='patch'){createWeed(s,s.creatures[0]!,a,id,[]);}
function run(s:GameState,restore=false){const events:Event[]=[];for(let n=0;!['planning','ended'].includes(s.phase);n++){if(n>1000)throw new Error('STEP_LIMIT');if(restore)s=restoreSnapshot(encodeSnapshot(s));const r=advanceAtomicStep(s);s=r.state;events.push(...r.events);}return {state:s,events};}

describe('Tangleweed placement and casting',()=>{
 it.each([1,2,3,4,5,6,7,8])('implements level %i connected placement, Slow timing, HP, cost and expiry',level=>{
  const s=fresh(),a=weed(level,Array.from({length:level},(_,i)=>h(6+i%4,6+Math.floor(i/4))));expect(manaCost(a)).toBe(5*level);expect(castingTime(a.spell)).toBe('slow');expect(alignment(a.spell)).toBe(1);
  expect(draft(s,'wizard-0',a).reservations[0]!.amount).toBe(5*level);s.phase='early';startCast(s,s.creatures[0]!,a,[]);expect(s.tangleweed).toEqual([]);s.phase='late';s.random.resolution=1;completeCast(s,s.casts[0]!.id,[]);
  expect(s.tangleweed[0]!.cells).toHaveLength(level);expect(s.tangleweed[0]!.cells.every(c=>c.hp===3*level)).toBe(true);expect(s.balanceUnits).toBe(2*level);expect(s.creatures[0]!.mana).toBe(100-5*level);
  s.turn=level;expireConditions(s);expect(s.tangleweed).toHaveLength(1);s.turn=level+1;expireConditions(s);expect(s.tangleweed).toEqual([]);
 });
 it('rejects disconnected, repeated, missing, off-board and wrong-count cells',()=>{
  for(const a of [weed(2,[h(7,5),h(10,5)]),weed(2,[h(7,5),h(7,5)]),weed(2,[h(7,5)]),{...weed(),hexes:undefined},weed(1,[h(-99,5)])])expect(()=>draft(fresh(),'wizard-0',a)).toThrow();
  expect(()=>draft(fresh(),'wizard-0',{...weed(),spell:'Darkness'})).toThrow();
 });
 it('requires every cell in range and sight of one origin and cannot grow through solid walls',()=>{
  const s=fresh();expect(selectOrigin(s,s.creatures[0]!,weed(8))).toBeNull();
  s.walls.push({id:'wall',material:'stone',edge:{a:h(7,5),b:h(8,5)},hp:11,maxHp:11,burning:null});expect(()=>draft(s,'wizard-0',weed(2))).toThrow();
 });
 it('fails an already-paid cast when a new wall invalidates placement',()=>{
  const s=fresh();s.phase='early';startCast(s,s.creatures[0]!,weed(2),[]);s.walls.push({id:'wall',material:'stone',edge:{a:h(7,5),b:h(8,5)},hp:11,maxHp:11,burning:null});s.phase='late';completeCast(s,s.casts[0]!.id,[]);expect(s.tangleweed).toEqual([]);expect(s.creatures[0]!.mana).toBe(90);expect(s.balanceUnits).toBe(2);
 });
 it('accepts occupied hexes and restrains an allied mindless creature on creation',()=>{
  const s=fresh(),c=createCreature('plant','a',h(7,5),{intelligence:0,size:1});s.creatures.push(c);s.random.resolution=3;patch(s);expect(weedRestrained(s,c)).toBe(true);expect(projectView(s,'a').creatures.find(v=>v.id===c.id)!.restrained).toBe(true);
 });
});

describe('Tangleweed movement, restraint and escape',()=>{
 it('doubles cost once per large footprint and ignores airborne creatures',()=>{
  const s=fresh();patch(s,weed(2));patch(s,weed(2),'overlap');const c=createCreature('large','a',h(6,5),{size:4});expect(weedStepCost(s,c,h(6,5))).toBe(2);c.height='air';expect(weedStepCost(s,c,h(6,5))).toBe(1);
 });
 it('rejects plans exceeding the terrain-adjusted budget',()=>{
  const s=fresh();patch(s,weed(1,[h(6,5)]));expect(()=>draft(s,'wizard-0',null,[h(6,5),h(7,5)])).toThrow('MOVEMENT_BUDGET');
 });
 it('records movement cost and restores a partially traversed path exactly',()=>{
  let s=fresh();s.creatures[0]!.move=4;s=draft(s,'wizard-0',null,[h(6,5),h(7,5),h(8,5)]);patch(s,weed(2,[h(7,5),h(8,5)]));s=startScenarioTurn(s);
  let saved=false;for(let n=0;s.phase!=='planning';n++){if(n>500)throw new Error('STEP_LIMIT');const direct=advanceAtomicStep(s),resumed=advanceAtomicStep(restoreSnapshot(encodeSnapshot(s)));expect(resumed).toEqual(direct);s=direct.state;if(s.movementSpent.some(m=>m.amount===3))saved=true;}
  expect(saved).toBe(true);expect(s.creatures[0]!.centre).toEqual(h(7,5));expect(s.movementSpent).toEqual([]);
 });
 it('attempts at most once per turn across patches and re-entry',()=>{
  const s=fresh(),c=s.creatures[0]!;patch(s);patch(s,weed(),'other');c.centre=h(7,5);s.random.resolution=3;contactWeed(s,c,[]);const rng=s.random.resolution;contactWeed(s,c,[]);expect(s.random.resolution).toBe(rng);expect(s.weedAttempts).toEqual([c.id]);expect(s.weedHolds).toHaveLength(1);
  s.weedHolds=[];contactWeed(s,c,[]);expect(s.weedHolds).toEqual([]);
 });
 it('chooses the strongest overlapping patch and then a stable ID',()=>{
  const s=fresh(),c=s.creatures[0]!;patch(s,weed(2),'z');patch(s,weed(2),'a');patch(s,weed(),'low');c.centre=h(7,5);s.random.resolution=3;contactWeed(s,c,[]);expect(s.weedHolds[0]!.patchId).toBe('a');
 });
 it('escapes weed separately while another restraint remains',()=>{
  const s=fresh(),c=s.creatures[0]!;patch(s);c.centre=h(7,5);s.random.resolution=3;contactWeed(s,c,[]);addCondition(s,c,'Restrained',null,100,null,'physical');
  // Find a deterministic Escape roll that defeats the weed, independently of the other hold.
  let escaped=false;for(let seed=1;seed<1000&&!escaped;seed++){const t=structuredClone(s);t.random.resolution=seed;resolveCombatAction(t,t.creatures[0]!,'Escape',[]);if(!t.weedHolds.length){expect(restrained(t,t.creatures[0]!)).toBe(true);escaped=true;}}expect(escaped).toBe(true);
 });
 it('forces entry checks but ignores flight and releases a hold when forced out',()=>{
  const s=fresh(),c=s.creatures[0]!;patch(s);s.random.resolution=3;forceMove(s,c,h(7,5),[]);expect(weedRestrained(s,c)).toBe(true);forceMove(s,c,h(8,5),[]);expect(s.weedHolds).toEqual([]);
  c.height='air';s.weedAttempts=[];const rng=s.random.resolution;forceMove(s,c,h(7,5),[]);expect(s.random.resolution).toBe(rng);expect(weedRestrained(s,c)).toBe(false);
 });
 it('removes holds on expiry and caster death without removing other conditions',()=>{
  const s=fresh(),c=createCreature('c','b',h(7,5));s.creatures.push(c);s.random.resolution=3;patch(s);addCondition(s,c,'Restrained',null,8,null,'int');s.turn=2;expireConditions(s);expect(s.weedHolds).toEqual([]);expect(restrained(s,c)).toBe(true);
  s.weedAttempts=[];s.random.resolution=3;patch(s);s.creatures[0]!.hp=-10;cleanupDeaths(s,[]);expect(s.tangleweed).toEqual([]);expect(s.weedHolds).toEqual([]);expect(restrained(s,c)).toBe(true);
 });
});

describe('Tangleweed destruction and saves',()=>{
 it('damages each intersected cell once and releases a destroyed holding cell',()=>{
  const s=fresh(),c=createCreature('c','b',h(7,5));s.creatures.push(c);s.random.resolution=3;patch(s,weed(2));expect(weedRestrained(s,c)).toBe(true);
  expect(damageWeed(s,[h(7,5),h(7,5)],[{type:'fire',amount:6}],[],'wizard-0')).toBe(6);expect(s.tangleweed[0]!.cells.map(c=>c.hex)).toEqual([h(8,5)]);expect(s.weedHolds).toEqual([]);
 });
 it('ignores illusion damage and rejects invalid components or unknown sources',()=>{
  const s=fresh();patch(s);s.creatures.push(createCreature('fake','a',h(6,5),{kind:'illusion'}));expect(damageWeed(s,[h(7,5)],[{type:'fire',amount:99}],[],'fake')).toBe(0);expect(()=>damageWeed(s,[h(7,5)],[{type:'fire',amount:-1}],[],'wizard-0')).toThrow();expect(()=>damageWeed(s,[h(7,5)],[],[],'missing')).toThrow();expect(s.tangleweed[0]!.cells[0]!.hp).toBe(3);
 });
 it('lets Fire Bolt hit ground weed, but an intervening creature intercepts it',()=>{
  const s=fresh();patch(s);s.phase='early';s.random.resolution=1;startCast(s,s.creatures[0]!,{type:'Cast',spell:'Fire Bolt',level:1,variant:'bound',targetId:null,ground:h(7,5),side:'left'},[]);expect(s.tangleweed).toEqual([]);
  const t=fresh();patch(t);t.creatures.push(createCreature('blocker','b',h(6,5),{incapacitated:true}));t.phase='early';t.random.resolution=1;startCast(t,t.creatures[0]!,{type:'Cast',spell:'Fire Bolt',level:1,variant:'bound',targetId:null,ground:h(7,5),side:'left'},[]);expect(t.tangleweed[0]!.cells[0]!.hp).toBe(3);expect(t.creatures[2]!.hp).toBeLessThan(10);
 });
 it('damages weed with an arcing area only once per shot across saved victim steps',()=>{
  const s=fresh(),a=s.creatures[0]!;patch(s,weed(2));a.attacks=[{...a.attacks[0]!,id:'area',mode:'area',range:8,radius:1}];s.creatures.push(createCreature('one','b',h(7,5)),createCreature('two','b',h(8,5)));s.phase='early';beginAttack(s,a,{type:'Attack',attackId:'area',targetIds:[],ground:h(7,5),side:'left'},'action');
  const events:Event[]=[];for(let n=0;s.pendingAttack;n++){if(n>20)throw new Error('STEP_LIMIT');stepAttack(s,events);}expect(s.tangleweed[0]!.cells.map(c=>c.hp)).toEqual([4,4]);expect(events.filter(e=>e.type==='TangleweedDamaged')).toHaveLength(1);
 });
 it('rejects malformed terrain, hold and movement references without changing the original',()=>{
  const s=fresh();patch(s);const original=encodeSnapshot(s);for(const mutate of [(t:GameState)=>{t.tangleweed[0]!.cells[0]!.hp=4;},(t:GameState)=>{t.tangleweed[0]!.casterId='missing';},(t:GameState)=>{t.weedHolds.push({creatureId:'wizard-0',patchId:'missing',hex:h(7,5)});},(t:GameState)=>{t.movementSpent.push({creatureId:'missing',amount:1});}]){const t=structuredClone(s);mutate(t);expect(()=>restoreSnapshot(JSON.stringify(t))).toThrow();}expect(encodeSnapshot(s)).toBe(original);
 });
  it('restores every atomic boundary for generated casts and seeds',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:10000}),fc.integer({min:1,max:8}),(seed,level)=>{let s=fresh();s.random.resolution=seed;s=draft(s,'wizard-0',weed(level,Array.from({length:level},(_,i)=>h(6+i%4,6+Math.floor(i/4)))));s=startScenarioTurn(s);expect(run(s,true)).toEqual(run(s));}),{seed:9001,numRuns:20});
 });
});

it('does not retry old standing contacts when a new patch is cast elsewhere',()=>{
 const s=fresh(),c=s.creatures[0]!;patch(s);c.centre=h(7,5);s.random.resolution=1;contactWeed(s,c,[]);expect(s.weedHolds).toEqual([]);s.turn++;s.weedAttempts=[];s.random.resolution=3;patch(s,weed(1,[h(10,5)]),'distant');expect(s.weedAttempts).toEqual([]);expect(s.weedHolds).toEqual([]);
});
it('checks a new summon’s contact without granting it an action',()=>{
 const s=fresh(),c=s.creatures[0]!;patch(s);c.spellbook=['Summon Cat'];s.phase='early';startCast(s,c,{type:'Cast',spell:'Summon Cat',level:1,variant:'illusion',ground:h(7,5),targetId:null,side:'left'},[]);s.random.resolution=3;completeCast(s,s.casts[0]!.id,[]);const summon=s.creatures.at(-1)!;expect(summon.readyTurn).toBe(2);expect(weedRestrained(s,summon)).toBe(true);
});
it('teleporting into weed checks restraint without a Guard reaction',()=>{
 const s=fresh(),c=s.creatures[0]!;patch(s);s.phase='early';s.random.resolution=1;startCast(s,c,{type:'Cast',spell:'Teleport',level:1,variant:'bound',ground:h(7,5),targetId:null,side:'left'},[]);expect(c.centre).toEqual(h(7,5));expect(s.weedAttempts).toEqual([c.id]);expect(s.reactions).toEqual([]);
});
it.each(['planning','casting','movement','held','attack'])('permanent Tangleweed %s fixture restores and continues identically',name=>{
 const text=readFileSync(`tests/fixtures/tangleweed-${name}.json`,'utf8').trim(),s=restoreSnapshot(text);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);const ready=s.phase==='planning'?startScenarioTurn(s):s;expect(run(ready,true)).toEqual(run(ready));
});
it('preserves spent movement even if the remaining terrain is destroyed mid-path',()=>{
 let s=restoreSnapshot(readFileSync('tests/fixtures/tangleweed-movement.json','utf8'));expect(s.movementSpent.find(m=>m.creatureId==='wizard-0')!.amount).toBe(3);damageWeed(s,[h(7,5)],[{type:'fire',amount:3}],[],'wizard-1');const restored=restoreSnapshot(encodeSnapshot(s));expect(restored.movementSpent).toEqual(s.movementSpent);expect(run(restored,true)).toEqual(run(s));
});
