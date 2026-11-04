import { describe,it,expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { createMatch,createCreature,applyCommand } from '../packages/engine/src/index.js';
import { startCast,completeCast,selectOrigin } from '../packages/engine/src/casting.js';
import { cleanupDeaths,expireConditions } from '../packages/engine/src/lifecycle.js';
import { beginAttack,stepAttack,hitModifiers } from '../packages/engine/src/combat.js';
import { darkAt,sight,visibleTo } from '../packages/engine/src/visibility.js';
import { emit,type Event } from '../packages/engine/src/events.js';
import { projectView,projectEvents } from '../packages/views/src/index.js';
import { encodeSnapshot,restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { migrateIllusionSnapshot,migrateDarknessSnapshot } from '../packages/persistence/src/migration.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { startScenarioTurn } from '../packages/scenario/src/casting.js';
import { manaCost,spellRange,castingTime,alignment } from '../packages/content/src/spells.js';
import type { GameState,Creature } from '../packages/domain/src/state.js';
import type { CastAction } from '../packages/domain/src/spells.js';
const h=(q:number,r:number)=>({q,r});
function fresh(){const s=createMatch('darkness',['a','b'],8001);s.creatures[0]!.centre=h(5,5);s.creatures[0]!.spellbook=['Darkness','Magic Bolt'];s.creatures[1]!.centre=h(20,15);return s;}
const spell=(level=1):CastAction=>({type:'Cast',spell:'Darkness',level,variant:'bound',targetId:null,ground:h(9,5),side:'left'});
function cloud(s:GameState,level=1,centre=h(9,5)){s.darkness.push({id:`cloud-${s.darkness.length}`,casterId:'wizard-0',centre,level,createdTurn:s.turn,endsTurn:s.turn+level});}
function enemy(s:GameState,overrides:Partial<Creature>={}){const c=createCreature('enemy','b',h(9,5),overrides);s.creatures.push(c);return c;}
function order(s:GameState,action:CastAction){return applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:'a',turn:s.turn,commandId:`order-${s.revision}`,expectedRevision:s.revision,order:{creatureId:'wizard-0',path:[],early:action,late:null}}).state;}
function run(s:GameState,restore=false){const events:Event[]=[];for(let n=0;!['planning','ended'].includes(s.phase);n++){if(n>500)throw new Error('STEP_LIMIT');if(restore)s=restoreSnapshot(encodeSnapshot(s));const r=advanceAtomicStep(s);s=r.state;events.push(...r.events);}return {state:s,events};}

describe('Darkness casting and lifecycle',()=>{
 it.each([1,2,3,4,5,6,7,8])('implements level %i cost, radius, Quick timing and duration',level=>{
  const s=fresh(),a=spell(level);expect(manaCost(a)).toBe(5*level);expect(spellRange(a)).toBe(8);expect(castingTime(a.spell)).toBe('quick');expect(alignment(a.spell)).toBe(-1);
  expect(order(s,a).reservations[0]!.amount).toBe(5*level);
  s.phase='early';startCast(s,s.creatures[0]!,a,[]);expect(s.darkness).toEqual([]);s.random.resolution=1;completeCast(s,s.casts[0]!.id,[]);
  expect(s.darkness).toHaveLength(1);expect(s.creatures[0]!.mana).toBe(100-5*level);expect(s.balanceUnits).toBe(-2*level);
  const radius=1+Math.floor(level/3);expect(darkAt(s,h(9+radius,5))).toBe(true);expect(darkAt(s,h(10+radius,5))).toBe(false);
  s.turn=level;expireConditions(s);expect(s.darkness).toHaveLength(1);s.turn=level+1;expireConditions(s);expect(s.darkness).toEqual([]);
 });
 it('rejects creature targeting, off-board ground and invalid variants',()=>{
  const s=fresh();for(const a of [{...spell(),ground:null,targetId:'wizard-1'},{...spell(),ground:h(-100,0)},{...spell(),variant:'illusion' as const}])expect(()=>order(s,a)).toThrow();
 });
 it('rechecks sight when a queued Quick cast completes and spends its mana',()=>{
  const s=fresh();s.phase='early';startCast(s,s.creatures[0]!,spell(),[]);cloud(s,1,h(7,5));const rng=s.random.resolution;completeCast(s,s.casts[0]!.id,[]);
  expect(s.darkness).toHaveLength(1);expect(s.creatures[0]!.mana).toBe(95);expect(s.balanceUnits).toBe(-1);expect(s.random.resolution).toBe(rng);
 });
 it('removes only the dead caster’s clouds, preserving independent overlapping clouds',()=>{
  const s=fresh();cloud(s);s.darkness.push({...s.darkness[0]!,id:'other',casterId:'wizard-1'});s.creatures[0]!.hp=-10;cleanupDeaths(s,[]);expect(s.darkness.map(d=>d.id)).toEqual(['other']);
 });
 it('allows a border centre and overlapping areas without extra disadvantage',()=>{
  const s=fresh();cloud(s,8,h(0,0));cloud(s,8,h(0,0));expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);expect(darkAt(s,h(0,0))).toBe(true);
 });
});

