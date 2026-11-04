import { stateSchema as environmentSchema } from '../../domain/src/legacy-v5.js';
import { stateSchema as castingSchema } from '../../domain/src/legacy-v4.js';
import { stateSchema as combatSchema } from '../../domain/src/legacy-v3.js';
import { startingBook } from '../../engine/src/spellbooks.js';
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
  return fillBooks(stateSchema.parse(next));
}

/** Explicit v2 -> current upgrade. Frozen v2 fixtures remain readable only through this API. */
export function migrateOrdersSnapshot(text: string): GameState {
  const old = ordersSchema.parse(JSON.parse(text));
  const next = {
    ...old, schemaVersion: VERSION.schema, rulesVersion: VERSION.rules, contentVersion: VERSION.content,
    creatures: old.creatures.map(c => createCreature(c.id,c.controller,c.centre,{...c,...(!c.alive?{hp:-5*c.size}:{})})),
    walls: old.walls.map(w => {const hp=5+3*(['wood','stone','iron','crystal','thorns','fire','energy','death'].indexOf(w.material)+1);return {...w,hp,maxHp:hp,burning:null};}),
    cursor: {...old.cursor,lastRestingCentre:null},
    balanceUnits:0,casts:[],castOccupied:[],quickQueue:null,nextEntityId:0,
    guards:[],holds:[],reactions:[],pendingAttack:null,spentActions:[],moved:[],corpses:[],deadHandled:[],endStep:0,
  };
  return fillBooks(stateSchema.parse(next));
}

function fillBooks(s:GameState):GameState {
 for(const c of s.creatures.filter(c=>c.kind==='wizard')){const draw=startingBook(s.random.setup);s.random.setup=draw.state;c.spellbook=draw.book;}
 return stateSchema.parse(s);
}
/** Explicit upgrade; legacy combat snapshots and their validators are immutable. */
export function migrateCombatSnapshot(text:string):GameState {
 const old=combatSchema.parse(JSON.parse(text));
 return fillBooks(stateSchema.parse({...old,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,
  balanceUnits:0,casts:[],castOccupied:[],quickQueue:null,nextEntityId:0,
  creatures:old.creatures.map(c=>createCreature(c.id,c.controller,c.centre,c)),
 }));
}

/** Explicit v4 -> current upgrade; no RNG draws, no silent interpretation under new rules. */
export function migrateCastingSnapshot(text:string):GameState {
 const old=castingSchema.parse(JSON.parse(text));
 return stateSchema.parse({...old,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,
  creatures:old.creatures.map(c=>createCreature(c.id,c.controller,c.centre,{...c,
   reanimationAttackIds:c.family==='Dragon'&&c.summonLevel===1?[]:null,
   restorationUsed:c.kind==='reanimated'||old.corpses.some(body=>body.creatureId===c.id&&body.restorationUsed),
  })),
  corpses:old.corpses.map(c=>({...c,restorationUsed:c.restorationUsed||old.creatures.some(body=>body.id===c.creatureId&&body.kind==='reanimated')})),
 });
}

/** The v5 engine never resized swarms; their stored Size becomes originalSize. */
export function migrateEnvironmentSnapshot(text:string):GameState {
 const old=environmentSchema.parse(JSON.parse(text));
 return stateSchema.parse({...old,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,
  creatures:old.creatures.map(c=>createCreature(c.id,c.controller,c.centre,c)),
 });
}
