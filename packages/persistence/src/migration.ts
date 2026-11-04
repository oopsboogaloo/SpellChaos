import { stateSchema as legacySchema } from '../../domain/src/legacy-v1.js';
import { stateSchema, type GameState } from '../../domain/src/state.js';
import { createMatch } from '../../engine/src/index.js';
import { startingPositions } from '../../geometry/src/spawn.js';

/** Explicit upgrade: foundation saves contained no map or creatures. Never invoked silently by restore. */
export function migrateFoundationSnapshot(text: string): GameState {
  const old = legacySchema.parse(JSON.parse(text));
  const next = createMatch(old.matchId, old.players.map(p => p.id), 1);
  const starts = startingPositions(old.players.length, old.random.setup);
  next.creatures.forEach((c, i) => { c.centre = starts.positions[i]!; });
  next.random = { ...old.random, setup: starts.randomState };
  next.turn = old.turn; next.phase = old.phase; next.revision = old.revision; next.eventSequence = old.revision;
  next.players.forEach((p,i) => { p.locked = old.players[i]!.locked; p.participated = p.locked; });
  next.accepted = old.accepted;
  return stateSchema.parse(next);
}
