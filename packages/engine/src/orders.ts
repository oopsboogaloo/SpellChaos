import {canDrag,dragStepLegal,planningDragState} from './drag.js';
import {blinkLegal,movementStepCost} from './blink.js';
import { validateCast, reservedMana, castingLocksMovement } from './casting.js';
import { castingTime, completionAt } from '../../content/src/spells.js';
import { active, afterEarlyWake, incapacitated, slowed, subdued, restrained, fearAllowsStep } from './status.js';
import { validateCombatAction } from './combat.js';
import type { Creature, GameState, Order } from '../../domain/src/state.js';
import { stepLegality, placement, type ArenaGeometry } from '../../geometry/src/occupancy.js';

export function effectiveMove(c: Creature): number { return c.move === 0 ? 0 : slowed(c) ? Math.max(1, Math.floor(c.move / 2)) : c.move; }
export function movementAllowance(c: Creature, order: Order): number {
  if (c.restrained || incapacitated(c) || !c.alive || order.early === 'TotalDefence' || order.late === 'TotalDefence') return 0;
  const normal=effectiveMove(c)*(order.early==='Dash'?2:1)+(c.kind==='illusion'?2:0);
  return order.dragTargetId!==undefined&&c.drag&&normal>0?Math.max(1,Math.floor(normal/c.drag.moveDivisor)):normal;
}
export function defaultOrder(creatureId: string): Order { return { creatureId, path: [], early: 'TotalDefence', late: null }; }
export function arenaOf(state: GameState): ArenaGeometry {
  return { board: state.board, walls: state.walls, creatures: state.creatures.filter(c => c.alive).map(c => ({ ...c, illusion: c.kind === 'illusion' })) };
}
export function validateOrder(state: GameState, order: Order, playerId: string): void {
  const stored = state.creatures.find(c => c.id === order.creatureId);
  if (!stored || stored.controller !== playerId) throw new Error('NOT_CONTROLLED');
  // A known Early expiry permits plans for movement/Late after waking, without
  // granting the sleeping creature an Early action or mutating live conditions.
  const c=afterEarlyWake(stored,state.turn);
  const wakesEarly=c!==stored;
  if(wakesEarly&&order.early!==null)throw new Error('INELIGIBLE_CREATURE');
  if (!active(c) || c.readyTurn > state.turn) throw new Error('INELIGIBLE_CREATURE');
  const actions = [order.early, order.late].filter(a => a !== null);
  if (order.late === 'Dash') throw new Error('DASH_EARLY_ONLY');
  if (actions.includes('TotalDefence') && (actions.length !== 1 || order.path.length !== 0)) throw new Error('TOTAL_DEFENCE_WHOLE_TURN');
  if (actions.length > (c.doubleAction && !subdued(c) ? 2 : 1)) throw new Error('ACTION_BUDGET');
  if (subdued(c) && order.path.length && actions.length) throw new Error('SUBDUED_BUDGET');
  const pathStart=order.early&&typeof order.early==='object'&&order.early.type==='Cast'&&order.early.spell==='Teleport'?order.early.ground!:c.centre;
  const movementState=planningDragState(state,c,order);
  if(order.dragTargetId!==undefined&&(!order.path.length||order.blinkIndex!==undefined||!canDrag(movementState,c,order)))throw new Error('INVALID_DRAG_ORDER');
  if(order.blinkIndex!==undefined&&(!c.blink||c.blinkUsedTurn===state.turn||order.blinkIndex>=order.path.length))throw new Error('INVALID_BLINK_ORDER');
  if (order.path.reduce((n,h,i)=>n+movementStepCost(movementState,c,order,i,i?order.path[i-1]!:pathStart,h),0) > movementAllowance(c, order)) throw new Error('MOVEMENT_BUDGET');
  if (order.path.length && (order.dragTargetId!==undefined?!canDrag(movementState,c,order):restrained(state,c))) throw new Error('RESTRAINED');
  if(order.path.length && castingLocksMovement(state,c,true))throw new Error('CASTING_IMMOBILE');
  const existing=state.casts.find(cast=>cast.casterId===c.id);
  if(existing && subdued(c) && order.path.length)throw new Error('SUBDUED_BUDGET');
  if(existing && (actions.includes('TotalDefence') || order.early || (order.late && (!c.doubleAction || existing.dueTurn!==state.turn || existing.duePhase!=='early'))))throw new Error('CASTING_OCCUPIES_ACTION');
  for (const phase of ['early','late'] as const) {
    const action=order[phase];if(!action||typeof action!=='object')continue;
    if(action.type==='Cast'){
      validateCast(state,c,action);
      const timing=castingTime(action.spell),due=completionAt(state.turn,phase,timing);
      if(phase==='early' && order.path.length && (due.turn>state.turn||due.phase==='late'))throw new Error('CASTING_IMMOBILE');
      if(phase==='early' && order.late && (due.turn>state.turn||due.phase==='late'))throw new Error('CASTING_OCCUPIES_ACTION');
    }else validateCombatAction(state,c,action);
  }
  if(reservedMana(order)>c.mana)throw new Error('INSUFFICIENT_MANA');
  // Static terrain is known; moving creatures are rechecked at resolution.
  const arena = { ...arenaOf(state), creatures: [] };
  let from = order.early && typeof order.early==='object' && order.early.type==='Cast' && order.early.spell==='Teleport' ? order.early.ground! : c.centre;
  for (const [i,to] of order.path.entries()) {
    if (!fearAllowsStep(state,{...c,centre:from},to)) throw new Error('FEAR_APPROACH');
    if (!(order.dragTargetId!==undefined?dragStepLegal(movementState,c,order,from,to,true):order.blinkIndex===i?blinkLegal(state,c,from,to,true):stepLegality(arena,c,from,to,true).legal)) throw new Error('INVALID_PATH');
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