describe('Darkness sight, combat and privacy',()=>{
 it('blocks rays into, through and out of a cloud but not a clear ray',()=>{
  const s=fresh(),c=s.creatures[0]!;cloud(s);expect(sight(s,c,h(5,5),h(9,5),'left')).toBe(false);expect(sight(s,c,h(5,5),h(13,5),'left')).toBe(false);expect(sight(s,c,h(9,5),h(5,5),'left')).toBe(false);expect(sight(s,c,h(5,5),h(5,8),'left')).toBe(true);
 });
 it('keeps owners visible, hides enemy occupants, and permits adjacent inspection',()=>{
  const s=fresh(),target=enemy(s);cloud(s);expect(visibleTo(s,target,'a')).toBe(false);expect(visibleTo(s,target,'b')).toBe(true);expect(projectView(s,'a').creatures.some(c=>c.id===target.id)).toBe(false);
  s.creatures[0]!.centre=h(8,5);expect(visibleTo(s,target,'a')).toBe(true);expect(selectOrigin(s,s.creatures[0]!,{...spell(),spell:'Magic Bolt',ground:null,targetId:target.id})).toBeNull();
 });
 it('does not disclose secret target IDs through spell planning',()=>{
  const s=fresh(),target=enemy(s);cloud(s);expect(()=>order(s,{...spell(),spell:'Magic Bolt',ground:null,targetId:target.id})).toThrow('INVALID_SPELL_TARGET');
 });
 it('permits adjacent melee with disadvantage; walls still block and immunity to disadvantage does not grant vision',()=>{
  const s=fresh(),a=s.creatures[0]!,b=enemy(s);a.centre=h(8,5);cloud(s);s.phase='early';const attack=a.attacks[0]!;
  expect(hitModifiers(s,a,b,attack)).toEqual([false,true]);a.ignoresDarknessDisadvantage=true;expect(hitModifiers(s,a,b,attack)).toEqual([false,false]);expect(sight(s,a,a.centre,b.centre,'left')).toBe(false);
  a.ignoresDarknessDisadvantage=false;b.incapacitated=true;beginAttack(s,a,{type:'Attack',attackId:attack.id,targetIds:[b.id],ground:null,side:'left'},'action');stepAttack(s,[]);expect(b.hp).toBeLessThan(b.maxHp);
  b.hp=b.maxHp;s.walls.push({id:'wall',edge:{a:a.centre,b:b.centre},material:'stone',hp:11,maxHp:11,burning:null});beginAttack(s,a,{type:'Attack',attackId:attack.id,targetIds:[b.id],ground:null,side:'left'},'action');stepAttack(s,[]);expect(b.hp).toBe(b.maxHp);
 });
 it('respects limited Darkness sight without allowing sight through stone',()=>{
  const s=fresh(),a=s.creatures[0]!,b=enemy(s);cloud(s);a.darknessSightRange=4;expect(sight(s,a,a.centre,b.centre,'left')).toBe(true);expect(visibleTo(s,b,'a')).toBe(true);a.darknessSightRange=3;expect(sight(s,a,a.centre,b.centre,'left')).toBe(false);
  a.darknessSightRange=10;s.walls.push({id:'wall',edge:{a:h(6,5),b:h(7,5)},material:'stone',hp:11,maxHp:11,burning:null});expect(sight(s,a,a.centre,b.centre,'left')).toBe(false);
 });
 it('captures event audiences before expiry and never exports them or sequence numbers',()=>{
  const s=fresh(),b=enemy(s);cloud(s);const events:Event[]=[];emit(s,events,{type:'AttackHit',creatureId:b.id,targetId:'wizard-1'});s.darkness=[];
  expect(projectEvents(s,'a',events)).toEqual([]);expect(projectEvents(s,'b',events)).toHaveLength(1);expect(projectEvents(s,'b',events)[0]).not.toHaveProperty('audience');expect(projectEvents(s,'b',events)[0]).not.toHaveProperty('sequence');
 });
 it('does not reveal a hidden movement origin when the enemy emerges',()=>{
  const s=fresh(),b=enemy(s);cloud(s);const from={...b.centre};b.centre=h(13,5);const events:Event[]=[];emit(s,events,{type:'CreatureMoved',creatureId:b.id,from,to:b.centre});expect(projectEvents(s,'a',events)).toEqual([]);
 });
});

