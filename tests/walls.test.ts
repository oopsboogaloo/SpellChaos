import { describe,it,expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { createMatch,createCreature,applyCommand } from '../packages/engine/src/index.js';
import { wallMaterial,createWall,wallStepCost,crossWallHazards,damageStructure,damageAreaWalls,strikeStructure } from '../packages/engine/src/walls.js';
import { startCast,completeCast,interruptCast,forceMove,selectOrigin } from '../packages/engine/src/casting.js';
import { resolveCombatAction,beginAttack,stepAttack } from '../packages/engine/src/combat.js';
import { damageWall,addCondition } from '../packages/engine/src/damage.js';
import { ongoingDamage,expireConditions,cleanupDeaths } from '../packages/engine/src/lifecycle.js';
import { createWeed } from '../packages/engine/src/tangleweed.js';
import { projectView } from '../packages/views/src/index.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { startScenarioTurn } from '../packages/scenario/src/casting.js';
import { encodeSnapshot,restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { alignment,successChance } from '../packages/content/src/spells.js';
import { edge,clearSight,clearProjectile,type Material } from '../packages/geometry/src/walls.js';
import { boundaryEdges } from '../packages/geometry/src/wall-layout.js';
import { placement } from '../packages/geometry/src/occupancy.js';
import { arenaOf } from '../packages/engine/src/orders.js';
import type { GameState,Order } from '../packages/domain/src/state.js';
import type { CastAction } from '../packages/domain/src/spells.js';
import type { AttackAction } from '../packages/domain/src/combat.js';
import type { Event } from '../packages/engine/src/events.js';
const h=(q:number,r:number)=>({q,r});
const castWall=(level=1):CastAction=>({type:'Cast',spell:'Wall',level,variant:'bound',targetId:null,ground:h(7,5),edges:[edge(h(7,5),h(8,5))],side:'left'});
function fresh(){const s=createMatch('walls',['a','b'],10001);s.creatures[0]!.centre=h(5,5);s.creatures[0]!.spellbook=['Wall','Fire Bolt','Magic Bolt','Teleport'];s.creatures[1]!.centre=h(20,15);return s;}
function wall(s:GameState,material:Material='wood',id='wall',a=h(6,5),b=h(7,5),networkId=id){s.walls.push({id,networkId,casterId:'wizard-0',edge:edge(a,b),material,hp:29,maxHp:29,burning:null});}
function draft(s:GameState,id:string,early:Order['early'],path:Order['path']=[],late:Order['late']=null){return applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:s.creatures.find(c=>c.id===id)!.controller!,turn:s.turn,commandId:`order-${s.revision}`,expectedRevision:s.revision,order:{creatureId:id,path,early,late}}).state;}
function run(s:GameState,restore=false){const events:Event[]=[];for(let n=0;!['planning','ended'].includes(s.phase);n++){if(n>1000)throw new Error('STEP_LIMIT');if(restore)s=restoreSnapshot(encodeSnapshot(s));const r=advanceAtomicStep(s);s=r.state;events.push(...r.events);}return {state:s,events};}
const attackWall=(id='wall'):AttackAction=>({type:'Attack',attackId:'staff',targetIds:[],ground:null,structure:{kind:'wall',id},side:'left'});
const bolt=(spell:'Fire Bolt'|'Magic Bolt'='Fire Bolt'):CastAction=>({type:'Cast',spell,level:1,variant:'bound',ground:null,targetId:null,structure:{kind:'wall',id:'wall'},side:'left'});

