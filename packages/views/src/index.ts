import { visibleTo } from '../../engine/src/visibility.js';
import { knowsIllusion } from '../../engine/src/illusions.js';
import { health, restrained } from '../../engine/src/status.js';
import type { Event } from '../../engine/src/events.js';
import type { GameState } from '../../domain/src/state.js';
export function projectView(state: GameState, playerId: string) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('UNKNOWN_PLAYER');
  return {
    matchId: state.matchId, turn: state.turn, phase: state.phase, balance: state.balanceUnits/2,
    self: { id: player.id, locked: player.locked },
    players: state.players.map(p => ({ id: p.id, locked: p.locked, eliminated: p.eliminated })),
    walls:structuredClone(state.walls.map(({casterId:_caster,...w})=>w)),
    tangleweed:structuredClone(state.tangleweed.map(({casterId:_caster,...w})=>w)),
    darkness: structuredClone(state.darkness.map(({casterId:_caster,...d})=>d)),
    creatures: state.creatures.filter(c => c.alive&&visibleTo(state,c,playerId)).map(c => ({ id: c.id, centre: { ...c.centre }, size: c.size, controller: c.controller, height: c.height, species:c.species, family:c.family, stats:{con:c.con,dex:c.dex,intelligence:c.intelligence,move:c.move,maxHp:c.maxHp}, attacks:structuredClone(c.attacks), ...(c.flight?{flight:structuredClone(c.flight)}:{}), ...(c.haunt?{haunt:structuredClone(c.haunt)}:{}), ...(c.seeInvisibleRange?{seeInvisibleRange:c.seeInvisibleRange}:{}), ...(c.drag?{drag:structuredClone(c.drag)}:{}), ...(c.constriction?{constriction:structuredClone(c.constriction)}:{}), ...(c.rootNetwork?{rootNetwork:structuredClone(c.rootNetwork)}:{}), ...(c.rangedCover?{rangedCover:structuredClone(c.rangedCover)}:{}), ...(c.blink?{blink:structuredClone(c.blink)}:{}), ...(c.spores?{spores:structuredClone(c.spores)}:{}), ...(c.wail?{wail:structuredClone(c.wail)}:{}), ...(c.fearAction?{fearAction:structuredClone(c.fearAction)}:{}), ...(c.gaze?{gaze:structuredClone(c.gaze)}:{}), ...(c.shove?{shove:structuredClone(c.shove)}:{}), ...(c.pounce?{pounce:structuredClone(c.pounce)}:{}), defences:structuredClone(c.defences), ...(knowsIllusion(c,playerId)?{illusion:true}:{}), health: health(c), restrained: restrained(state,c), ...(c.controller === playerId ? {...(c.blinkUsedTurn===undefined?{}:{blinkUsedTurn:c.blinkUsedTurn}),...(c.wailReadyTurn===undefined?{}:{wailReadyTurn:c.wailReadyTurn}),hp:c.hp,maxHp:c.maxHp,mana:c.mana,maxMana:c.maxMana,spellbook:[...c.spellbook],reload:structuredClone(c.reload),canMarkQuarry:c.canMarkQuarry,quarryTargetId:c.quarryTargetId} : {}) })),
    corpses: state.corpses.filter(body=>visibleTo(state,{...state.creatures.find(c=>c.id===body.creatureId)!,centre:body.centre,size:body.size},playerId)).map(c=>({id:c.id,centre:{...c.centre},size:c.size,skeletal:c.skeletal,restorationUsed:c.restorationUsed})),
    casts: structuredClone(state.casts.filter(c=>c.controller===playerId)),
    orders: structuredClone(state.orders.filter(o => state.creatures.find(c => c.id === o.creatureId)?.controller === playerId)),
    reservations: structuredClone(state.reservations.filter(r => state.creatures.find(c => c.id === r.creatureId)?.controller === playerId)),
    result: structuredClone(state.result),
  };
}

/** Hide exact enemy damage and authoritative sequence gaps from private detection. */
export function projectEvents(state:GameState,playerId:string,events:readonly Event[]):Omit<Event,'sequence'|'audience'>[] {
 if(!state.players.some(p=>p.id===playerId))throw new Error('UNKNOWN_PLAYER');
 const owned=(id:string|undefined)=>state.creatures.some(c=>c.id===id && c.controller===playerId);
 return events.filter(event=>(!event.audience||event.audience.includes(playerId))).filter(event=>event.type!=='IllusionDetected'||event.playerId===playerId).map(event=>{
  const {sequence:_authoritativeSequence,audience:_audience,...copy}=structuredClone(event);
  if(!owned(event.creatureId))delete copy.amount;
  if(copy.damageByTarget)copy.damageByTarget=copy.damageByTarget.filter(d=>owned(d.targetId));
  return copy;
 });
}
