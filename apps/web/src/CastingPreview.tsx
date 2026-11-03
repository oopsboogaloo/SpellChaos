import { useState } from 'react';
import { castingScenario,startScenarioTurn } from '../../../packages/scenario/src/casting.js';
import { advanceAtomicStep } from '../../../packages/engine/src/resolver.js';
import { encodeSnapshot,restoreSnapshot } from '../../../packages/persistence/src/snapshot.js';
import { projectView } from '../../../packages/views/src/index.js';
export function CastingPreview(){
 const [state,setState]=useState(castingScenario),[saved,setSaved]=useState<string|null>(null),[events,setEvents]=useState<string[]>([]);
 const view=projectView(state,'human'),wizard=view.creatures.find(c=>c.id==='wizard-0')!;
 const resolving=['early','movement','late','end'].includes(state.phase);
 return <section aria-label="Casting preview">
  <h2>Cast through a familiar</h2>
  <p>A prepared Bind starts late in turn 1 through the distant cat familiar and completes early in turn 2.</p>
  <p data-testid="casting-status">Turn {view.turn} · {view.phase} · mana {wizard.mana} · balance {view.balance}</p>
  <p data-testid="casting-origin">{view.casts.length?`Casting ${view.casts[0]!.action.spell} through ${view.casts[0]!.originId}`:'No active cast'}</p>
  <button disabled={state.phase!=='planning'||state.turn>2} onClick={()=>setState(startScenarioTurn(state))}>Commit casting turn</button>
  <button disabled={!resolving} onClick={()=>{const next=advanceAtomicStep(state);setState(next.state);setEvents(old=>[...old,...next.events.map(e=>`${e.turn} ${e.phase}: ${e.type}`)]);}}>Step casting</button>
  <button onClick={()=>setSaved(encodeSnapshot(state))}>Save casting checkpoint</button>
  <button disabled={!saved} onClick={()=>{setState(restoreSnapshot(saved!));setEvents([]);}}>Restore casting checkpoint</button>
  <button onClick={()=>{setState(castingScenario());setSaved(null);setEvents([]);}}>Reset casting</button>
  <details><summary>Casting events ({events.length})</summary><ol>{events.map((e,i)=><li key={i}>{e}</li>)}</ol></details>
 </section>;
}
