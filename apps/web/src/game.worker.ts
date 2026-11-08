import {saveLocal,loadLocal} from './autosave.js';
import {createMatch,applyCommand,applySystemCommand,systemCommand} from '../../../packages/engine/src/index.js';
import {advanceAtomicStep} from '../../../packages/engine/src/resolver.js';
import {projectView} from '../../../packages/views/src/index.js';
import {submitAiTurn} from '../../../packages/ai/src/coordinator.js';
import {knowledgeState} from '../../../packages/ai/src/knowledge.js';
import {validateOrder} from '../../../packages/engine/src/orders.js';
import {encodeSnapshot,restoreSnapshot} from '../../../packages/persistence/src/snapshot.js';
import type {Order} from '../../../packages/domain/src/state.js';
let state=createMatch('local',['human','ai-1'],123);
let saveStatus='Local saves stay in this browser.';
const send=(extra:object={})=>postMessage({view:projectView(state,'human'),saveStatus,...extra});
function command(type:'LockTurn'|'SetOrder',order?:Order){const base={matchId:state.matchId,playerId:'human',turn:state.turn,commandId:`ui-${state.revision}`,expectedRevision:state.revision};return type==='SetOrder'?applyCommand(state,{...base,type,order:order!}).state:applyCommand(state,{...base,type}).state;}
async function handle(data:any){try{
 const before=state;
 if(data.type==='continue'){const saved=await loadLocal();if(!saved)throw new Error('NO_LOCAL_SAVE');state=saved.state;saveStatus=saved.recovered?'Recovered the previous local checkpoint.':'Continued local match.';send();return;}
 if(data.type==='new')state=createMatch('local',['human',...Array.from({length:Math.max(1,Math.min(7,Number(data.opponents)||1))},(_,i)=>`ai-${i+1}`)],Number(data.seed)||123);
 if(data.type==='order'){
  // Validate only observed facts before the authoritative submission. Never return private rejection details.
  const previous=state.orders.find(o=>o.creatureId===data.order.creatureId);
  const order=data.phase==='early'||data.phase==='late'?{...previous,...data.order,early:data.phase==='early'?data.order.early:previous?.early??null,late:data.phase==='late'?data.order.late:previous?.late??null}:data.order;
  validateOrder(knowledgeState(projectView(state,'human')),order,'human');
  state=command('SetOrder',order);
 }
 if(data.type==='clear')state=applyCommand(state,{matchId:state.matchId,playerId:'human',turn:state.turn,commandId:`ui-${state.revision}`,expectedRevision:state.revision,type:'ClearOrder',creatureId:data.creatureId}).state;
 if(data.type==='suggest')state=submitAiTurn(state,['human']).state;
 if(data.type==='lock'){
  let next=state;
  try{if(!state.players[0]!.locked)state=command('LockTurn');state=submitAiTurn(state,state.players.filter(p=>p.id!=='human').map(p=>p.id)).state;state=applySystemCommand(state,systemCommand(state,'StartResolution',`start-${state.turn}`)).state;}catch(e){state=next;throw e;}
 }
 if(data.type==='step'&&!['planning','ended'].includes(state.phase))state=advanceAtomicStep(state).state;
 if(data.type==='load'){const candidate=restoreSnapshot(data.text);projectView(candidate,'human');state=candidate;}
 if(data.type==='save'){send({save:encodeSnapshot(state)});return;}
 if(state!==before){try{await saveLocal(state);saveStatus='Saved locally.';}catch{saveStatus='Local save failed. Export a private save to keep this match.';}}
 send();
}catch{send({error:'That request could not be completed. Check your order or save file.'});}}
let queue=Promise.resolve();
onmessage=({data})=>{queue=queue.then(()=>handle(data));};
