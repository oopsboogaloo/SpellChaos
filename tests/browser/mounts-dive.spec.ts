import {migrateRosterSnapshot} from '../../packages/persistence/src/migration.js';
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {Event} from '../../packages/engine/src/events.js';
import {restoreSnapshot,encodeSnapshot} from '../../packages/persistence/src/snapshot.js';
import {stateFingerprint} from '../../packages/persistence/src/digest.js';
import {startScenarioTurn} from '../../packages/scenario/src/casting.js';
import {advanceAtomicStep} from '../../packages/engine/src/resolver.js';
import {projectView,projectEvents} from '../../packages/views/src/index.js';

for(const name of ['carried-flight','dive-between-strikes','rider-guard','death-dismount','mounted-sling','full-roster','review-held-dismount','review-hazard-mount']){
 test(`Node and Chromium agree on ${name} at every saved boundary`,async({page})=>{
  const initial=encodeSnapshot(migrateRosterSnapshot(readFileSync(`tests/fixtures/mounts-v26-${name}.json`,'utf8')));
  let s=restoreSnapshot(initial);if(s.phase==='planning')s=startScenarioTurn(s);
  const events:Event[]=[],fingerprints:string[]=[],permitted:ReturnType<typeof projectEvents>[][]=[];
  for(let n=0;!['planning','ended'].includes(s.phase);n++){
   if(n>2000)throw new Error('STEP_LIMIT');
   const r=advanceAtomicStep(s);s=r.state;events.push(...r.events);fingerprints.push(stateFingerprint(s));permitted.push(s.players.map(p=>projectEvents(s,p.id,r.events)));
  }
  await page.goto('/');
  const actual=await page.evaluate(async({root,initial})=>{
   const persistence=await import(root+'/packages/persistence/src/snapshot.ts');
   const digest=await import(root+'/packages/persistence/src/digest.ts');
   const resolver=await import(root+'/packages/engine/src/resolver.ts');
   const scenario=await import(root+'/packages/scenario/src/casting.ts');
   const views=await import(root+'/packages/views/src/index.ts');
   let state=persistence.restoreSnapshot(initial);if(state.phase==='planning')state=scenario.startScenarioTurn(state);
   const events:Event[]=[],fingerprints:string[]=[],permitted:ReturnType<typeof projectEvents>[][]=[];
   for(let n=0;!['planning','ended'].includes(state.phase);n++){
    if(n>2000)throw new Error('STEP_LIMIT');
    const r=resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(state)));
    state=r.state;events.push(...r.events);fingerprints.push(digest.stateFingerprint(state));permitted.push(state.players.map((p:{id:string})=>views.projectEvents(state,p.id,r.events)));
   }
   return {snapshot:persistence.encodeSnapshot(state),events,fingerprints,permitted,views:state.players.map((p:{id:string})=>views.projectView(state,p.id))};
  },{root:'/@fs'+process.cwd(),initial});
  expect(actual).toEqual({snapshot:encodeSnapshot(s),events,fingerprints,permitted,views:s.players.map(p=>projectView(s,p.id))});
 });
}
