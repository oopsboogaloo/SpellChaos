import type { GameState } from '../../domain/src/state.js';
import type { Clock } from './clock.js';
import { deadlineReached } from './clock.js';
import { applySystemCommand, systemCommand, type Transition } from './index.js';

/** Scheduler supplies the explicit deadline event; the simulation never reads wall-clock time. */
export function expirePlanning(state: GameState, clock: Clock, deadline: number | null): Transition | null {
  if (state.phase !== 'planning' || !deadlineReached(clock, deadline)) return null;
  return applySystemCommand(state, systemCommand(state, 'DeadlineReached', `deadline-${state.turn}`));
}
