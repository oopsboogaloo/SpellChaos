import { commandSchema, stateSchema, VERSION, type Creature, type GameState, type Command } from '../../domain/src/state.js';
import { canonical } from '../../persistence/src/snapshot.js';
import { staff } from '../../domain/src/combat.js';
import { cleanupDeaths } from './lifecycle.js';
import { active } from './status.js';
import { emit, type Event, type Transition } from './events.js';
export { emit, type Event, type Transition } from './events.js';
import { nextRandom } from './random.js';
import { startingPositions } from '../../geometry/src/spawn.js';
import { defaultOrder, validateOrder, replaceReservation } from './orders.js';

export function createCreature(id: string, controller: string | null, centre: Creature['centre'], overrides: Partial<Creature> = {}): Creature {
  return { id, controller, centre, kind: 'summon', size: 2, height: 'ground', intelligence: 7, dex: 5, move: 2, mana: 100,
    alive: true, incapacitated: false, restrained: false, slowed: false, subdued: false, doubleAction: false, readyTurn: 1,
    swarm: false, incorporeal: false, nimble: false,
    con: 5, hp: (overrides.con ?? 5) * (overrides.size ?? 2), maxHp: (overrides.con ?? 5) * (overrides.size ?? 2),
    attacks: [staff()], conditions: [], defences: [], undead: overrides.kind === 'reanimated', undeadClass: overrides.kind === 'reanimated' ? 'zombie' : 'none', construct: false, plant: false, flammable: false,
    packTactics: false, regeneration: 0, regenerationBlockedTurn: null, fireAcidDamage: 0, grappleLimbs: 0, grappleEqualSize: false, corpseEligible: true, ...overrides };
}
export function createMatch(matchId: string, playerIds: string[], seed: number): GameState {
  const setup = nextRandom(seed).state, resolution = nextRandom(setup).state, ai = nextRandom(resolution).state;
  const starts = startingPositions(playerIds.length, setup);
  return stateSchema.parse({
    schemaVersion: VERSION.schema, rulesVersion: VERSION.rules, contentVersion: VERSION.content, rngVersion: VERSION.rng,
    matchId, revision: 0, eventSequence: 0, turn: 1, phase: 'planning', random: { setup: starts.randomState, resolution, ai },
    board: { columns: 30, rows: 30 }, walls: [],
    players: playerIds.map((id, i) => ({ id, wizardId: `wizard-${i}`, locked: false, participated: false, missedTurns: 0, eliminated: false })),
    creatures: playerIds.map((id, i) => createCreature(`wizard-${i}`, id, starts.positions[i]!, { kind: 'wizard' })),
    orders: [], dashed: [], reservations: [], cursor: { entries: [], index: 0, pathIndex: 0, initialized: false, activePath: null, lastRestingCentre: null }, defending: [], guards: [], holds: [], reactions: [], pendingAttack: null, spentActions: [], moved: [], corpses: [], deadHandled: [], endStep: 0, result: null, accepted: [],
  });
}
export function surrender(state: GameState, playerId: string, events: Event[]): void {
  const player = state.players.find(p => p.id === playerId)!;
  const wizard = state.creatures.find(c => c.id === player.wizardId)!;
  wizard.hp = -wizard.maxHp; cleanupDeaths(state, events);
  emit(state, events, { type: 'PlayerSurrendered', playerId });
}
export function checkVictory(state: GameState, events: Event[]): boolean {
  const living = state.players.filter(p => !p.eliminated);
  if (living.length > 1) return false;
  state.phase = 'ended'; state.cursor = { entries: [], index: 0, pathIndex: 0, initialized: false, activePath: null, lastRestingCentre: null };
  state.pendingAttack = null; state.reactions = [];
  state.result = living.length ? { type: 'winner', playerId: living[0]!.id } : { type: 'draw' };
  emit(state, events, { type: 'MatchEnded' }); return true;
}
function apply(state: GameState, input: unknown, system: boolean): Transition {
  const command = commandSchema.parse(input);
  const systemType = command.type === 'DeadlineReached' || command.type === 'StartResolution';
  if (system !== systemType || system !== (command.playerId === '$system')) throw new Error('INVALID_COMMAND_AUTHORITY');
  if (command.matchId !== state.matchId) throw new Error('WRONG_MATCH');
  const prior = state.accepted.find(a => a.command.commandId === command.commandId);
  if (prior) {
    if (canonical(prior.command) !== canonical(command)) throw new Error('COMMAND_ID_CONFLICT');
    return { state, events: [], acknowledgedRevision: prior.revision };
  }
  if (command.turn !== state.turn) throw new Error('STALE_TURN');
  if (command.expectedRevision !== state.revision) throw new Error('STALE_REVISION');
  const player = state.players.find(p => p.id === command.playerId);
  if (!system && !player) throw new Error('UNKNOWN_PLAYER');
  if (!system && (state.phase !== 'planning' || player!.locked || player!.eliminated)) throw new Error('ORDERS_LOCKED');
  if (command.type === 'SetOrder') validateOrder(state, command.order, command.playerId);
  if ((command.type === 'ClearOrder' || command.type === 'ReleaseHold') && !state.creatures.some(c => c.id === command.creatureId && c.controller === command.playerId)) throw new Error('NOT_CONTROLLED');
  if (command.type === 'DeadlineReached' && state.phase !== 'planning') throw new Error('DEADLINE_NOT_APPLICABLE');
  if (command.type === 'StartResolution' && state.phase !== 'ready') throw new Error('NOT_READY');
  const next = structuredClone(state), events: Event[] = [];
  if (!system) next.players.find(p => p.id === command.playerId)!.participated = true;
  if (command.type === 'SetOrder') {
    next.orders = next.orders.filter(o => o.creatureId !== command.order.creatureId);
    next.orders.push(command.order); next.orders.sort((a,b) => a.creatureId < b.creatureId ? -1 : 1);
    const c = next.creatures.find(c => c.id === command.order.creatureId)!;
    next.reservations = replaceReservation(next.reservations, { orderId: c.id, creatureId: c.id, amount: 0 }, c.mana);
    // Private draft changes are acknowledged but never emitted as opponent-visible events.
  } else if (command.type === 'ReleaseHold') {
    next.holds = next.holds.filter(h => h.grapplerId !== command.creatureId || (command.targetId !== null && h.targetId !== command.targetId));
  } else if (command.type === 'ClearOrder') {
    next.orders = next.orders.filter(o => o.creatureId !== command.creatureId);
    next.reservations = next.reservations.filter(r => r.orderId !== command.creatureId);
  } else if (command.type === 'LockTurn') {
    const p = next.players.find(p => p.id === command.playerId)!;
    p.locked = true; p.missedTurns = 0;
    emit(next, events, { type: 'PlayerLocked', playerId: p.id });
    if (next.players.every(p => p.locked)) next.phase = 'ready';
  } else if (command.type === 'DeadlineReached') {
    for (const p of next.players.filter(p => !p.locked && !p.eliminated)) {
      if (p.participated) { p.locked = true; p.missedTurns = 0; emit(next, events, { type: 'PlayerAutoLocked', playerId: p.id }); continue; }
      p.missedTurns++;
      next.orders = next.orders.filter(o => next.creatures.find(c => c.id === o.creatureId)?.controller !== p.id);
      next.reservations = next.reservations.filter(r => next.creatures.find(c => c.id === r.creatureId)?.controller !== p.id);
      p.locked = true;
      emit(next, events, { type: 'PlanningMissed', playerId: p.id });
      if (p.missedTurns === 3) surrender(next, p.id, events);
    }
    next.phase = 'ready'; checkVictory(next, events);
  } else {
    for (const c of next.creatures.filter(c => c.alive)) if (!next.orders.some(o => o.creatureId === c.id)) next.orders.push(defaultOrder(c.id));
    // Initialization of the phase queue is delegated to the resolver after this acknowledgement.
    next.phase = 'early';
    next.cursor = { entries: [], index: 0, pathIndex: 0, initialized: false, activePath: null, lastRestingCentre: null };
    next.dashed = [];
    next.defending = next.orders.filter(o => { const c = next.creatures.find(c => c.id === o.creatureId)!; return active(c) && c.readyTurn <= next.turn; }).filter(o => o.early === 'TotalDefence' || o.late === 'TotalDefence' || o.early === 'Defend' || o.late === 'Defend')
      .map(o => ({ creatureId: o.creatureId, phases: o.early === 'TotalDefence' || o.late === 'TotalDefence' ? ['early', 'late'] :
        [...(o.early === 'Defend' ? ['early' as const] : []), ...(o.late === 'Defend' ? ['late' as const] : [])] }));
    emit(next, events, { type: 'ResolutionStarted' });
  }
  next.revision++;
  next.accepted.push({ command, revision: next.revision });
  return { state: next, events, acknowledgedRevision: next.revision };
}
export function applyCommand(state: GameState, input: unknown): Transition { return apply(state, input, false); }
export function applySystemCommand(state: GameState, input: unknown): Transition { return apply(state, input, true); }
export function systemCommand(state: GameState, type: 'DeadlineReached' | 'StartResolution', commandId: string): Command {
  return { matchId: state.matchId, playerId: '$system', turn: state.turn, expectedRevision: state.revision, commandId, type };
}
