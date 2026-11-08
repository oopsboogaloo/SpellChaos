import type { PlayerView } from '../../../packages/views/src/index.js';
import type { Creature, GameState, Order } from '../../../packages/domain/src/state.js';
import { knowledgeState } from '../../../packages/ai/src/knowledge.js';
import { movementAllowance } from '../../../packages/engine/src/orders.js';
import { reachableCells } from '../../../packages/engine/src/navigation.js';
import { inReach } from '../../../packages/engine/src/combat.js';
import { castReachable } from '../../../packages/engine/src/casting.js';
import { eligibleTarget } from '../../../packages/engine/src/powers.js';
import { visibleTo } from '../../../packages/engine/src/visibility.js';
import { footprint, fromOffset, inside, distance, nearestPair, type Hex } from '../../../packages/geometry/src/hex.js';
import type { CastAction } from '../../../packages/domain/src/spells.js';

type Attack = PlayerView['creatures'][number]['attacks'][number];
/** What the next board click means. */
export type Pending =
  | { kind: 'move' }
  | { kind: 'attack'; attack: Attack }
  | { kind: 'cast'; cast: CastAction; aim: 'creature' | 'ground' | 'either' | 'corpse' | 'cells' }
  | { kind: 'power'; action: PowerAction; label: string; range: number }
  | null;
/** Targeted creature abilities chosen from the action menu. */
export type PowerAction = 'Frighten' | 'Gaze' | 'Spores' | 'Grapple' | 'MarkQuarry' | 'Haunt';

/** What the player may click while a board command is pending. */
export interface Selectable {
  hexes: Hex[];
  creatures: string[];
  corpses: string[];
}
const key = (h: Hex) => `${h.q},${h.r}`;
export const hexKey = key;

function boardHexes(s: GameState): Hex[] {
  const all: Hex[] = [];
  for (let row = 0; row < s.board.rows; row++)
    for (let column = 0; column < s.board.columns; column++) all.push(fromOffset({ row, column }));
  return all;
}
function teleportDestination(order: Order | undefined): Hex | null {
  const early = order?.early;
  return early && typeof early === 'object' && early.type === 'Cast' && early.spell === 'Teleport'
    ? early.ground
    : null;
}
/** Where the creature stands when it acts in the chosen phase. */
export function actingPosition(unit: { centre: Hex }, order: Order | undefined, timing: 'early' | 'late'): Hex {
  if (timing === 'early') return unit.centre;
  return order?.path.at(-1) ?? teleportDestination(order) ?? unit.centre;
}

/** The hexes, creatures and corpses a pending command can legally use, judged from what the player can see.
 * The worker still validates the order; this only greys out choices that cannot work. */
export function selectable(
  view: PlayerView,
  unitId: string,
  order: Order | undefined,
  pending: Pending,
  timing: 'early' | 'late',
  chosenCells: Hex[] = [],
): Selectable | null {
  if (!pending) return null;
  const known = knowledgeState(view),
    actor = known.creatures.find(c => c.id === unitId);
  if (!actor) return null;
  const result: Selectable = { hexes: [], creatures: [], corpses: [] };
  if (pending.kind === 'move') {
    const start = teleportDestination(order);
    const mover: Creature = start ? { ...actor, centre: start } : actor;
    const allowance = movementAllowance(actor, {
      creatureId: actor.id,
      path: [],
      early: order?.early ?? null,
      late: order?.late ?? null,
    });
    result.hexes = reachableCells(known, mover, allowance);
    return result;
  }
  // After moving, the creature acts from the end of its path, at the height its planned flight steps leave it.
  const height = timing === 'late' ? (order?.flightSteps?.at(-1)?.height ?? actor.height) : actor.height;
  const from: Creature = { ...actor, centre: actingPosition(actor, order, timing), height };
  known.creatures = known.creatures.map(c => (c.id === actor.id ? from : c));
  if (pending.kind === 'attack') {
    const attack = from.attacks.find(a => a.id === pending.attack.id);
    if (!attack) return result;
    if (attack.mode === 'area') {
      const body = footprint(from.centre, from.size);
      result.hexes = boardHexes(known).filter(h => {
        const d = nearestPair(body, [h]).distance;
        return d <= attack.range && d >= attack.minRange;
      });
    } else
      result.creatures = known.creatures
        .filter(t => t.id !== from.id && t.alive && inReach(known, from, t, attack))
        .map(t => t.id);
    return result;
  }
  if (pending.kind === 'power') {
    const body = footprint(from.centre, from.size),
      a = pending.action;
    if (a === 'Haunt') result.hexes = boardHexes(known).filter(h => nearestPair(body, [h]).distance <= pending.range);
    else
      result.creatures = known.creatures
        .filter(t => {
          if (t.id === from.id || !t.alive || !visibleTo(known, t, from.controller!)) return false;
          if (a === 'MarkQuarry') return true;
          if (a === 'Grapple')
            return t.controller !== from.controller && nearestPair(body, footprint(t.centre, t.size)).distance <= 1;
          return eligibleTarget(known, from, t, { type: a, targetId: t.id }, pending.range);
        })
        .map(t => t.id);
    return result;
  }
  const cast = pending.cast;
  if (pending.aim === 'creature' || pending.aim === 'either')
    result.creatures = known.creatures
      .filter(t => t.alive && castReachable(known, from, { ...cast, targetId: t.id, ground: null }))
      .map(t => t.id);
  if (pending.aim === 'corpse')
    result.corpses = known.corpses
      .filter(t => castReachable(known, from, { ...cast, targetId: t.id, ground: null }))
      .map(t => t.id);
  if (pending.aim === 'ground' || pending.aim === 'either')
    result.hexes = boardHexes(known).filter(h => castReachable(known, from, { ...cast, ground: h, targetId: null }));
  if (pending.aim === 'cells') {
    // Each Tangleweed cell must be in range and sight, and joined to the cells already chosen.
    const chosen = new Set(chosenCells.map(key));
    result.hexes = boardHexes(known).filter(
      h =>
        inside(h, known.board) &&
        !chosen.has(key(h)) &&
        (chosenCells.length === 0 || chosenCells.some(c => distance(c, h) === 1)) &&
        castReachable(known, from, { ...cast, level: 1, hexes: [h], ground: h, targetId: null }),
    );
  }
  return result;
}
