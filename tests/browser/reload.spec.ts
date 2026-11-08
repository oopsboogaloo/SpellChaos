import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {restoreSnapshot,encodeSnapshot} from '../../packages/persistence/src/snapshot.js';
import {startScenarioTurn} from '../../packages/scenario/src/casting.js';
import {advanceAtomicStep} from '../../packages/engine/src/resolver.js';
import {projectView} from '../../packages/views/src/index.js';
for(const name of ['firing','reload-planning','refire-planning','guard','structure-impact','ballista-second-hit','elven-basic','elven-physical-arrow','treant','shade','cougar-movement','cougar-bite','walking-tree-before','walking-tree-after'])test(`Node and Chromium agree on siege ${name} continuation`,async({page})=>{
 const initial=name.startsWith('walking-tree-')?encodeSnapshot(restoreSnapshot(readFileSync(`tests/fixtures/walking-tree-${name.slice(13)}.json`,'utf8'))):name.startsWith('cougar-')?encodeSnapshot(restoreSnapshot(readFileSync(`tests/fixtures/cougar-${name.slice(7)}.json`,'utf8'))):name==='shade'?encodeSnapshot(restoreSnapshot(readFileSync('tests/fixtures/shade-transit.json','utf8'))):name==='treant'?encodeSnapshot(restoreSnapshot(readFileSync('tests/fixtures/treant-attack.json','utf8'))):name.startsWith('elven-')?encodeSnapshot(restoreSnapshot(readFileSync(`tests/fixtures/elven-${name.slice(6)}.json`,'utf8'))):name==='ballista-second-hit'?encodeSnapshot(restoreSnapshot(readFileSync('tests/fixtures/ballista-second-hit.json','utf8'))):name==='structure-impact'?encodeSnapshot(restoreSnapshot(readFileSync('tests/fixtures/siege-impact.json','utf8'))):encodeSnapshot(restoreSnapshot(readFileSync(`tests/fixtures/reload-${name}.json`,'utf8')));let s=restoreSnapshot(initial);if(s.phase==='planning')s=startScenarioTurn(s);const events=[];
 for(let n=0;!['planning','ended'].includes(s.phase);n++){if(n>1000)throw new Error('STEP_LIMIT');const r=advanceAtomicStep(s);s=r.state;events.push(...r.events);}
 await page.goto('/');const actual=await page.evaluate(async({root,initial})=>{
  const persistence=await import(root+'/packages/persistence/src/snapshot.ts');const scenario=await import(root+'/packages/scenario/src/casting.ts');const resolver=await import(root+'/packages/engine/src/resolver.ts');const views=await import(root+'/packages/views/src/index.ts');
  let s=persistence.restoreSnapshot(initial);if(s.phase==='planning')s=scenario.startScenarioTurn(s);const events=[];
  for(let n=0;!['planning','ended'].includes(s.phase);n++){if(n>1000)throw new Error('STEP_LIMIT');const r=resolver.advanceAtomicStep(persistence.restoreSnapshot(persistence.encodeSnapshot(s)));s=r.state;events.push(...r.events);}
  return {snapshot:persistence.encodeSnapshot(s),events,view:views.projectView(s,'b')};
 },{root:'/@fs'+process.cwd(),initial});expect(actual).toEqual({snapshot:encodeSnapshot(s),events,view:projectView(s,'b')});
});
