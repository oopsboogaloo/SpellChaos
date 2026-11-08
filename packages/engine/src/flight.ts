import type { Creature, GameState, Order } from '../../domain/src/state.js';
import { distance, type Hex } from '../../geometry/src/hex.js';
import { placement, stepLegality } from '../../geometry/src/occupancy.js';
import { arenaOf } from './orders.js';
import { weedStepCost } from './tangleweed.js';
import { wallStepCost } from './walls.js';

export const flightHeight = (c: Creature, order: Order, index: number): Creature['height'] =>
  order.flightSteps?.find(x => x.index === index)?.height ?? c.height;
export function flightStepLegal(
  s: GameState,
  c: Creature,
  order: Order,
  index: number,
  from: Hex,
  to: Hex,
  transit: boolean,
  ignoreCreatures = false,
): boolean {
  const arena = ignoreCreatures ? { ...arenaOf(s), creatures: [] } : arenaOf(s),
    change = order.flightSteps?.find(x => x.index === index);
  if (change)
    return (
      !!c.flight &&
      change.height !== c.height &&
      distance(from, to) === 0 &&
      placement(arena, { ...c, height: change.height }, to).legal
    );
  return stepLegality(arena, c, from, to, transit).legal;
}
export function flightStepCost(s: GameState, c: Creature, order: Order, index: number, from: Hex, to: Hex): number {
  const change = order.flightSteps?.find(x => x.index === index);
  return change ? 1 : Math.max(weedStepCost(s, c, to), wallStepCost(s, c, from, to));
}
export function prepareFlightPath(s: GameState, c: Creature, order: Order, allowance: number): Hex[] {
  const mover = { ...c },
    path: Hex[] = [];
  let from = c.centre,
    paid = 0,
    restingLength = 0;
  for (const [index, to] of order.path.entries()) {
    const cost = flightStepCost(s, mover, order, index, from, to);
    if (paid + cost > allowance || !flightStepLegal(s, mover, order, index, from, to, true)) break;
    mover.height = flightHeight(mover, order, index);
    mover.centre = to;
    path.push({ ...to });
    paid += cost;
    from = to;
    if (placement(arenaOf(s), mover, to).legal) restingLength = path.length;
  }
  return path.slice(0, restingLength);
}
