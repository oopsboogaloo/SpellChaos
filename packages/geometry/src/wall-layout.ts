import { compareHex, equal, key, neighbours, type Hex } from './hex.js';
import { edge, edgeKey, type Edge, type Material } from './walls.js';
import { legalWallPlacement, type ArenaGeometry } from './occupancy.js';

/** Each physical corner is the canonical triple of cells meeting there.
 * Off-board cells still identify a corner; no floating-point coordinates are needed. */
export function edgeVertexKeys(segment: Edge): [string, string] {
  const ordered = edge(segment.a, segment.b);
  const adjacent = neighbours(ordered.b);
  const thirds = neighbours(ordered.a).filter(c => adjacent.some(n => equal(c, n)));
  return thirds.map(c => [ordered.a, ordered.b, c].sort(compareHex).map(key).join('|')).sort() as [string, string];
}

/** Connected in the wall network, not in the dual graph of cell centres. */
export function connectedWallEdges(segments: readonly Edge[]): boolean {
  if (!segments.length) return false;
  if (new Set(segments.map(edgeKey)).size !== segments.length) return false;
  const endpoints = segments.map(edgeVertexKeys);
  const reached = new Set<number>([0]),
    frontier = [0];
  while (frontier.length) {
    const vertices = endpoints[frontier.pop()!]!;
    endpoints.forEach((ends, index) => {
      if (!reached.has(index) && ends.some(v => vertices.includes(v))) {
        reached.add(index);
        frontier.push(index);
      }
    });
  }
  return reached.size === segments.length;
}

/** Perimeter of a cell cluster; includes interior holes if the cluster has them. */
export function boundaryEdges(cells: readonly Hex[]): Edge[] {
  const occupied = new Set(cells.map(key)),
    result = new Map<string, Edge>();
  for (const cell of cells)
    for (const next of neighbours(cell)) {
      if (occupied.has(key(next))) continue;
      const segment = edge(cell, next);
      result.set(edgeKey(segment), segment);
    }
  return [...result.values()].sort((a, b) => compareHex(a.a, b.a) || compareHex(a.b, b.b));
}

/** Pure placement primitive. Casting range and visibility are checked by the caster. */
export function legalWallLayout(
  arena: ArenaGeometry,
  segments: readonly Edge[],
  material: Material,
  maximum: number,
): boolean {
  if (!Number.isInteger(maximum) || maximum < 1 || segments.length > maximum || !connectedWallEdges(segments))
    return false;
  return segments.every((segment, i) => legalWallPlacement(arena, { id: `preview-${i}`, edge: segment, material }));
}
