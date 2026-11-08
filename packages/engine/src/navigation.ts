import type { Creature, GameState, Order } from '../../domain/src/state.js';
import { add, DIRECTIONS, compareHex, type Hex } from '../../geometry/src/hex.js';
import { stepLegality, placement } from '../../geometry/src/occupancy.js';
import { arenaOf } from './orders.js';
import { fearAllowsStep } from './status.js';
import { weedStepCost } from './tangleweed.js';
import { wallStepCost } from './walls.js';
export interface Route {
  path: Hex[];
  flightSteps?: NonNullable<Order['flightSteps']>;
  centre: Hex;
  height: Creature['height'];
  cost: number;
  expanded: number;
  reached: boolean;
}
interface Node {
  centre: Hex;
  height: Creature['height'];
  path: Hex[];
  flightSteps: NonNullable<Order['flightSteps']>;
  cost: number;
  estimate: number;
}
/** Bounded canonical A*. Only the supplied knowledge arena is inspected. Search
 * beyond this turn's allowance so a route can begin with a necessary detour. */
export function routeTowards(
  s: GameState,
  c: Creature,
  allowance: number,
  heuristic: (c: Creature) => number,
  goal: (c: Creature) => boolean,
  maxNodes = 192,
): Route {
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 1800) throw new Error('INVALID_SEARCH_LIMIT');
  const arena = arenaOf(s),
    start: Node = {
      centre: { ...c.centre },
      height: c.height,
      path: [],
      flightSteps: [],
      cost: 0,
      estimate: heuristic(c),
    };
  const open = [start],
    costs = new Map<string, number>(),
    nodeKey = (n: Pick<Node, 'centre' | 'height'>) => `${n.centre.q},${n.centre.r},${n.height}`;
  costs.set(nodeKey(start), 0);
  let best = start,
    expanded = 0,
    reached = false;
  while (open.length && expanded < maxNodes) {
    open.sort(
      (a, b) =>
        a.cost + a.estimate - b.cost - b.estimate ||
        a.estimate - b.estimate ||
        compareHex(a.centre, b.centre) ||
        (a.height < b.height ? -1 : 1),
    );
    const n = open.shift()!;
    if (n.cost !== costs.get(nodeKey(n))) continue;
    expanded++;
    const body = { ...c, centre: n.centre, height: n.height };
    if (placement(arena, body, n.centre).legal) {
      if (goal(body)) {
        best = n;
        reached = true;
        break;
      }
      if (n.estimate < best.estimate || (n.estimate === best.estimate && n.cost < best.cost)) best = n;
    }
    const choices = [
      ...DIRECTIONS.map(d => ({ centre: add(n.centre, d), height: n.height })),
      ...(c.flight ? [{ centre: n.centre, height: n.height === 'air' ? ('ground' as const) : ('air' as const) }] : []),
    ];
    for (const to of choices) {
      const vertical = to.height !== n.height,
        trial = { ...body, height: to.height };
      if (
        !fearAllowsStep(s, body, to.centre) ||
        !(vertical
          ? placement(arena, trial, to.centre).legal
          : stepLegality(arena, body, n.centre, to.centre, true).legal)
      )
        continue;
      const cost =
        n.cost +
        (vertical ? 1 : Math.max(weedStepCost(s, body, to.centre), wallStepCost(s, body, n.centre, to.centre)));
      const k = nodeKey(to);
      if (cost > 200 || (costs.get(k) ?? Infinity) <= cost) continue;
      costs.set(k, cost);
      open.push({
        ...to,
        path: [...n.path, { ...to.centre }],
        flightSteps: vertical ? [...n.flightSteps, { index: n.path.length, height: to.height }] : n.flightSteps,
        cost,
        estimate: heuristic(trial),
      });
    }
  }
  let centre = { ...c.centre },
    height = c.height,
    cost = 0,
    resting = 0,
    restingCost = 0;
  for (const [i, to] of best.path.entries()) {
    const nextHeight = best.flightSteps.find(f => f.index === i)?.height ?? height,
      body = { ...c, centre, height };
    const step = nextHeight !== height ? 1 : Math.max(weedStepCost(s, body, to), wallStepCost(s, body, centre, to));
    if (cost + step > allowance) break;
    cost += step;
    centre = to;
    height = nextHeight;
    if (placement(arena, { ...c, height }, to).legal) {
      resting = i + 1;
      restingCost = cost;
    }
  }
  const path = best.path.slice(0, resting),
    flightSteps = best.flightSteps.filter(f => f.index < resting);
  centre = path.at(-1) ?? c.centre;
  height = flightSteps.at(-1)?.height ?? c.height;
  return {
    path,
    ...(flightSteps.length ? { flightSteps } : {}),
    centre: { ...centre },
    height,
    cost: restingCost,
    expanded,
    reached,
  };
}
/** Every centre the creature could legally end on this turn, within its movement allowance (planning aid). */
export function reachableCells(s: GameState, c: Creature, allowance: number): Hex[] {
  const arena = arenaOf(s),
    best = new Map<string, number>(),
    key = (h: Hex, height: Creature['height']) => `${h.q},${h.r},${height}`,
    ends = new Map<string, Hex>();
  const open: { centre: Hex; height: Creature['height']; cost: number }[] = [
    { centre: c.centre, height: c.height, cost: 0 },
  ];
  best.set(key(c.centre, c.height), 0);
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const n = open.shift()!;
    if (n.cost !== best.get(key(n.centre, n.height))) continue;
    const body = { ...c, centre: n.centre, height: n.height };
    if (n.cost > 0 && placement(arena, body, n.centre).legal) ends.set(`${n.centre.q},${n.centre.r}`, n.centre);
    const choices = [
      ...DIRECTIONS.map(d => ({ centre: add(n.centre, d), height: n.height })),
      ...(c.flight ? [{ centre: n.centre, height: n.height === 'air' ? ('ground' as const) : ('air' as const) }] : []),
    ];
    for (const to of choices) {
      const vertical = to.height !== n.height;
      if (
        !fearAllowsStep(s, body, to.centre) ||
        !(vertical
          ? placement(arena, { ...body, height: to.height }, to.centre).legal
          : stepLegality(arena, body, n.centre, to.centre, true).legal)
      )
        continue;
      const cost =
        n.cost +
        (vertical ? 1 : Math.max(weedStepCost(s, body, to.centre), wallStepCost(s, body, n.centre, to.centre)));
      if (cost > allowance || (best.get(key(to.centre, to.height)) ?? Infinity) <= cost) continue;
      best.set(key(to.centre, to.height), cost);
      open.push({ ...to, cost });
    }
  }
  return [...ends.values()];
}
