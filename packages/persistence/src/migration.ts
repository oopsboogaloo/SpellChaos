import { stateSchema as traitsV3Schema } from '../../domain/src/legacy-v11.js';
import { stateSchema as traitsV2Schema } from '../../domain/src/legacy-content-traits-v2.js';
import { stateSchema as traitsV1Schema } from '../../domain/src/legacy-content-traits-v1.js';
import { stateSchema as wallSchema } from '../../domain/src/legacy-v10.js';
import { stateSchema as weedSchema } from '../../domain/src/legacy-v9.js';
import { stateSchema as darknessSchema } from '../../domain/src/legacy-v8.js';
import { stateSchema as illusionSchema } from '../../domain/src/legacy-v7.js';
import { stateSchema as swarmSchema } from '../../domain/src/legacy-v6.js';
import type { Creature } from '../../domain/src/state.js';
import type { Condition } from '../../domain/src/combat.js';
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
  return fillBooks(parseUpgrade(next));
}

/** Explicit v2 -> current upgrade. Frozen v2 fixtures remain readable only through this API. */
export function migrateOrdersSnapshot(text: string): GameState {
  const old = ordersSchema.parse(JSON.parse(text));
  const next = {
    ...old, schemaVersion: VERSION.schema, rulesVersion: VERSION.rules, contentVersion: VERSION.content,
    creatures: old.creatures.map(c => createCreature(c.id,c.controller,c.centre,{...c,...(!c.alive?{hp:-5*c.size}:{})})),
    walls: old.walls.map(w => {const hp=5+3*(['wood','stone','iron','crystal','thorns','fire','energy','death'].indexOf(w.material)+1);return {...w,hp,maxHp:hp,burning:null};}),
    cursor: {...old.cursor,lastRestingCentre:null},
    destroyedWallIds:[],wallCrossings:[],tangleweed:[],weedAttempts:[],weedHolds:[],movementSpent:legacyMovement(old),darkness:[],damageLedger:[],balanceUnits:0,casts:[],castOccupied:[],quickQueue:null,nextEntityId:0,
    guards:[],holds:[],reactions:[],pendingAttack:null,spentActions:[],moved:[],corpses:[],deadHandled:[],endStep:0,
  };
  return fillBooks(parseUpgrade(next));
}

function fillBooks(s:GameState):GameState {
 for(const c of s.creatures.filter(c=>c.kind==='wizard')){const draw=startingBook(s.random.setup);s.random.setup=draw.state;c.spellbook=draw.book;}
 return parseUpgrade(s);
}
/** Explicit upgrade; legacy combat snapshots and their validators are immutable. */
export function migrateCombatSnapshot(text:string):GameState {
 const old=combatSchema.parse(JSON.parse(text));
 return fillBooks(parseUpgrade({...old,destroyedWallIds:[],wallCrossings:[],tangleweed:[],weedAttempts:[],weedHolds:[],movementSpent:legacyMovement(old),darkness:[],damageLedger:[],pendingAttack:old.pendingAttack?{...old.pendingAttack,actionId:'legacy-attack'}:null,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,
  balanceUnits:0,casts:[],castOccupied:[],quickQueue:null,nextEntityId:0,
  creatures:old.creatures.map(upgradeCreature),
 }));
}

/** Explicit v4 -> current upgrade; no RNG draws, no silent interpretation under new rules. */
export function migrateCastingSnapshot(text:string):GameState {
 const old=castingSchema.parse(JSON.parse(text));
 return parseUpgrade({...old,destroyedWallIds:[],wallCrossings:[],tangleweed:[],weedAttempts:[],weedHolds:[],movementSpent:legacyMovement(old),darkness:[],damageLedger:[],pendingAttack:old.pendingAttack?{...old.pendingAttack,actionId:'legacy-attack'}:null,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,
  creatures:old.creatures.map(c=>upgradeCreature({...c,
   reanimationAttackIds:c.family==='Dragon'&&c.summonLevel===1?[]:null,
   restorationUsed:c.kind==='reanimated'||old.corpses.some(body=>body.creatureId===c.id&&body.restorationUsed),
  })),
  corpses:old.corpses.map(c=>({...c,restorationUsed:c.restorationUsed||old.creatures.some(body=>body.id===c.creatureId&&body.kind==='reanimated')})),
 });
}