describe('Wall casting and material alignment',()=>{
 it.each([1,2,3,4,5,6,7,8])('implements material, HP, Slow completion and balance at level %i',level=>{
  const s=fresh(),a=castWall(level),expected=[1,1,1,1,0,-1,1,-1][level-1]!;
  expect(draft(s,'wizard-0',a).reservations[0]!.amount).toBe(5*level);expect(alignment('Wall',level)).toBe(expected);
  expect(successChance(a,80)).toBe(Math.max(5,Math.min(95,95-8*level+10*expected)));
  s.phase='early';startCast(s,s.creatures[0]!,a,[]);expect(s.walls).toEqual([]);s.phase='late';s.random.resolution=1;completeCast(s,s.casts[0]!.id,[]);
  expect(s.walls[0]!.material).toBe(wallMaterial(level));expect(s.walls[0]!.hp).toBe(5+3*level);expect(s.walls[0]!.casterId).toBe('wizard-0');expect(s.balanceUnits).toBe(2*expected*level);expect(s.creatures[0]!.mana).toBe(100-5*level);
  s.turn=20;expireConditions(s);expect(s.walls).toHaveLength(1);
 });
 it.each([1,5,6,7,8])('uses level-specific half alignment on interruption at level %i',level=>{
  const s=fresh();s.phase='early';startCast(s,s.creatures[0]!,castWall(level),[]);interruptCast(s,s.casts[0]!.id,[],'test');expect(s.balanceUnits).toBe(alignment('Wall',level)*level);expect(s.creatures[0]!.mana).toBe(100-5*level);
 });
 it('rejects missing, disconnected, repeated, excessive and non-adjacent edge layouts',()=>{
  const a=castWall();for(const edges of [undefined,[],[...a.edges!,...a.edges!],[...a.edges!,edge(h(12,10),h(13,10))],[{a:h(7,5),b:h(9,5)}],boundaryEdges([h(8,6)])])expect(()=>draft(fresh(),'wizard-0',{...a,edges})).toThrow();
  expect(()=>draft(fresh(),'wizard-0',{...a,spell:'Darkness'})).toThrow();
 });
 it('places a connected closed network and rejects duplicate occupied edges',()=>{
  const s=fresh(),edges=boundaryEdges([h(8,6)]),a={...castWall(4),ground:edges[0]!.a,edges};expect(()=>draft(s,'wizard-0',a)).not.toThrow();createWall(s,s.creatures[0]!,a,'ring',[]);expect(s.walls).toHaveLength(6);expect(new Set(s.walls.map(w=>w.networkId)).size).toBe(1);expect(()=>draft(s,'wizard-0',a)).toThrow();
 });
 it('rejects a solid wall through a large footprint and rechecks before completion',()=>{
  const s=fresh();s.phase='early';startCast(s,s.creatures[0]!,castWall(),[]);s.creatures.push(createCreature('large','b',h(7,5),{size:3}));s.phase='late';completeCast(s,s.casts[0]!.id,[]);expect(s.walls).toEqual([]);expect(s.creatures[0]!.mana).toBe(95);expect(s.balanceUnits).toBe(1);
  const t=fresh();t.creatures.push(createCreature('large','b',h(7,5),{size:3}));expect(()=>draft(t,'wizard-0',castWall())).toThrow();expect(()=>draft(t,'wizard-0',castWall(6))).not.toThrow();
 });
 it('requires range and sight to every segment from the selected origin',()=>{
  const s=fresh(),edges=boundaryEdges([h(14,5)]);expect(selectOrigin(s,s.creatures[0]!,{...castWall(4),ground:edges[0]!.a,edges})).toBeNull();s.darkness.push({id:'dark',casterId:'wizard-1',centre:h(7,5),level:1,createdTurn:1,endsTurn:2});expect(selectOrigin(s,s.creatures[0]!,castWall())).toBeNull();
 });
 it('ends only the deceased caster’s walls and hides caster identity in player views',()=>{
  const s=fresh();wall(s);s.walls.push({...s.walls[0]!,id:'other',networkId:'other',casterId:'wizard-1',edge:edge(h(9,5),h(10,5))});expect(projectView(s,'b').walls[0]).not.toHaveProperty('casterId');s.creatures[0]!.hp=-10;cleanupDeaths(s,[]);expect(s.walls.map(w=>w.id)).toEqual(['other']);expect(s.destroyedWallIds).toEqual(['wall']);
 });
});