describe('Darkness saves and continuation',()=>{
 it('matches uninterrupted play at every atomic boundary for generated seeds and levels',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:100000}),fc.integer({min:1,max:8}),(seed,level)=>{let s=fresh();s.random.resolution=seed;s=order(s,spell(level));s=startScenarioTurn(s);expect(run(s,true)).toEqual(run(s));}),{seed:8001,numRuns:20});
 });
 it('rejects malformed area references, duplicate IDs and invalid durations transactionally',()=>{
  const s=fresh();cloud(s);const original=encodeSnapshot(s);
  for(const mutate of [(t:GameState)=>{t.darkness[0]!.casterId='missing';},(t:GameState)=>{t.darkness[0]!.endsTurn=999;},(t:GameState)=>{t.darkness[0]!.centre=h(-99,0);},(t:GameState)=>{t.darkness.push({...t.darkness[0]!});}]){const t=structuredClone(s);mutate(t);expect(()=>restoreSnapshot(JSON.stringify(t))).toThrow();}expect(encodeSnapshot(s)).toBe(original);
 });
 it('explicitly migrates v7 without changing RNG or pending attacks',()=>{
  const text=readFileSync('tests/fixtures/illusions-v7-attack.json','utf8'),old=JSON.parse(text);expect(()=>restoreSnapshot(text)).toThrow();const s=migrateIllusionSnapshot(text);expect(s.random).toEqual(old.random);expect(s.pendingAttack).toEqual(old.pendingAttack);expect(s.damageLedger).toEqual(old.damageLedger);expect(s.darkness).toEqual([]);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
 });
});

describe('Darkness interaction regressions',()=>{
 it('invalidates a preplanned ranged target but permits an arcing area at remembered ground',()=>{
  const s=fresh(),a=s.creatures[0]!,b=enemy(s,{incapacitated:true});cloud(s);s.phase='early';
  a.attacks=[{...a.attacks[0]!,id:'bow',mode:'projectile',range:8}];
  beginAttack(s,a,{type:'Attack',attackId:'bow',targetIds:[b.id],ground:null,side:'left'},'action');stepAttack(s,[]);expect(b.hp).toBe(10);
  a.attacks=[{...a.attacks[0]!,id:'stone',mode:'area',radius:1}];
  beginAttack(s,a,{type:'Attack',attackId:'stone',targetIds:[],ground:b.centre,side:'left'},'action');stepAttack(s,[]);expect(b.hp).toBeLessThan(10);
 });
 it('uses the familiar’s vision and location for remote casting',()=>{
  const s=fresh(),a=s.creatures[0]!;cloud(s);const f=createCreature('familiar','a',h(9,5),{familiar:true,bindingLevel:1,darknessSightRange:3});s.creatures.push(f);
  const target=enemy(s);const action={...spell(),spell:'Magic Bolt' as const,ground:null,targetId:target.id};expect(selectOrigin(s,a,action)?.id).toBe(f.id);f.centre=h(8,5);f.darknessSightRange=0;expect(selectOrigin(s,a,action)).toBeNull();
 });
 it('handles partially covered large footprints using the nearest boundary ray',()=>{
  const s=fresh(),a=s.creatures[0]!,b=enemy(s,{size:3});cloud(s,1,h(10,5));expect(visibleTo(s,b,'a')).toBe(true);a.centre=h(13,5);expect(visibleTo(s,b,'a')).toBe(false);
 });
 it('blocks direct projectile fire into dark ground and hidden combat target commands',()=>{
  const s=fresh(),a=s.creatures[0]!,b=enemy(s);cloud(s);a.attacks=[{...a.attacks[0]!,id:'bow',mode:'projectile',range:8}];
  expect(()=>applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:'a',turn:1,commandId:'hidden',expectedRevision:0,order:{creatureId:a.id,path:[],early:{type:'Attack',attackId:'bow',targetIds:[b.id],ground:null,side:'left'},late:null}})).toThrow('UNKNOWN_TARGET');
  s.phase='early';beginAttack(s,a,{type:'Attack',attackId:'bow',targetIds:[],ground:b.centre,side:'left'},'action');stepAttack(s,[]);expect(b.hp).toBe(10);
 });
});

 it.each(['planning','casting','active'])('retains the immutable v8 %s fixture and resumes every boundary exactly',name=>{
  const text=readFileSync(`tests/fixtures/darkness-v8-${name}.json`,'utf8').trim(),s=migrateDarknessSnapshot(text);expect(()=>restoreSnapshot(text)).toThrow();expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
  const ready=s.phase==='planning'?startScenarioTurn(s):s;expect(run(ready,true)).toEqual(run(ready));
 });
 it('blocks Magic Attack family spread into Darkness',()=>{
  const s=fresh(),a=s.creatures[0]!;s.phase='early';a.spellbook=['Magic Attack'];
  const original=createCreature('original','b',h(7,5),{family:'Cat',incapacitated:true});const hidden=enemy(s,{family:'Cat',incapacitated:true});s.creatures.push(original);cloud(s,1,h(10,5));
  s.random.resolution=1;startCast(s,a,{...spell(),spell:'Magic Attack',targetId:original.id,ground:null},[]);
  expect(original.hp).toBeLessThan(10);expect(hidden.hp).toBe(10);
 });
