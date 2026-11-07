import {migrateQuarrySnapshot} from '../packages/persistence/src/migration.js';
import {expect,it} from 'vitest';
import {createMatch,createCreature,applyCommand} from '../packages/engine/src/index.js';
import {summonProfile} from '../packages/content/src/summons.js';
import {validateCombatAction,resolveCombatAction,creatureAttackModifiers,beginAttack,stepAttack} from '../packages/engine/src/combat.js';
import {cleanupDeaths} from '../packages/engine/src/lifecycle.js';
import {startScenarioTurn} from '../packages/scenario/src/casting.js';
import {advanceAtomicStep} from '../packages/engine/src/resolver.js';
import {encodeSnapshot,restoreSnapshot} from '../packages/persistence/src/snapshot.js';
import type {GameState,Order} from '../packages/domain/src/state.js';
import type {Event} from '../packages/engine/src/events.js';
function setup(){const s=createMatch('quarry',['a','b'],654);s.creatures[0]!.centre={q:2,r:2};s.creatures[1]!.centre={q:20,r:15};s.creatures.push(createCreature('hunter','a',{q:10,r:10},summonProfile('Summon Spirit',7)!),createCreature('prey','b',{q:12,r:10},{dex:8}),createCreature('other','b',{q:15,r:10}));return s;}
const hunter=(s:GameState)=>s.creatures.find(c=>c.id==='hunter')!;
const prey=(s:GameState)=>s.creatures.find(c=>c.id==='prey')!;
function order(s:GameState,early:Order['early'],late:Order['late']=null){return applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:'a',turn:s.turn,commandId:`order-${s.revision}`,expectedRevision:s.revision,order:{creatureId:'hunter',path:[],early,late}}).state;}
function run(s:GameState,restore=false){const events:Event[]=[];for(let n=0;!['planning','ended'].includes(s.phase);n++){if(n>1000)throw new Error('STEP_LIMIT');if(restore)s=restoreSnapshot(encodeSnapshot(s));const result=advanceAtomicStep(s);s=result.state;events.push(...result.events);}return {state:s,events};}
it('selection costs the normal action and survives every atomic boundary and the next turn',()=>{
 let s=setup();const mark={type:'MarkQuarry' as const,targetId:'prey'};
 expect(()=>order(s,mark,{type:'Attack',attackId:'basic',targetIds:['prey'],ground:null,side:'left'})).toThrow();
 s=order(s,mark);const originalHp=prey(s).hp;const ready=startScenarioTurn(s),a=run(ready),b=run(ready,true);expect(b).toEqual(a);
 expect(hunter(a.state).quarryTargetId).toBe('prey');expect(prey(a.state).hp).toBe(originalHp);expect(a.events.filter(e=>e.type==='QuarryMarked')).toHaveLength(1);
 expect(hunter(run(startScenarioTurn(a.state),true).state).quarryTargetId).toBe('prey');
});
it('changing quarry replaces the bonus; losing a target clears it without selecting another',()=>{
 const s=setup(),h=hunter(s);resolveCombatAction(s,h,{type:'MarkQuarry',targetId:'prey'},[]);expect(creatureAttackModifiers(s,h,prey(s),'action').skill).toBe(2);
 resolveCombatAction(s,h,{type:'MarkQuarry',targetId:'other'},[]);expect(creatureAttackModifiers(s,h,prey(s),'action').skill).toBe(0);
 const other=s.creatures.find(c=>c.id==='other')!;expect(creatureAttackModifiers(s,h,other,'action').skill).toBe(2);other.hp=-other.maxHp;cleanupDeaths(s,[]);expect(h.quarryTargetId).toBeNull();
});
it('the selected bonus affects production hit rolls, not merely the preview',()=>{
 for(const marked of [false,true]){
  let s=setup();hunter(s).attacks[0]!.shots[0]!.crit=0;if(marked)resolveCombatAction(s,hunter(s),{type:'MarkQuarry',targetId:'prey'},[]);
  s=startScenarioTurn(s);s.random.resolution=4;beginAttack(s,hunter(s),{type:'Attack',attackId:'basic',targetIds:['prey'],ground:null,side:'left'},'guard');stepAttack(s,[]);
  expect(prey(s).hp).toBe(marked?3:10); // Seed 4 rolls 75: misses 70%, hits 80%.
 }
});
it('rejects missing ability, self, unknown, dead and hidden selections during planning',()=>{
 const s=setup(),h=hunter(s);expect(()=>validateCombatAction(s,s.creatures[0]!,{type:'MarkQuarry',targetId:'prey'})).toThrow('NO_MARKED_QUARRY');
 for(const targetId of ['hunter','missing'])expect(()=>validateCombatAction(s,h,{type:'MarkQuarry',targetId})).toThrow();
 prey(s).alive=false;expect(()=>validateCombatAction(s,h,{type:'MarkQuarry',targetId:'prey'})).toThrow();prey(s).alive=true;
 s.darkness.push({id:'dark',casterId:'wizard-1',centre:{q:15,r:10},level:1,createdTurn:1,endsTurn:2});expect(()=>validateCombatAction(s,h,{type:'MarkQuarry',targetId:'other'})).toThrow('UNKNOWN_TARGET');
});
it('a target hidden before resolution wastes the action and preserves the previous mark',()=>{
 const s=setup(),h=hunter(s);resolveCombatAction(s,h,{type:'MarkQuarry',targetId:'prey'},[]);validateCombatAction(s,h,{type:'MarkQuarry',targetId:'other'});
 s.darkness.push({id:'dark',casterId:'wizard-1',centre:{q:15,r:10},level:1,createdTurn:1,endsTurn:2});const events:Event[]=[];resolveCombatAction(s,h,{type:'MarkQuarry',targetId:'other'},events);expect(h.quarryTargetId).toBe('prey');expect(events[0]!.type).toBe('ActionInvalid');
});
it('illusory revenants retain the combat ability without changing target truth',()=>{
 const s=setup(),h=hunter(s);h.kind='illusion';h.creatorId='wizard-0';h.knownIllusionBy=['a'];const before=structuredClone(prey(s));resolveCombatAction(s,h,{type:'MarkQuarry',targetId:'prey'},[]);expect(creatureAttackModifiers(s,h,prey(s),'action').skill).toBe(2);expect(prey(s)).toEqual(before);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
});
it('rejects malformed quarry references and unsupported planned use on load',()=>{
 for(const target of ['missing','hunter']){const s=setup();hunter(s).quarryTargetId=target;expect(()=>encodeSnapshot(s)).toThrow('INVALID_QUARRY');}
 const s=setup();s.creatures[0]!.quarryTargetId='prey';expect(()=>encodeSnapshot(s)).toThrow('INVALID_QUARRY');
 const forged=setup();forged.orders.push({creatureId:'wizard-0',path:[],early:{type:'MarkQuarry',targetId:'prey'},late:null});expect(()=>encodeSnapshot(forged)).toThrow('INVALID_QUARRY_ORDER');
});
it.each(['planning','marked','attack'])('permanent %s fixture resumes identically at every atomic boundary',async name=>{
 const {readFileSync}=await import('node:fs');const text=readFileSync(`tests/fixtures/quarry-v13-${name}.json`,'utf8').trim(),s=migrateQuarrySnapshot(text);expect(()=>restoreSnapshot(text)).toThrow();
 const ready=s.phase==='planning'?startScenarioTurn(s):s;expect(run(ready,true)).toEqual(run(ready));
});
it('schema-12 migration preserves existing on-hit state without granting Marked Quarry',async()=>{
 const {readFileSync}=await import('node:fs');const {migrateOnHitSnapshot}=await import('../packages/persistence/src/migration.js');
 const text=readFileSync('tests/fixtures/onhit-v12-bristles.json','utf8'),old=JSON.parse(text),s=migrateOnHitSnapshot(text);expect(()=>restoreSnapshot(text)).toThrow();
 expect(s.creatures).toEqual(old.creatures.map((c:object)=>({...c,reload:null,canMarkQuarry:false,quarryTargetId:null})));expect(s.random).toEqual(old.random);expect(s.pendingAttack).toEqual(old.pendingAttack);expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
});
