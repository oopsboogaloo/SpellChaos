import { createMatch,createCreature,applyCommand,applySystemCommand,systemCommand } from '../../engine/src/index.js';
import { summonProfile } from '../../content/src/summons.js';
import type { GameState } from '../../domain/src/state.js';
/** Remote familiar origin, movement before a late Slow cast, then next-turn completion. */
export function castingScenario():GameState {
 let s=createMatch('casting-review',['human','opponent'],5005);
 s.creatures[0]!.centre={q:5,r:5};s.creatures[1]!.centre={q:20,r:15};
 s.creatures.push(createCreature('origin-cat','human',{q:18,r:10},summonProfile('Summon Cat',1)!),createCreature('unbound-snake',null,{q:21,r:10},{...summonProfile('Summon Serpent',1)!,bindingLevel:null}));
 s=applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:'human',turn:1,commandId:'bind-order',expectedRevision:s.revision,
  order:{creatureId:'wizard-0',path:[{q:6,r:5}],early:null,late:{type:'Cast',spell:'Bind',level:4,variant:'bound',targetId:'unbound-snake',ground:null,side:'left'}}}).state;
 return s;
}
export function startScenarioTurn(state:GameState):GameState {
 let s=state;
 for(const p of s.players.filter(p=>!p.locked))s=applyCommand(s,{type:'LockTurn',matchId:s.matchId,playerId:p.id,turn:s.turn,commandId:`lock-${s.turn}-${p.id}`,expectedRevision:s.revision}).state;
 return applySystemCommand(s,systemCommand(s,'StartResolution',`start-${s.turn}`)).state;
}