describe('Wall material geometry and crossing effects',()=>{
 it('crystal passes sight but stops projectiles; Energy blocks flyers and incorporeal bodies',()=>{
  const s=fresh();wall(s,'crystal');expect(clearSight(h(5,5),h(8,5),'left',s.walls)).toBe(true);expect(clearProjectile(h(5,5),h(8,5),'left',s.walls)).toBe(false);
  s.walls[0]!.material='energy';const c=createCreature('fly','a',h(6,5),{size:3,height:'air',incorporeal:true});expect(placement(arenaOf(s),c,h(6,5)).legal).toBe(false);
 });
 it.each([['thorns',3],['fire',6],['death',10]] as const)('%s applies typed damage once per network per turn', (material,amount)=>{
  const s=fresh(),c=s.creatures[0]!;wall(s,material);expect(crossWallHazards(s,c,h(6,5),h(7,5),[])).toBe(amount);expect(c.hp).toBe(10-amount);expect(crossWallHazards(s,c,h(7,5),h(6,5),[])).toBe(0);expect(s.wallCrossings).toHaveLength(1);
 });
 it('counts multiple segments of one network only once for a large footprint',()=>{
  const s=fresh(),c=createCreature('large','b',h(6,5),{size:3});s.creatures.push(c);wall(s,'fire','one',h(6,5),h(7,5),'network');wall(s,'fire','two',h(6,6),h(7,6),'network');expect(crossWallHazards(s,c,h(6,5),h(7,5),[])).toBe(6);expect(s.wallCrossings).toHaveLength(1);
 });
 it('separate networks trigger independently and normal defences apply',()=>{
  const s=fresh(),c=createCreature('large','b',h(6,5),{size:3,defences:[{type:'fire',multiplier:0.5}]});s.creatures.push(c);wall(s,'fire','one',h(6,5),h(7,5));wall(s,'fire','two',h(6,6),h(7,6));expect(crossWallHazards(s,c,h(6,5),h(7,5),[])).toBe(6);expect(s.wallCrossings).toHaveLength(2);
 });
 it('heals incapacitated undead at Death walls while flyers ignore hazards',()=>{
  const s=fresh(),c=createCreature('zombie','b',h(6,5),{undead:true,hp:-5});s.creatures.push(c);wall(s,'death');expect(crossWallHazards(s,c,h(6,5),h(7,5),[])).toBe(0);expect(c.hp).toBe(5);s.wallCrossings=[];c.height='air';expect(crossWallHazards(s,c,h(6,5),h(7,5),[])).toBe(0);expect(s.wallCrossings).toEqual([]);
 });
 it('combines thorns and weed as double movement, not quadruple movement',()=>{
  const s=fresh();wall(s,'thorns','thorn',h(5,5),h(6,5));createWeed(s,s.creatures[0]!,{type:'Cast',spell:'Tangleweed',level:1,variant:'bound',ground:h(6,5),targetId:null,hexes:[h(6,5)],side:'left'},'weed',[]);expect(wallStepCost(s,s.creatures[0]!,h(5,5),h(6,5))).toBe(2);expect(()=>draft(s,'wizard-0',null,[h(6,5)])).not.toThrow();expect(()=>draft(s,'wizard-0',null,[h(6,5),h(7,5)])).toThrow('MOVEMENT_BUDGET');
 });
 it('forced adjacent movement triggers hazards and cannot cross solid edges; teleport skips hazards',()=>{
  const s=fresh(),c=s.creatures[0]!;wall(s,'fire','f',h(5,5),h(6,5));forceMove(s,c,h(6,5),[]);expect(c.hp).toBe(4);const t=fresh();wall(t,'stone','w',h(5,5),h(6,5));expect(()=>forceMove(t,t.creatures[0]!,h(6,5),[])).toThrow();
  const u=fresh();wall(u,'fire','f',h(5,5),h(6,5));u.phase='early';u.random.resolution=1;startCast(u,u.creatures[0]!,{type:'Cast',spell:'Teleport',level:1,variant:'bound',targetId:null,ground:h(6,5),side:'left'},[]);expect(u.creatures[0]!.hp).toBe(10);expect(u.wallCrossings).toEqual([]);
 });
});

