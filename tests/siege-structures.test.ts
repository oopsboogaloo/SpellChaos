import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createMatch,createCreature,applyCommand} from '../packages/engine/src/index.js';
import {summonProfile} from '../packages/content/src/summons.js';
import {startScenarioTurn} from '../packages/scenario/src/casting.js';
import {advanceAtomicStep} from '../packages/engine/src/resolver.js';
import {encodeSnapshot,restoreSnapshot} from '../packages/persistence/src/snapshot.js';
import type {GameState} from '../packages/domain/src/state.js';
import type {Event} from '../packages/engine/src/events.js';
function setup(illusion=false){
 let s=createMatch('siege-structures',['a','b'],456);
 s.creatures[0]!.centre={q:2,r:2};s.creatures[1]!.centre={q:20,r:15};
 s.creatures.push(createCreature('siege','a',{q:6,r:5},{...summonProfile('Summon Archer',7)!,...(illusion?{kind:'illusion',creatorId:'wizard-0',knownIllusionBy:['a']}: {})}),createCreature('target','b',{q:15,r:5},{con:20}));
 s.walls.push({id:'wall',edge:{a:{q:15,r:5},b:{q:16,r:5}},material:'stone',hp:29,maxHp:29,burning:null});
 s=applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:'a',turn:1,commandId:'fire',expectedRevision:s.revision,order:{creatureId:'siege',path:[],early:{type:'Attack',attackId:'basic',targetIds:[],ground:{q:15,r:5},side:'left'},late:null}}).state;
 return startScenarioTurn(s);
}
function run(s:GameState,restore=false){const events:Event[]=[];for(let n=0;!['planning','ended'].includes(s.phase);n++){if(n>1000)throw new Error('STEP_LIMIT');const r=advanceAtomicStep(restore?restoreSnapshot(encodeSnapshot(s)):s);s=r.state;events.push(...r.events);}return {state:s,events};}
it('Siege Catapult doubles structure damage once per segment without doubling creature damage',()=>{
 const initial=setup(),a=run(initial),b=run(initial,true);expect(b).toEqual(a);expect(a.state.walls[0]!.hp).toBe(15);
 expect([33,36]).toContain(a.state.creatures.find(c=>c.id==='target')!.hp);
 expect(a.state.creatures.find(c=>c.id==='siege')!.reload!.loaded).toBe(false);
});
it('illusory siege shots cannot damage structures but still damage intelligent creatures',()=>{
 const r=run(setup(true),true);expect(r.state.walls[0]!.hp).toBe(29);expect(r.state.creatures.find(c=>c.id==='target')!.hp).toBeLessThan(40);
});
it('destroyed walls remain destroyed across mid-attack restore and are not struck twice',()=>{
 const s=setup();s.walls[0]!.hp=14;const a=run(s),b=run(s,true);expect(b).toEqual(a);expect(a.state.walls).toEqual([]);expect(a.events.filter(e=>e.type==='WallDamaged')).toHaveLength(1);
});
it('structure multiplier validation rejects unsupported values',()=>{
 const raw=JSON.parse(encodeSnapshot(setup()));raw.creatures.find((c:{id:string})=>c.id==='siege').attacks[0].structureMultiplier=3;expect(()=>restoreSnapshot(JSON.stringify(raw))).toThrow();
});
it.each([false,true])('siege damage to constructed Tangleweed respects illusion restrictions (%s)',illusion=>{
 const s=setup(illusion);s.tangleweed.push({id:'weed',casterId:'wizard-1',level:8,createdTurn:1,endsTurn:9,cells:[{hex:{q:15,r:5},hp:24}]});
 const a=run(s),b=run(s,true);expect(b).toEqual(a);expect(a.state.tangleweed[0]!.cells[0]!.hp).toBe(illusion?24:10);
});
it('permanent mid-impact fixture resumes without repeating structure damage',()=>{
 const text=readFileSync('tests/fixtures/siege-impact.json','utf8').trim(),s=restoreSnapshot(text);expect(s.walls[0]!.hp).toBe(15);
 const a=run(s),b=run(s,true);expect(b).toEqual(a);expect(a.state.walls[0]!.hp).toBe(15);expect(a.events.some(e=>e.type==='WallDamaged')).toBe(false);
});
