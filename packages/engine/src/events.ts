import { visibleTo } from './visibility.js';
import type { Creature, GameState } from '../../domain/src/state.js';
export interface Event {
  audience?: string[];
  type: string;
  sequence: number;
  turn: number;
  phase: GameState['phase'];
  creatureId?: string;
  targetId?: string;
  /** The creature that caused damage, when there is one (DamageApplied). */
  sourceId?: string;
  playerId?: string;
  from?: Creature['centre'];
  to?: Creature['centre'];
  action?: string;
  amount?: number;
  critical?: boolean;
  damageByTarget?: { targetId: string; amount: number }[];
}
export interface Transition {
  state: GameState;
  events: Event[];
  acknowledgedRevision: number;
}
export function emit(state: GameState, events: Event[], event: Omit<Event, 'sequence' | 'turn' | 'phase'>): void {
  const actors = [event.creatureId, event.targetId]
    .filter((id): id is string => !!id)
    .map(id => state.creatures.find(c => c.id === id))
    .filter((c): c is Creature => !!c);
  const audience =
    state.darkness.length || state.creatures.some(c => c.invisible)
      ? state.players
          .filter(
            p =>
              actors.every(c => visibleTo(state, c, p.id)) &&
              (!event.from || !actors[0] || visibleTo(state, { ...actors[0], centre: event.from }, p.id)) &&
              (!event.to || !actors[0] || visibleTo(state, { ...actors[0], centre: event.to }, p.id)),
          )
          .map(p => p.id)
      : undefined;
  events.push({
    ...event,
    ...(audience ? { audience: event.audience ? audience.filter(id => event.audience!.includes(id)) : audience } : {}),
    sequence: ++state.eventSequence,
    turn: state.turn,
    phase: state.phase,
  });
}
