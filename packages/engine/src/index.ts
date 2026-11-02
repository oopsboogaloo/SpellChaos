import { commandSchema, stateSchema, VERSION, type GameState } from '../../domain/src/state.js';
import { canonical } from '../../persistence/src/snapshot.js';
import { nextRandom } from './random.js';

export function createMatch(matchId: string, playerIds: string[], seed: number): GameState {
  const setup = nextRandom(seed).state;
  const resolution = nextRandom(setup).state;
  const ai = nextRandom(resolution).state;
  return stateSchema.parse({
    schemaVersion: VERSION.schema, rulesVersion: VERSION.rules,
    contentVersion: VERSION.content, rngVersion: VERSION.rng,
    matchId, revision: 0, turn: 1, phase: 'planning', random: { setup, resolution, ai },
    players: playerIds.map(id => ({ id, locked: false })), accepted: [],
  });
}
export type Event = { type: 'PlayerLocked'; playerId: string; sequence: number };
export function applyCommand(state: GameState, input: unknown): { state: GameState; events: Event[]; acknowledgedRevision: number } {
  const command = commandSchema.parse(input);
  if (command.matchId !== state.matchId) throw new Error('WRONG_MATCH');
  const prior = state.accepted.find(a => a.command.commandId === command.commandId);
  if (prior) {
    if (canonical(prior.command) !== canonical(command)) throw new Error('COMMAND_ID_CONFLICT');
    return { state, events: [], acknowledgedRevision: prior.revision };
  }
  if (command.turn !== state.turn) throw new Error('STALE_TURN');
  if (command.expectedRevision !== state.revision) throw new Error('STALE_REVISION');
  const player = state.players.find(p => p.id === command.playerId);
  if (!player) throw new Error('UNKNOWN_PLAYER');
  if (state.phase !== 'planning' || player.locked) throw new Error('ORDERS_LOCKED');
  const next = structuredClone(state);
  next.players.find(p => p.id === command.playerId)!.locked = true;
  next.revision++;
  next.accepted.push({ command, revision: next.revision });
  if (next.players.every(p => p.locked)) next.phase = 'ready';
  return {
    state: next, events: [{ type: 'PlayerLocked', playerId: player.id, sequence: next.revision }],
    acknowledgedRevision: next.revision,
  };
}
