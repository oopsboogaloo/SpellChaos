import {migrateReloadSnapshot} from '../packages/persistence/src/migration.js';
import {expect,it} from 'vitest';
import {createMatch,createCreature,applyCommand} from '../packages/engine/src/index.js';
import {summonProfile} from '../packages/content/src/summons.js';
import {validateCombatAction,resolveCombatAction,beginAttack,stepAttack} from '../packages/engine/src/combat.js';
import {startScenarioTurn} from '../packages/scenario/src/casting.js';
import {advanceAtomicStep} from '../packages/engine/src/resolver.js';
import {encodeSnapshot,restoreSnapshot} from '../packages/persistence/src/snapshot.js';
import type {GameState,Order} from '../packages/domain/src/state.js';
import type {AttackAction} from '../packages/domain/src/combat.js';
import type {Event} from '../packages/engine/src/events.js';
const shot:AttackAction={type:'Attack',attackId:'basic',targetIds:[],ground:{q:15,r:5},side:'left'};
function setup(level=6){const s=createMatch('reload',['a','b'],456);s.creatures[0]!.centre={q:2,r:2};s.creatures[1]!.centre={q:20,r:15};s.creatures.push(createCreature('siege','a',{q:6,r:5},summonProfile('Summon Archer',level)!),createCreature('target','b',{q:14,r:5},{size:3,con:10}),createCreature('ally','a',{q:16,r:5}));return s;}
const siege=(s:GameState)=>s.creatures.find(c=>c.id==='siege')!;
function order(s:GameState,action:Order['early']){return applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:'a',turn:s.turn,commandId:`order-${s.turn}-${s.revision}`,expectedRevision:s.revision,order:{creatureId:'siege',path:[],early:action,late:null}}).state;}
function run(s:GameState,restore=false){const events:Event[]=[];for(let n=0;!['planning','ended'].includes(s.phase);n++){if(n>1000)throw new Error('STEP_LIMIT');if(restore)s=restoreSnapshot(encodeSnapshot(s));const r=advanceAtomicStep(s);s=r.state;events.push(...r.events);}return {state:s,events};}
it('fire/reload/fire uses three turns and restores exactly at every attack boundary',()=>{
 let s=setup();expect(siege(s).reload).toEqual({loaded:true,lastFiredTurn:null,lastReloadTurn:null});
 s=order(s,shot);let ready=startScenarioTurn(s),a=run(ready),b=run(ready,true);expect(b).toEqual(a);s=a.state;
 expect(s.turn).toBe(2);expect(siege(s).reload).toEqual({loaded:false,lastFiredTurn:1,lastReloadTurn:null});expect(a.events.filter(e=>e.type==='WeaponDischarged')).toHaveLength(1);
 expect(()=>order(s,shot)).toThrow('RELOAD_REQUIRED');s=order(s,{type:'Reload'});ready=startScenarioTurn(s);a=run(ready);b=run(ready,true);expect(b).toEqual(a);s=a.state;
 expect(siege(s).reload).toEqual({loaded:true,lastFiredTurn:1,lastReloadTurn:2});expect(a.events.filter(e=>e.type==='WeaponReloaded')).toHaveLength(1);
 s=order(s,shot);s=run(startScenarioTurn(s),true).state;expect(siege(s).reload).toEqual({loaded:false,lastFiredTurn:3,lastReloadTurn:2});
});
it('reload requires a supported unloaded weapon and cannot occur in the firing turn',()=>{
 const s=setup(),c=siege(s);expect(()=>validateCombatAction(s,s.creatures[0]!,{type:'Reload'})).toThrow('NO_RELOAD');expect(()=>validateCombatAction(s,c,{type:'Reload'})).toThrow('ALREADY_LOADED');
 beginAttack(s,c,shot,'action');expect(()=>validateCombatAction(s,c,{type:'Reload'})).toThrow('CANNOT_RELOAD_FIRING_TURN');const events:Event[]=[];resolveCombatAction(s,c,{type:'Reload'},events);expect(c.reload!.loaded).toBe(false);expect(events[0]!.type).toBe('ActionInvalid');
});
it('firing cannot follow reload in the same turn, including direct resolution attempts',()=>{
 const s=setup(),c=siege(s);s.turn=2;c.reload={loaded:false,lastFiredTurn:1,lastReloadTurn:null};resolveCombatAction(s,c,{type:'Reload'},[]);expect(c.reload!.loaded).toBe(true);
 expect(()=>validateCombatAction(s,c,shot)).toThrow('RELOAD_REQUIRED');const events:Event[]=[];beginAttack(s,c,shot,'guard',events);stepAttack(s,events);expect(events.some(e=>e.type==='AttackInvalid')).toBe(true);expect(c.reload!.loaded).toBe(true);expect(s.creatures.find(c=>c.id==='target')!.hp).toBe(30);
});
it('an invalid committed shot still consumes readiness without damaging a target',()=>{
 let s=setup();s=order(s,{...shot,ground:{q:7,r:5}});const r=run(startScenarioTurn(s),true);expect(siege(r.state).reload!.loaded).toBe(false);expect(r.events.some(e=>e.type==='AttackInvalid')).toBe(true);expect(r.state.creatures.find(c=>c.id==='target')!.hp).toBe(30);
});
it('catapult arcs over ordinary walls and intervening creatures, damaging each area victim once on either team',()=>{
 let s=setup();s.creatures.push(createCreature('interceptor','b',{q:10,r:5}));s.walls.push({id:'wall',edge:{a:{q:8,r:5},b:{q:9,r:5}},material:'stone',hp:11,maxHp:11,burning:null});s=order(s,shot);const r=run(startScenarioTurn(s),true);
 expect(r.state.creatures.find(c=>c.id==='interceptor')!.hp).toBe(10);for(const id of ['target','ally'])expect(r.events.filter(e=>e.type==='DamageApplied'&&e.creatureId===id)).toHaveLength(1);
 expect(r.state.creatures.find(c=>c.id==='target')!.hp).toBeLessThan(30);expect(r.state.creatures.find(c=>c.id==='ally')!.hp).toBeLessThan(10);
});
it('Energy blocks an arcing shot and Trebuchet remains immobile with separate damage components',()=>{
 let s=setup(8);expect(siege(s).move).toBe(0);expect(siege(s).attacks[0]!.shots[0]!.components).toEqual([{type:'physical',amount:6},{type:'fire',amount:6}]);
 s.walls.push({id:'wall',edge:{a:{q:9,r:5},b:{q:10,r:5}},material:'energy',hp:26,maxHp:26,burning:null});s=order(s,shot);const r=run(startScenarioTurn(s),true);expect(r.events.some(e=>e.type==='AttackInvalid')).toBe(true);expect(r.state.creatures.find(c=>c.id==='target')!.hp).toBe(30);
});
it('Trebuchet explosions apply both damage types without an attack-roll critical and hit allies',()=>{
 let s=setup(8);s=order(s,shot);const r=run(startScenarioTurn(s),true);const target=r.state.creatures.find(c=>c.id==='target')!;expect([18,24]).toContain(target.hp);expect(r.state.creatures.find(c=>c.id==='ally')!.hp).toBeLessThan(10);expect(r.events.filter(e=>e.type==='AttackHit').every(e=>e.critical===false)).toBe(true);
});
it('malformed readiness history and unsupported Reload orders cannot be loaded',()=>{
 for(const reload of [{loaded:false,lastFiredTurn:null,lastReloadTurn:null},{loaded:true,lastFiredTurn:1,lastReloadTurn:1},{loaded:true,lastFiredTurn:null,lastReloadTurn:2}]){const s=setup();siege(s).reload=reload;expect(()=>encodeSnapshot(s)).toThrow('INVALID_RELOAD_STATE');}
 const s=setup();s.orders.push({creatureId:'wizard-0',path:[],early:{type:'Reload'},late:null});expect(()=>encodeSnapshot(s)).toThrow('INVALID_RELOAD_ORDER');
});
it('area Guard shoots the first qualifying entrant and retains its locked impact through restore',()=>{
 let s=setup();s.creatures.push(createCreature('walker','b',{q:20,r:5}));
 s=order(s,{type:'Guard',attackId:'basic',targetId:null,area:[]});s=applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:'b',turn:s.turn,commandId:'walker-order',expectedRevision:s.revision,order:{creatureId:'walker',path:[{q:19,r:5}],early:null,late:null}}).state;
 const ready=startScenarioTurn(s),a=run(ready),b=run(ready,true);expect(b).toEqual(a);expect(a.events.filter(e=>e.type==='WeaponDischarged')).toHaveLength(1);expect(a.state.creatures.find(c=>c.id==='walker')!.hp).toBeLessThan(10);expect(siege(a.state).reload!.loaded).toBe(false);
});
it('Double Action cannot bypass the fire/reload exclusion',()=>{
 let s=setup();siege(s).doubleAction=true;
 const submit=(state:GameState,early:Order['early'],late:Order['late'])=>applyCommand(state,{type:'SetOrder',matchId:state.matchId,playerId:'a',turn:state.turn,commandId:'double',expectedRevision:state.revision,order:{creatureId:'siege',path:[],early,late}});
 expect(()=>submit(s,shot,{type:'Reload'})).toThrow();s.turn=2;siege(s).reload={loaded:false,lastFiredTurn:1,lastReloadTurn:null};expect(()=>submit(s,{type:'Reload'},shot)).toThrow();
});
it.each([false,true])('real explosions finish after controller death; dispelled illusion attacks stop (%s)',illusion=>{
 let s=setup();s.creatures=s.creatures.filter(c=>c.kind==='wizard'||c.id==='siege');s.creatures[0]!.centre={q:14,r:5};s.creatures[0]!.hp=-9;s.creatures[1]!.centre={q:16,r:5};s.creatures[1]!.hp=illusion?10:-9;
 if(illusion){siege(s).kind='illusion';siege(s).creatorId='wizard-0';siege(s).knownIllusionBy=['a'];}
 s=order(s,shot);const ready=startScenarioTurn(s),a=run(ready),b=run(ready,true);expect(b).toEqual(a);
 expect(a.state.result).toEqual(illusion?{type:'winner',playerId:'b'}:{type:'draw'});
 if(illusion)expect(a.state.creatures.find(c=>c.id==='wizard-1')!.hp).toBe(10);
});
it.each(['firing','reload-planning','refire-planning','guard'])('permanent %s fixture resumes identically through every atomic step',async name=>{
 const {readFileSync}=await import('node:fs');const text=readFileSync(`tests/fixtures/reload-v14-${name}.json`,'utf8').trim(),s=migrateReloadSnapshot(text);expect(()=>restoreSnapshot(text)).toThrow();expect(s.creatures).toEqual(JSON.parse(text).creatures);const ready=s.phase==='planning'?startScenarioTurn(s):s;expect(run(ready,true)).toEqual(run(ready));
});
it('schema-13 migration retains quarry state and grants no reload capability',async()=>{
 const {readFileSync}=await import('node:fs');const {migrateQuarrySnapshot}=await import('../packages/persistence/src/migration.js');
 const text=readFileSync('tests/fixtures/quarry-v13-attack.json','utf8'),old=JSON.parse(text),next=migrateQuarrySnapshot(text);expect(()=>restoreSnapshot(text)).toThrow();expect(next.schemaVersion).toBe(26);expect(next.creatures).toEqual(old.creatures.map((c:object)=>({...c,reload:null})));expect(next.pendingAttack).toEqual(old.pendingAttack);expect(restoreSnapshot(encodeSnapshot(next))).toEqual(next);
});
it('Trebuchet fire plus physical area damage uses swarm vulnerability only once per component',()=>{
 let s=setup(8);s.creatures=s.creatures.filter(c=>!['target','ally'].includes(c.id));s.creatures.push(createCreature('swarm','b',{q:14,r:5},summonProfile('Summon Serpent',3)!));s=startScenarioTurn(s);s.random.resolution=4;
 beginAttack(s,siege(s),shot,'guard');while(s.pendingAttack)stepAttack(s,[]);
 const swarm=s.creatures.find(c=>c.id==='swarm')!;expect(swarm.hp).toBe(6);expect(swarm.size).toBe(2); // Half damage: ceil(3 × 1.5) for each component.
});
it('owner views expose independent reload state while opponents receive no private readiness or quarry state',async()=>{
 const {projectView}=await import('../packages/views/src/index.js');const s=setup(),enemy=projectView(s,'b'),own=projectView(s,'a');
 const unit=own.creatures.find(c=>c.id==='siege')!;expect(unit.reload).toEqual({loaded:true,lastFiredTurn:null,lastReloadTurn:null});unit.reload!.loaded=false;expect(siege(s).reload!.loaded).toBe(true);
 expect(enemy.creatures.find(c=>c.id==='siege')).not.toHaveProperty('reload');expect(enemy.creatures.find(c=>c.id==='siege')).not.toHaveProperty('quarryTargetId');siege(s).reload={loaded:false,lastFiredTurn:1,lastReloadTurn:null};expect(projectView(s,'b')).toEqual(enemy);
});
