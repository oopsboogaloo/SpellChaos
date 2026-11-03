import type { GameState } from '../../domain/src/state.js';
export function projectView(state: GameState, playerId: string) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('UNKNOWN_PLAYER');
  return {
    matchId: state.matchId, turn: state.turn, phase: state.phase,
    self: { id: player.id, locked: player.locked },
    players: state.players.map(p => ({ id: p.id, locked: p.locked, eliminated: p.eliminated })),
    creatures: state.creatures.filter(c => c.alive).map(c => ({ id: c.id, centre: { ...c.centre }, size: c.size, controller: c.controller, height: c.height })),
    orders: structuredClone(state.orders.filter(o => state.creatures.find(c => c.id === o.creatureId)?.controller === playerId)),
    reservations: structuredClone(state.reservations.filter(r => state.creatures.find(c => c.id === r.creatureId)?.controller === playerId)),
    result: structuredClone(state.result),
  };
}
