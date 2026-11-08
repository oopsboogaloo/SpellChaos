import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { add, disk, neighbours, type Hex } from '../packages/geometry/src/hex.js';
import { edge, edgeKey } from '../packages/geometry/src/walls.js';
import {
  boundaryEdges,
  connectedWallEdges,
  edgeVertexKeys,
  legalWallLayout,
} from '../packages/geometry/src/wall-layout.js';
import { emptyArena } from '../packages/geometry/src/occupancy.js';
const h = (q: number, r: number): Hex => ({ q, r });

describe('physical wall segment networks', () => {
  it('distinguishes adjoining edges from opposite edges of the same hex', () => {
    const centre = h(5, 5),
      around = neighbours(centre).map(n => edge(centre, n));
    expect(connectedWallEdges([around[0]!, around[1]!])).toBe(true);
    expect(connectedWallEdges([around[0]!, around[3]!])).toBe(false);
    expect(connectedWallEdges(around)).toBe(true);
  });
  it('identifies a corner equally from each of the three incident segments', () => {
    const a = h(0, 0),
      b = h(1, 0),
      c = h(0, 1);
    const shared = edgeVertexKeys(edge(a, b)).filter(v => edgeVertexKeys(edge(a, c)).includes(v));
    expect(shared).toHaveLength(1);
    expect(edgeVertexKeys(edge(b, c))).toContain(shared[0]);
    expect(connectedWallEdges([edge(a, b), edge(b, c), edge(c, a)])).toBe(true);
  });
  it.each([0, 1, 2, 3, 4])('builds a closed radius-%i perimeter with no internal edges', radius => {
    const cells = disk(h(10, 10), radius),
      boundary = boundaryEdges(cells);
    expect(boundary).toHaveLength(6 * (2 * radius + 1));
    expect(connectedWallEdges(boundary)).toBe(true);
    const vertices = boundary.flatMap(edgeVertexKeys);
    expect(new Set(vertices).size).toBe(boundary.length);
    for (const v of new Set(vertices)) expect(vertices.filter(x => x === v)).toHaveLength(2);
    expect(boundaryEdges([...cells].reverse())).toEqual(boundary);
    expect(boundaryEdges([...cells, ...cells])).toEqual(boundary);
  });
  it('rejects empty, duplicate, disconnected and over-budget layouts', () => {
    const ring = boundaryEdges([h(5, 5)]),
      arena = emptyArena();
    expect(connectedWallEdges([])).toBe(false);
    expect(connectedWallEdges([ring[0]!, { a: ring[0]!.b, b: ring[0]!.a }])).toBe(false);
    expect(legalWallLayout(arena, ring, 'stone', 5)).toBe(false);
    expect(legalWallLayout(arena, ring, 'stone', 6)).toBe(true);
    expect(legalWallLayout(arena, ring, 'stone', 0)).toBe(false);
    expect(legalWallLayout(arena, ring, 'stone', 6.5)).toBe(false);
    expect(() => edgeVertexKeys({ a: h(0, 0), b: h(3, 0) })).toThrow('NON_ADJACENT_EDGE');
  });
  it('validates footprints, existing segments and board boundary corners', () => {
    const arena = emptyArena(),
      segment = edge(h(5, 5), h(6, 5));
    arena.creatures.push({ id: 'large', centre: h(5, 5), size: 3, height: 'ground', intelligence: 3, controller: 'a' });
    expect(legalWallLayout(arena, [segment], 'stone', 3)).toBe(false);
    expect(legalWallLayout(arena, [segment], 'fire', 3)).toBe(true);
    arena.creatures = [];
    arena.walls.push({ id: 'wall', edge: segment, material: 'stone' });
    expect(legalWallLayout(arena, [segment], 'fire', 3)).toBe(false);
    expect(legalWallLayout(arena, [edge(h(0, 0), h(-1, 0))], 'wood', 3)).toBe(true);
    expect(legalWallLayout(arena, [edge(h(-3, 0), h(-2, 0))], 'wood', 3)).toBe(false);
  });
  it('is independent of endpoint orientation, input order and translated coordinates', () => {
    fc.assert(
      fc.property(
        fc.record({ q: fc.integer({ min: -100, max: 100 }), r: fc.integer({ min: -100, max: 100 }) }),
        offset => {
          const original = boundaryEdges(disk(h(0, 0), 2));
          const translated = original.map(e => ({ a: add(e.b, offset), b: add(e.a, offset) })).reverse();
          expect(connectedWallEdges(translated)).toBe(true);
          for (const e of translated) expect(edgeVertexKeys(e)).toEqual(edgeVertexKeys({ a: e.b, b: e.a }));
          expect(new Set(translated.map(edgeKey)).size).toBe(original.length);
        },
      ),
      { seed: 6002, numRuns: 100 },
    );
  });
});
