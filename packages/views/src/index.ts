import { health } from '../../engine/src/status.js';
import type { Event } from '../../engine/src/events.js';
import type { GameState } from '../../domain/src/state.js';
export function projectView(state: GameState, playerId: string) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('UNKNOWN_PLAYER');
  return {
    matchId: state.matchId, turn: state.turn, phase: state.phase,
    self: { id: player.id, locked: player.locked },
    players: state.players.map(p => ({ id: p.id, locked: p.locked, eliminated: p.eliminated })),
    creatures: state.creatures.filter(c => c.alive).map(c => ({ id: c.id, centre: { ...c.centre }, size: c.size, controller: c.controller, height: c.height, health: health(c), ...(c.controller === playerId ? {hp:c.hp,maxHp:c.maxHp} : {}) })),
    orders: structuredClone(state.orders.filter(o => state.creatures.find(c => c.id === o.creatureId)?.controller === playerId)),
    reservations: structuredClone(state.reservations.filter(r => state.creatures.find(c => c.id === r.creatureId)?.controller === playerId)),
    result: structuredClone(state.result),
  };
}

/** Exact enemy damage/HP is authoritative replay data, never part of a player's event feed. */
export function projectEvents(state:GameState,playerId:string,events:readonly Event[]):Event[] {
 if(!state.players.some(p=>p.id===playerId))throw new Error('UNKNOWN_PLAYER');
 const owned=(id:string|undefined)=>state.creatures.some(c=>c.id===id && c.controller===playerId);
 return events.map(event=>{
  const copy=structuredClone(event);
  if(!owned(event.creatureId))delete copy.amount;
  if(copy.damageByTarget)copy.damageByTarget=copy.damageByTarget.filter(d=>owned(d.targetId));
  return copy;
 });
}
