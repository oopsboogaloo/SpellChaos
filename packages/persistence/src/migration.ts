import { stateSchema as legacySchema } from '../../domain/src/legacy-v1.js';
import { stateSchema, VERSION, type GameState } from '../../domain/src/state.js';
import { stateSchema as ordersSchema } from '../../domain/src/legacy-v2.js';
import { createMatch, createCreature } from '../../engine/src/index.js';
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

/** Explicit v2 -> v3 upgrade. Frozen v2 fixtures remain readable only through this API. */
export function migrateOrdersSnapshot(text: string): GameState {
  const old = ordersSchema.parse(JSON.parse(text));
  const next = {
    ...old, schemaVersion: VERSION.schema, rulesVersion: VERSION.rules, contentVersion: VERSION.content,
    creatures: old.creatures.map(c => createCreature(c.id,c.controller,c.centre,{...c,...(!c.alive?{hp:-5*c.size}:{})})),
    walls: old.walls.map(w => {const hp=5+3*(['wood','stone','iron','crystal','thorns','fire','energy','death'].indexOf(w.material)+1);return {...w,hp,maxHp:hp,burning:null};}),
    cursor: {...old.cursor,lastRestingCentre:null},
    guards:[],holds:[],reactions:[],pendingAttack:null,spentActions:[],moved:[],corpses:[],deadHandled:[],endStep:0,
  };
  return stateSchema.parse(next);
}