describe('Structural attacks, interception and burning',()=>{
 it('melee hits stationary walls without hit or critical rolls',()=>{
  const s=fresh(),c=s.creatures[0]!;wall(s,'wood','wall',h(5,5),h(6,5));c.attacks[0]!.shots[0]!.crit=100;s.phase='early';const rng=s.random.resolution;beginAttack(s,c,attackWall(),'action');stepAttack(s,[]);expect(s.walls[0]!.hp).toBe(27);expect(s.random.resolution).toBe(rng);
 });
 it('rejects missing structures and ambiguous attack target shapes',()=>{
  const s=fresh();expect(()=>draft(s,'wizard-0',attackWall())).toThrow('UNKNOWN_STRUCTURE');wall(s);expect(()=>draft(s,'wizard-0',{...attackWall(),targetIds:['wizard-1']})).toThrow();expect(()=>draft(s,'wizard-0',{...bolt(),targetId:'wizard-1'})).toThrow();
 });
 it('wastes an attack if its selected segment was destroyed before resolution',()=>{
  const s=fresh();wall(s);const a=attackWall();damageWall(s,'wall',[{type:'physical',amount:99}],[]);s.phase='early';beginAttack(s,s.creatures[0]!,a,'action');const events:Event[]=[];stepAttack(s,events);expect(events.some(e=>e.type==='AttackInvalid')).toBe(true);
 });
 it('intercepted creatures use normal attack damage and critical rolls',()=>{
  const s=fresh(),c=s.creatures[0]!;wall(s,'wood','wall',h(8,5),h(9,5));const blocker=createCreature('blocker','b',h(7,5),{incapacitated:true});s.creatures.push(blocker);c.attacks[0]!.mode='projectile';c.attacks[0]!.range=8;c.attacks[0]!.shots[0]!.crit=100;s.phase='early';beginAttack(s,c,attackWall(),'action');stepAttack(s,[]);expect(blocker.hp).toBe(6);expect(s.walls[0]!.hp).toBe(29);
 });
 it('Fire Bolt targets wood, ignites it for two future turn ends, and Extinguish removes burning',()=>{
  const s=fresh();wall(s);s.phase='early';s.random.resolution=1;startCast(s,s.creatures[0]!,bolt(),[]);expect(s.walls[0]!.hp).toBe(26);expect(s.walls[0]!.burning).toEqual({startsTurn:2,endsTurn:3});ongoingDamage(s,[]);expect(s.walls[0]!.hp).toBe(26);s.turn=2;ongoingDamage(s,[]);expect(s.walls[0]!.hp).toBe(24);s.turn=3;ongoingDamage(s,[]);expireConditions(s);expect(s.walls[0]!.hp).toBe(22);expect(s.walls[0]!.burning).toBeNull();
  s.walls[0]!.burning={startsTurn:4,endsTurn:5};resolveCombatAction(s,s.creatures[0]!,{type:'Extinguish',targetId:'wall'},[]);expect(s.walls[0]!.burning).toBeNull();
 });
 it('Fire Bolt is intercepted by creatures and iron ignores ordinary fire',()=>{
  const s=fresh();wall(s,'wood','wall',h(8,5),h(9,5));s.creatures.push(createCreature('blocker','b',h(7,5),{incapacitated:true}));s.phase='early';s.random.resolution=1;startCast(s,s.creatures[0]!,bolt(),[]);expect(s.walls[0]!.hp).toBe(29);expect(s.walls[0]!.burning).toBeNull();expect(s.creatures[2]!.hp).toBeLessThan(10);
  const t=fresh();wall(t,'iron');damageStructure(t,{kind:'wall',id:'wall'},[{type:'fire',amount:10}],[],'wizard-0',true);expect(t.walls[0]!.hp).toBe(29);
 });
 it('illusion attacks cannot damage or ignite structures',()=>{
  const s=fresh();wall(s);const fake=createCreature('fake','a',h(6,5),{kind:'illusion'});s.creatures.push(fake);damageStructure(s,{kind:'wall',id:'wall'},[{type:'fire',amount:99}],[],'fake',true);expect(s.walls[0]!.hp).toBe(29);expect(s.walls[0]!.burning).toBeNull();
 });
 it('direct weed targeting damages only the chosen overlapping patch',()=>{
  const s=fresh(),a:CastAction={type:'Cast',spell:'Tangleweed',level:1,variant:'bound',targetId:null,ground:h(6,5),hexes:[h(6,5)],side:'left'};createWeed(s,s.creatures[0]!,a,'one',[]);createWeed(s,s.creatures[0]!,a,'two',[]);damageStructure(s,{kind:'weed',id:'one',hex:h(6,5)},[{type:'physical',amount:3}],[],'wizard-0');expect(s.tangleweed.map(w=>w.id)).toEqual(['two']);
 });
 it('area damage hits each segment once even when both adjacent hexes are covered',()=>{
  const s=fresh();wall(s);damageAreaWalls(s,[h(6,5),h(7,5)],[{type:'physical',amount:4}],[],'wizard-0');expect(s.walls[0]!.hp).toBe(25);
 });
 it('blocks structural melee by air and Darkness sight beyond adjacency',()=>{
  const s=fresh(),c=s.creatures[0]!;wall(s,'wood','wall',h(5,5),h(6,5));c.height='air';expect(strikeStructure(s,c,{kind:'wall',id:'wall'},c.attacks[0]!,'left',[{type:'physical',amount:2}],[],c.id).kind).toBe('invalid');c.height='ground';s.walls[0]!.edge=edge(h(8,5),h(9,5));s.darkness.push({id:'dark',casterId:'wizard-1',centre:h(8,5),level:1,createdTurn:1,endsTurn:2});expect(selectOrigin(s,c,bolt())).toBeNull();
 });
 it('retains destruction tombstones so a pending Extinguish order remains portable',()=>{
  let s=fresh();wall(s);s=draft(s,'wizard-0',{type:'Extinguish',targetId:'wall'});s=startScenarioTurn(s);damageWall(s,'wall',[{type:'physical',amount:99}],[]);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);expect(run(s,true)).toEqual(run(s));
 });
});

