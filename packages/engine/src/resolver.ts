import type { Creature, GameState } from '../../domain/src/state.js';
import { nearestPair, footprint } from '../../geometry/src/hex.js';
import { legalPathPrefix, stepLegality } from '../../geometry/src/occupancy.js';
import { arenaOf, defaultOrder, effectiveMove, movementAllowance } from './orders.js';
import { buildQueue } from './queue.js';
import { checkVictory, emit, type Event, type Transition } from './index.js';

const eligible = (c: Creature, turn: number) => c.alive && !c.incapacitated && c.readyTurn <= turn;
export function isDefending(state: GameState, creatureId: string, phase: 'early' | 'late'): boolean {
  return state.defending.some(d => d.creatureId === creatureId && d.phases.includes(phase));
}
function initialize(state: GameState, events: Event[]): void {
  const candidates = state.creatures.filter(c => c.alive).map(c => {
    const player = state.players.find(p => p.id === c.controller);
    const wizard = state.creatures.find(w => w.id === player?.wizardId);
    return { creatureId: c.id, dex: c.dex, move: effectiveMove(c), size: c.size, slowed: c.slowed, quick: false,
      wizardDistance: wizard ? nearestPair(footprint(c.centre, c.size), footprint(wizard.centre, wizard.size)).distance : 0 };
  });
  const queue = buildQueue(candidates, state.random.resolution, state.phase === 'movement');
  state.random.resolution = queue.randomState;
  state.cursor = { entries: queue.entries, index: 0, pathIndex: 0, initialized: true, activePath: null };
  emit(state, events, { type: 'PhaseStarted' });
}
function finishPhase(state: GameState, events: Event[]): void {
  emit(state, events, { type: 'PhaseEnded' });
  if (checkVictory(state, events)) return;
  state.cursor = { entries: [], index: 0, pathIndex: 0, initialized: false, activePath: null };
  if (state.phase === 'early') state.phase = 'movement';
  else if (state.phase === 'movement') state.phase = 'late';
  else {
    // Damage, durations, mana and spell awards are later stages, never silently simulated here.
    state.turn++; state.phase = 'planning'; state.orders = []; state.dashed = []; state.reservations = []; state.defending = [];
    for (const p of state.players) { p.locked = p.eliminated; p.participated = false; }
    emit(state, events, { type: 'TurnStarted' });
  }
}
export function advanceAtomicStep(state: GameState): Transition {
  if (!['early', 'movement', 'late'].includes(state.phase)) throw new Error('NOT_RESOLVING');
  const next = structuredClone(state), events: Event[] = [];
  if (!next.cursor.initialized) initialize(next, events);
  else if (next.cursor.index === next.cursor.entries.length) finishPhase(next, events);
  else {
    const entry = next.cursor.entries[next.cursor.index]!;
    const c = next.creatures.find(c => c.id === entry.creatureId)!;
    const order = next.orders.find(o => o.creatureId === c.id) ?? defaultOrder(c.id);
    const advanceActor = () => { next.cursor.index++; next.cursor.pathIndex = 0; next.cursor.activePath = null; };
    if (!eligible(c, next.turn)) {
      emit(next, events, { type: 'ActorSkipped', creatureId: c.id }); advanceActor();
    } else if (next.phase === 'movement') {
      if (next.cursor.activePath === null) {
        next.cursor.activePath = legalPathPrefix(arenaOf(next), c, order.path, movementAllowance(c, order.early === 'Dash' && !next.dashed.includes(c.id) ? { ...order, early: null } : order));
        emit(next, events, { type: next.cursor.activePath.length < order.path.length ? 'PathTruncated' : 'PathPrepared', creatureId: c.id });
      } else if (next.cursor.pathIndex >= next.cursor.activePath.length) advanceActor();
      else {
        const to = next.cursor.activePath[next.cursor.pathIndex]!;
        if (!stepLegality(arenaOf(next), c, c.centre, to, next.cursor.pathIndex < next.cursor.activePath.length - 1).legal) {
          emit(next, events, { type: 'MovementBlocked', creatureId: c.id }); advanceActor();
        } else {
          const from = { ...c.centre }; c.centre = { ...to }; next.cursor.pathIndex++;
          emit(next, events, { type: 'CreatureMoved', creatureId: c.id, from, to: { ...to } });
        }
      }
    } else {
      const action = next.phase === 'early' ? order.early : order.late;
      if (action === 'Dash') next.dashed.push(c.id);
      if (action) emit(next, events, { type: 'ActionResolved', creatureId: c.id, action });
      advanceActor();
    }
  }
  return { state: next, events, acknowledgedRevision: next.revision };
}
