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
    creatures: state.creatures.filter(c => c.alive).map(c => ({ id: c.id, centre: { ...c.centre }, size: c.size, controller: c.controller, height: c.height, species:c.species, family:c.family, stats:{con:c.con,dex:c.dex,intelligence:c.intelligence,move:c.move,maxHp:c.maxHp}, attacks:structuredClone(c.attacks), defences:structuredClone(c.defences), ...(knowsIllusion(c,playerId)?{illusion:true}:{}), health: health(c), restrained: restrained(state,c), ...(c.controller === playerId ? {hp:c.hp,maxHp:c.maxHp,mana:c.mana,maxMana:c.maxMana,spellbook:[...c.spellbook]} : {}) })),
    corpses: state.corpses.map(c=>({id:c.id,centre:{...c.centre},size:c.size,skeletal:c.skeletal,restorationUsed:c.restorationUsed})),
    casts: structuredClone(state.casts.filter(c=>c.controller===playerId)),
    orders: structuredClone(state.orders.filter(o => state.creatures.find(c => c.id === o.creatureId)?.controller === playerId)),
    reservations: structuredClone(state.reservations.filter(r => state.creatures.find(c => c.id === r.creatureId)?.controller === playerId)),
    result: structuredClone(state.result),
  };
}

/** Hide exact enemy damage and authoritative sequence gaps from private detection. */
export function projectEvents(state:GameState,playerId:string,events:readonly Event[]):Omit<Event,'sequence'>[] {
 if(!state.players.some(p=>p.id===playerId))throw new Error('UNKNOWN_PLAYER');
 const owned=(id:string|undefined)=>state.creatures.some(c=>c.id===id && c.controller===playerId);
 return events.filter(event=>event.type!=='IllusionDetected'||event.playerId===playerId).map(event=>{
  const {sequence:_authoritativeSequence,...copy}=structuredClone(event);
  if(!owned(event.creatureId))delete copy.amount;
  if(copy.damageByTarget)copy.damageByTarget=copy.damageByTarget.filter(d=>owned(d.targetId));
  return copy;
 });
}