describe('Wall persistence and deterministic interactions',()=>{
 it('rejects invalid owners, crossing records and damage without replacing a save',()=>{
  const s=fresh();wall(s);const text=encodeSnapshot(s);for(const mutate of [(t:GameState)=>{t.walls[0]!.casterId='missing';},(t:GameState)=>{t.wallCrossings.push({creatureId:'missing',networkId:'wall'});},(t:GameState)=>{t.destroyedWallIds.push('wall');}]){const t=structuredClone(s);mutate(t);expect(()=>restoreSnapshot(JSON.stringify(t))).toThrow();}expect(()=>damageWall(s,'wall',[{type:'physical',amount:-1}],[])).toThrow();expect(encodeSnapshot(s)).toBe(text);
 });
  it('replays all material casts identically through every saved boundary across seeds',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:10000}),fc.integer({min:1,max:8}),(seed,level)=>{let s=fresh();s.random.resolution=seed;s=draft(s,'wizard-0',castWall(level));s=startScenarioTurn(s);expect(run(s,true)).toEqual(run(s));}),{seed:10001,numRuns:24});
 });
});

it('restores area attacks between victims without damaging a wall twice',()=>{
 let s=fresh();wall(s);const c=s.creatures[0]!;c.attacks[0]!.mode='area';c.attacks[0]!.range=8;c.attacks[0]!.radius=1;s.creatures.push(createCreature('one','b',h(6,5)),createCreature('two','b',h(7,5)));
 s=draft(s,'wizard-0',{type:'Attack',attackId:'staff',targetIds:[],ground:h(6,5),side:'left'});s=startScenarioTurn(s);const result=run(s,true);expect(result).toEqual(run(s));expect(result.state.walls[0]!.hp).toBe(27);expect(result.events.filter(e=>e.type==='WallDamaged')).toHaveLength(1);
});
it('resolves a lethal wall crossing before enqueuing Guard reactions',()=>{
 let s=fresh();s.creatures.push(createCreature('mover','a',h(5,6),{size:1,con:1,move:4}),createCreature('guard','b',h(7,6)));wall(s,'fire','flame',h(5,6),h(6,6));
 s=draft(s,'mover',null,[h(6,6)]);s=draft(s,'guard',{type:'Guard',attackId:'staff',targetId:null,area:[]});const result=run(startScenarioTurn(s),true);expect(result.state.creatures.find(c=>c.id==='mover')!.alive).toBe(false);expect(result.events.some(e=>e.type==='AttackHit')).toBe(false);
});
it('remembers network crossings through re-entry and clears the limit next turn',()=>{
 let s=fresh();Object.assign(s.creatures[0]!,{con:10,hp:20,maxHp:20,move:4});wall(s,'fire');s=draft(s,'wizard-0',null,[h(6,5),h(7,5),h(6,5)]);s=run(startScenarioTurn(s),true).state;expect(s.creatures[0]!.hp).toBe(14);expect(s.wallCrossings).toEqual([]);s=draft(s,'wizard-0',null,[h(7,5)]);s=run(startScenarioTurn(s),true).state;expect(s.creatures[0]!.hp).toBe(8);
});
it('refreshes wood burning without multiplying its tick damage',()=>{
 const s=fresh();wall(s);damageStructure(s,{kind:'wall',id:'wall'},[{type:'fire',amount:1}],[],'wizard-0',true);s.turn=2;damageStructure(s,{kind:'wall',id:'wall'},[{type:'fire',amount:1}],[],'wizard-0',true);expect(s.walls[0]!.burning).toEqual({startsTurn:2,endsTurn:4});ongoingDamage(s,[]);expect(s.walls[0]!.hp).toBe(25);s.turn=3;ongoingDamage(s,[]);expect(s.walls[0]!.hp).toBe(23);
});
it.each(['planning','casting','crossing','interception','resolved'])('permanent Wall %s fixture restores and continues identically',name=>{
 const text=readFileSync(`tests/fixtures/walls-${name}.json`,'utf8').trim(),s=restoreSnapshot(text);const ready=s.phase==='planning'?startScenarioTurn(s):s;expect(run(ready,true)).toEqual(run(ready));
});

it('refreshing a burning creature also retains its already-due tick',()=>{
 const s=fresh(),c=s.creatures[0]!;addCondition(s,c,'Burning','wizard-1',1,2,'con');s.turn=2;addCondition(s,c,'Burning','wizard-1',1,2,'con');ongoingDamage(s,[]);expect(c.hp).toBe(8);expect(c.conditions[0]!.startsTurn).toBe(2);expect(c.conditions[0]!.endsTurn).toBe(4);
});
it('hits an intervening crystal wall with a projectile but blocks melee through it',()=>{
 const s=fresh(),c=s.creatures[0]!;wall(s,'crystal','screen',h(6,5),h(7,5));wall(s,'wood','target',h(8,5),h(9,5));const target={kind:'wall' as const,id:'target'},components=[{type:'physical' as const,amount:2}];
 expect(strikeStructure(s,c,target,{mode:'projectile',range:8,minRange:0},'left',components,[],c.id).kind).toBe('terrain');expect(s.walls.find(w=>w.id==='screen')!.hp).toBe(27);expect(s.walls.find(w=>w.id==='target')!.hp).toBe(29);
 expect(strikeStructure(s,c,target,{mode:'melee',range:8,minRange:0},'left',components,[],c.id).kind).toBe('invalid');
});
