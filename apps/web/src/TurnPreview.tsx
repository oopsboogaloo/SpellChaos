import { useState } from 'react';
import { createMatch, applyCommand, applySystemCommand, systemCommand } from '../../../packages/engine/src/index.js';
import { advanceAtomicStep } from '../../../packages/engine/src/resolver.js';
import { encodeSnapshot, restoreSnapshot } from '../../../packages/persistence/src/snapshot.js';
import type { GameState } from '../../../packages/domain/src/state.js';
function scenario(): GameState {
  const s=createMatch('turn-preview',['human','opponent'],3003);
  s.creatures[0]!.centre={q:5,r:5};s.creatures[1]!.centre={q:15,r:15};return s;
}
export function TurnPreview() {
  const [state,setState]=useState(scenario),[saved,setSaved]=useState<string|null>(null),[log,setLog]=useState<string[]>([]);
  const resolving=['early','movement','late'].includes(state.phase);
  function plan() {
    setState(applyCommand(state,{matchId:state.matchId,playerId:'human',turn:state.turn,commandId:`edit-${state.revision}`,expectedRevision:state.revision,type:'SetOrder',
      order:{creatureId:'wizard-0',path:[1,2,3,4].map(i=>({q:state.creatures[0]!.centre.q+i,r:state.creatures[0]!.centre.r})),early:'Dash',late:null}}).state);
  }
  function commit() {
    let next=state;
    for(const p of next.players.filter(p=>!p.locked)) next=applyCommand(next,{matchId:next.matchId,playerId:p.id,turn:next.turn,commandId:`lock-${next.revision}`,expectedRevision:next.revision,type:'LockTurn'}).state;
    setState(applySystemCommand(next,systemCommand(next,'StartResolution',`start-${next.turn}`)).state);
    setLog([]);
  }
  function step() {
    const result=advanceAtomicStep(state);setState(result.state);
    setLog(previous=>[...previous,...result.events.map(e=>`${e.turn} ${e.phase}: ${e.type}${e.creatureId ? ` (${e.creatureId})` : ''}`)]);
  }
  return <section aria-label="Turn resolution preview">
    <h2>Plan and step a turn</h2>
    <p>This scripted scenario demonstrates a four-step Dash. The opponent stays in Total Defence.</p>
    <p data-testid="turn-preview-status">Turn {state.turn} · {state.phase} · position {state.creatures[0]!.centre.q},{state.creatures[0]!.centre.r}</p>
    <p>{state.orders.find(o=>o.creatureId==='wizard-0')?.early==='Dash' ? 'Dash planned' : 'No Dash planned'}</p>
    <button disabled={state.phase!=='planning' || state.creatures[0]!.centre.q>20} onClick={plan}>Plan Dash</button>
    <button disabled={state.phase!=='planning'} onClick={commit}>Commit scenario</button>
    <button disabled={!resolving} onClick={step}>Next engine step</button>
    <button onClick={()=>setSaved(encodeSnapshot(state))}>Save checkpoint</button>
    <button disabled={!saved} onClick={()=>{setState(restoreSnapshot(saved!));setLog([]);}}>Restore checkpoint</button>
    <button onClick={()=>{setState(scenario());setLog([]);setSaved(null);}}>Reset scenario</button>
    <details><summary>Resolution events ({log.length})</summary><ol>{log.map((line,i)=><li key={i}>{line}</li>)}</ol></details>
  </section>;
}
