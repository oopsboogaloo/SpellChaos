import { active, incapacitated, slowed, subdued, restrained, fearAllowsStep } from './status.js';
import { validateCombatAction } from './combat.js';
import type { Creature, GameState, Order } from '../../domain/src/state.js';
import { stepLegality, placement, type ArenaGeometry } from '../../geometry/src/occupancy.js';

export function effectiveMove(c: Creature): number { return c.move === 0 ? 0 : slowed(c) ? Math.max(1, Math.floor(c.move / 2)) : c.move; }
export function movementAllowance(c: Creature, order: Order): number {
  if (c.restrained || incapacitated(c) || !c.alive || order.early === 'TotalDefence' || order.late === 'TotalDefence') return 0;
  return effectiveMove(c) * (order.early === 'Dash' ? 2 : 1);
}
export function defaultOrder(creatureId: string): Order { return { creatureId, path: [], early: 'TotalDefence', late: null }; }
export function arenaOf(state: GameState): ArenaGeometry {
  return { board: state.board, walls: state.walls, creatures: state.creatures.filter(c => c.alive).map(c => ({ ...c, illusion: c.kind === 'illusion' })) };
}
export function validateOrder(state: GameState, order: Order, playerId: string): void {
  const c = state.creatures.find(c => c.id === order.creatureId);
  if (!c || c.controller !== playerId) throw new Error('NOT_CONTROLLED');
  if (!active(c) || c.readyTurn > state.turn) throw new Error('INELIGIBLE_CREATURE');
  const actions = [order.early, order.late].filter(a => a !== null);
  if (order.late === 'Dash') throw new Error('DASH_EARLY_ONLY');
  if (actions.includes('TotalDefence') && (actions.length !== 1 || order.path.length !== 0)) throw new Error('TOTAL_DEFENCE_WHOLE_TURN');
  if (actions.length > (c.doubleAction && !subdued(c) ? 2 : 1)) throw new Error('ACTION_BUDGET');
  if (subdued(c) && order.path.length && actions.length) throw new Error('SUBDUED_BUDGET');
  if (order.path.length > movementAllowance(c, order)) throw new Error('MOVEMENT_BUDGET');
  if (order.path.length && restrained(state,c)) throw new Error('RESTRAINED');
  for (const action of actions) if (typeof action === 'object') validateCombatAction(state,c,action);
  // Static terrain is known; moving creatures are rechecked at resolution.
  const arena = { ...arenaOf(state), creatures: [] };
  let from = c.centre;
  for (const to of order.path) {
    if (!fearAllowsStep(state,{...c,centre:from},to)) throw new Error('FEAR_APPROACH');
    if (!stepLegality(arena, c, from, to, true).legal) throw new Error('INVALID_PATH');
    from = to;
  }
  if (order.path.length && !placement(arena, c, from).legal) throw new Error('INVALID_DESTINATION');
}

export interface Reservation { orderId: string; creatureId: string; amount: number }
/** Replace one reservation atomically. Enabled Stage3 actions all have zero mana cost. */
export function replaceReservation(existing: readonly Reservation[], reservation: Reservation, mana: number): Reservation[] {
  if (!Number.isInteger(reservation.amount) || reservation.amount < 0 || !Number.isInteger(mana) || mana < 0) throw new Error('INVALID_RESERVATION');
  const next = existing.filter(r => r.orderId !== reservation.orderId).map(r => ({ ...r }));
  if (reservation.amount) next.push({ ...reservation });
  if (next.filter(r => r.creatureId === reservation.creatureId).reduce((sum, r) => sum + r.amount, 0) > mana) throw new Error('INSUFFICIENT_MANA');
  return next;
}