/** The v5 engine never resized swarms; their stored Size becomes originalSize. */
export function migrateEnvironmentSnapshot(text:string):GameState {
 const old=environmentSchema.parse(JSON.parse(text));
 return parseUpgrade({...old,destroyedWallIds:[],wallCrossings:[],tangleweed:[],weedAttempts:[],weedHolds:[],movementSpent:legacyMovement(old),darkness:[],damageLedger:[],pendingAttack:old.pendingAttack?{...old.pendingAttack,actionId:'legacy-attack'}:null,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,
  creatures:old.creatures.map(upgradeCreature),
 });
}

function upgradeCreature(c:Pick<Creature,'id'|'controller'|'centre'> & Partial<Omit<Creature,'conditions'>> & {conditions:Omit<Condition,'illusionId'>[]}):Creature {
 return createCreature(c.id,c.controller,c.centre,{...c,conditions:c.conditions.map(e=>({...e,illusionId:null}))});
}
/** V6 did not create illusions; historical wounds are an untracked real baseline. */
export function migrateSwarmSnapshot(text:string):GameState {
 const old=swarmSchema.parse(JSON.parse(text));
 return parseUpgrade({...old,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,
  destroyedWallIds:[],wallCrossings:[],tangleweed:[],weedAttempts:[],weedHolds:[],movementSpent:legacyMovement(old),darkness:[],damageLedger:[],pendingAttack:old.pendingAttack?{...old.pendingAttack,actionId:'legacy-attack'}:null,
  creatures:old.creatures.map(upgradeCreature),
 });
}

/** Explicit v7 upgrade: no Darkness existed in these saves; RNG and pending work survive. */
export function migrateIllusionSnapshot(text:string):GameState {
 const old=illusionSchema.parse(JSON.parse(text));
 return parseUpgrade({...old,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,destroyedWallIds:[],wallCrossings:[],tangleweed:[],weedAttempts:[],weedHolds:[],movementSpent:legacyMovement(old),darkness:[],
 creatures:old.creatures.map(c=>({...c,darknessSightRange:0,ignoresDarknessDisadvantage:false}))});
}

function legacyMovement(old:{phase:string;cursor:{index:number;pathIndex:number;entries:{creatureId:string}[]}}){
 const actor=old.cursor.entries[old.cursor.index];
 return old.phase==='movement'&&actor&&old.cursor.pathIndex>0?[{creatureId:actor.creatureId,amount:old.cursor.pathIndex}]:[];
}
/** V8 had unit-cost movement; preserve the active actor's already paid steps. */
export function migrateDarknessSnapshot(text:string):GameState {
 const old=darknessSchema.parse(JSON.parse(text));
 return parseUpgrade({...old,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,
 destroyedWallIds:[],wallCrossings:[],tangleweed:[],weedAttempts:[],weedHolds:[],movementSpent:legacyMovement(old)});
}

/** Explicit v9 upgrade: historical walls had no caster/network ownership or crossing history. */
export function migrateTangleweedSnapshot(text:string):GameState {
 const old=weedSchema.parse(JSON.parse(text));
 return parseUpgrade({...old,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content,destroyedWallIds:[],wallCrossings:[]});
}

function parseUpgrade(value: unknown): GameState {
 const old=value as GameState;
 return stateSchema.parse({...old,actedThisPhase:old.actedThisPhase??[],creatures:old.creatures.map(c=>({...c,bristles:c.bristles??0,lifeDrain:c.lifeDrain??0,attackTraits:c.attackTraits??{aim:false,brace:false,ambush:false,closeDisadvantageBelow:0,receivesRally:false,rallySource:false}}))});
}
/** Legacy content had no attack traits; do not infer new abilities from species. */
export function migrateWallSnapshot(text:string):GameState {
 const old=wallSchema.parse(JSON.parse(text));
 return parseUpgrade({...old,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content});
}

/** Upgrade supported schema-11 content snapshots to the current schema and content. */
export function migrateAttackTraitContent(text:string):GameState {
 const input=JSON.parse(text);
 const old=(input.contentVersion==='attack-traits-0.3'?traitsV3Schema:input.contentVersion==='attack-traits-0.2'?traitsV2Schema:traitsV1Schema).parse(input);
 return parseUpgrade({...old,schemaVersion:VERSION.schema,rulesVersion:VERSION.rules,contentVersion:VERSION.content});
}
