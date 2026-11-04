import type { GameState } from '../../domain/src/state.js';
export function projectView(state: GameState, playerId: string) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('UNKNOWN_PLAYER');
  return {
    matchId: state.matchId, turn: state.turn, phase: state.phase,
    self: { id: player.id, locked: player.locked },
    players: state.players.map(p => ({ id: p.id, locked: p.locked })),
  };
}
