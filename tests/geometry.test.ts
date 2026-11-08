import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ARENA,
  DIRECTIONS,
  add,
  disk,
  distance,
  footprint,
  fromOffset,
  inside,
  key,
  nearestPair,
  oppositeSectors,
  overlap,
  toOffset,
  worldPoint,
} from '../packages/geometry/src/hex.js';
import { traceRay } from '../packages/geometry/src/ray.js';
import { clearProjectile, clearSight, crossedWalls, edge, edgeKey, type Wall } from '../packages/geometry/src/walls.js';
import {
  affectedCreatures,
  emptyArena,
  legalPathPrefix,
  legalWallPlacement,
  nearestLegal,
  placement,
  stepLegality,
  swarmCoveredTargets,
  traceProjectile,
  type Occupant,
} from '../packages/geometry/src/occupancy.js';
import { insetPerimeter, startingPositions } from '../packages/geometry/src/spawn.js';

const h = (q: number, r: number) => ({ q, r });
const unit = (id = 'u', centre = h(10, 10), overrides: Partial<Occupant> = {}): Occupant => ({
  id,
  centre,
  size: 2,
  height: 'ground',
  intelligence: 3,
  controller: 'p1',
  ...overrides,
});
const wall = (material: Wall['material'] = 'stone', a = h(10, 10), b = h(11, 10)): Wall => ({
  id: 'wall',
  material,
  edge: edge(a, b),
});
const coordinate = fc.record({ q: fc.integer({ min: -20, max: 20 }), r: fc.integer({ min: -20, max: 20 }) });

describe('hex geometry', () => {
  it('roundtrips odd-row offsets, including negative rows', () => {
    fc.assert(
      fc.property(coordinate, p => {
        expect(fromOffset(toOffset(p))).toEqual(p);
      }),
      { seed: 2001, numRuns: 1000 },
    );
  });
  it('has unit centre spacing and cube-distance symmetry/triangle inequality', () => {
    for (const d of DIRECTIONS) {
      const p = worldPoint(d);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(1);
    }
    fc.assert(
      fc.property(coordinate, coordinate, coordinate, (a, b, c) => {
        expect(distance(a, b)).toBe(distance(b, a));
        expect(distance(a, c)).toBeLessThanOrEqual(distance(a, b) + distance(b, c));
      }),
      { seed: 2002 },
    );
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('Size %i has the exact compact footprint', size => {
    const cells = footprint(h(0, 0), size);
    const radius = Math.floor((size - 1) / 2);
    expect(cells).toHaveLength([1, 7, 19, 37, 61][radius]!);
    expect(new Set(cells.map(key)).size).toBe(cells.length);
    expect(cells.every(c => distance(h(0, 0), c) <= radius)).toBe(true);
  });
  it('validates geometry boundaries and inputs', () => {
    expect(inside(fromOffset({ column: 29, row: 29 }))).toBe(true);
    expect(inside(fromOffset({ column: 30, row: 29 }))).toBe(false);
    expect(() => footprint(h(0, 0), 0)).toThrow();
    expect(() => footprint(h(0, 0), 11)).toThrow();
    expect(() => disk(h(0, 0), -1)).toThrow();
    expect(() => distance(h(NaN, 0), h(0, 0))).toThrow();
    expect(() => inside(h(0, 0), { columns: 0, rows: 30 })).toThrow();
  });
  it('measures nearest occupied range, rather than centre distance', () => {
    expect(nearestPair(footprint(h(0, 0), 3), footprint(h(3, 0), 4)).distance).toBe(1);
    expect(overlap(footprint(h(0, 0), 3), [h(1, 0)])).toBe(true);
    expect(() => nearestPair([], [h(0, 0)])).toThrow();
  });
  it('recognizes opposite sectors without facing', () => {
    for (const [i, d] of DIRECTIONS.entries()) expect(oppositeSectors(h(0, 0), d, DIRECTIONS[(i + 3) % 6]!)).toBe(true);
    expect(oppositeSectors(h(0, 0), h(1, 0), h(0, 1))).toBe(false);
  });
});

describe('exact rays and walls', () => {
  it('traces a straight ray and stores the boundary side choice', () => {
    expect(traceRay(h(0, 0), h(3, 0), 'left')).toEqual([h(0, 0), h(1, 0), h(2, 0), h(3, 0)]);
    expect(traceRay(h(0, 0), h(1, 1), 'left')).toEqual([h(0, 0), h(0, 1), h(1, 1)]);
    expect(traceRay(h(0, 0), h(1, 1), 'right')).toEqual([h(0, 0), h(1, 0), h(1, 1)]);
  });
  it('produces connected rays reversible by exchanging sides', () => {
    fc.assert(
      fc.property(coordinate, coordinate, (a, b) => {
        const path = traceRay(a, b, 'left');
        expect(path[0]).toEqual(a);
        expect(path.at(-1)).toEqual(b);
        expect(path).toEqual(traceRay(b, a, 'right').reverse());
        for (let i = 1; i < path.length; i++) expect(distance(path[i - 1]!, path[i]!)).toBe(1);
      }),
      { seed: 2003, numRuns: 400 },
    );
  });
  it('canonicalizes interior and boundary edges and rejects non-neighbours', () => {
    expect(edgeKey(edge(h(0, 0), h(-1, 0)))).toBe(edgeKey(edge(h(-1, 0), h(0, 0))));
    expect(() => edge(h(0, 0), h(2, 0))).toThrow();
  });
  it('crystal permits sight but blocks projectiles; ordinary walls block both', () => {
    const a = h(10, 10),
      b = h(12, 10);
    expect(clearSight(a, b, 'left', [wall('crystal')])).toBe(true);
    expect(clearProjectile(a, b, 'left', [wall('crystal')])).toBe(false);
    expect(clearSight(a, b, 'left', [wall()])).toBe(false);
    expect(clearProjectile(a, b, 'left', [wall()], true)).toBe(true);
    expect(clearProjectile(a, b, 'left', [wall('energy')], true)).toBe(false);
    expect(crossedWalls(traceRay(a, b, 'left'), [wall()])).toHaveLength(1);
  });
});

describe('occupancy and movement geometry', () => {
  it.each(['wood', 'stone', 'iron', 'crystal', 'energy', 'thorns', 'fire', 'death'] as const)(
    'applies %s wall movement geometry independently of damage',
    material => {
      const arena = emptyArena(),
        mover = unit();
      arena.walls = [wall(material)];
      const passable = ['thorns', 'fire', 'death'].includes(material);
      expect(stepLegality(arena, mover, mover.centre, h(11, 10)).legal).toBe(passable);
      expect(stepLegality(arena, { ...mover, height: 'air' }, mover.centre, h(11, 10)).legal).toBe(
        material !== 'energy',
      );
    },
  );
  it('rejects new solid walls through occupied footprints, duplicates and wholly outside edges', () => {
    const arena = emptyArena();
    arena.creatures = [unit('large', h(10, 10), { size: 3 })];
    expect(legalWallPlacement(arena, wall())).toBe(false);
    expect(legalWallPlacement(arena, wall('fire'))).toBe(true);
    arena.creatures = [];
    arena.walls = [wall()];
    expect(legalWallPlacement(arena, wall('crystal'))).toBe(false);
    expect(legalWallPlacement(arena, wall('stone', h(-10, 0), h(-9, 0)))).toBe(false);
    expect(legalWallPlacement(arena, wall('stone', h(-1, 0), h(0, 0)))).toBe(true);
  });
  it('retains ray side, occupants and wall decisions through scenario serialization', () => {
    const arena = emptyArena(),
      origin = unit();
    arena.creatures = [origin, unit('left', h(10, 11)), unit('right', h(11, 10))];
    const scenario = { arena, origin, target: h(11, 11), side: 'left' as const };
    const restored = JSON.parse(JSON.stringify(scenario)) as typeof scenario;
    const expected = traceProjectile(arena, origin, scenario.target, 'ground', scenario.side);
    expect(expected.hit).toBe('left');
    expect(traceProjectile(restored.arena, restored.origin, restored.target, 'ground', restored.side)).toEqual(
      expected,
    );
    expect(traceProjectile(arena, origin, scenario.target, 'ground', 'right').hit).toBe('right');
  });
  it('rejects clipped large footprints, overlaps and wall straddling', () => {
    const arena = emptyArena(),
      mover = unit('large', h(10, 10), { size: 3 });
    expect(placement(arena, mover, h(0, 0))).toEqual({ legal: false, reason: 'BOUNDARY' });
    arena.creatures.push(unit('blocker'));
    expect(placement(arena, mover, mover.centre).legal).toBe(false);
    arena.creatures = [];
    arena.walls = [wall()];
    expect(placement(arena, mover, mover.centre)).toEqual({ legal: false, reason: 'WALL' });
  });
  it('allows flying and incorporeal transit but requires legal resting footprints', () => {
    const arena = emptyArena();
    arena.creatures = [unit('blocker', h(11, 10))];
    arena.walls = [wall()];
    const flyer = unit('flyer', h(10, 10), { height: 'air' });
    expect(stepLegality(arena, flyer, flyer.centre, h(11, 10), true).legal).toBe(true);
    expect(placement(arena, flyer, h(11, 10)).legal).toBe(false);
    expect(legalPathPrefix(arena, flyer, [h(11, 10), h(12, 10)], 2)).toEqual([h(11, 10), h(12, 10)]);
    expect(legalPathPrefix(arena, flyer, [h(11, 10)], 1)).toEqual([]);
    arena.walls = [wall('energy')];
    expect(stepLegality(arena, flyer, flyer.centre, h(11, 10), true).legal).toBe(false);
    const ghost = unit('ghost', h(10, 10), { incorporeal: true });
    arena.walls = [wall()];
    expect(stepLegality(arena, ghost, ghost.centre, h(11, 10), true).legal).toBe(true);
    expect(placement(arena, { ...ghost, size: 3 }, h(10, 10)).legal).toBe(false);
  });
  it('stops at last legal position without rerouting or swapping', () => {
    const arena = emptyArena(),
      mover = unit();
    arena.creatures = [mover, unit('blocker', h(12, 10))];
    expect(legalPathPrefix(arena, mover, [h(11, 10), h(12, 10), h(13, 10)], 3)).toEqual([h(11, 10)]);
    expect(stepLegality(arena, mover, mover.centre, h(12, 10))).toEqual({ legal: false, reason: 'NON_ADJACENT' });
    expect(legalPathPrefix(arena, mover, [h(11, 10)], 0)).toEqual([]);
  });
  it('lets Nimble transit allies and mindless creatures ignore illusion blockers', () => {
    const arena = emptyArena();
    arena.creatures = [unit('ally', h(11, 10))];
    const cat = unit('cat', h(10, 10), { nimble: true });
    expect(placement(arena, cat, h(11, 10), true).legal).toBe(true);
    expect(placement(arena, cat, h(11, 10)).legal).toBe(false);
    arena.creatures[0]!.controller = 'enemy';
    expect(placement(arena, cat, h(11, 10), true).legal).toBe(false);
    arena.creatures[0]!.illusion = true;
    expect(placement(arena, { ...cat, intelligence: 0 }, h(11, 10)).legal).toBe(true);
  });
  it('supports swarm overlap, same-height coverage and immediate size-dependent release', () => {
    const arena = emptyArena(),
      swarm = unit('swarm', h(10, 10), { size: 4, swarm: true });
    const target = unit('target', h(11, 10)),
      air = unit('air', h(10, 10), { height: 'air' });
    arena.creatures = [target, air];
    expect(placement(arena, swarm, swarm.centre).legal).toBe(true);
    expect(swarmCoveredTargets(swarm, arena.creatures)).toEqual(['target']);
    expect(swarmCoveredTargets({ ...swarm, size: 2 }, arena.creatures)).toEqual([]);
    arena.walls = [wall()];
    expect(placement(arena, swarm, swarm.centre).legal).toBe(false);
  });
  it('counts large area victims once and permits grounded-only selection', () => {
    const creatures = [unit('large', h(10, 10), { size: 6 }), unit('air', h(10, 10), { height: 'air' })];
    expect(affectedCreatures(disk(h(10, 10), 3), creatures)).toEqual(['air', 'large']);
    expect(affectedCreatures(disk(h(10, 10), 3), creatures, 'ground')).toEqual(['large']);
  });
  it('intercepts allies before targets, while creatures do not block sight', () => {
    const arena = emptyArena(),
      origin = unit();
    arena.creatures = [origin, unit('ally', h(11, 10)), unit('enemy', h(13, 10))];
    expect(traceProjectile(arena, origin, h(13, 10), 'ground', 'left').hit).toBe('ally');
    expect(clearSight(origin.centre, h(13, 10), 'left', arena.walls)).toBe(true);
    arena.walls = [wall('crystal')];
    expect(traceProjectile(arena, origin, h(13, 10), 'ground', 'left').blockedBy).toBe('wall');
  });
  it('starts at origin boundary and respects target height and rider selection', () => {
    const arena = emptyArena(),
      origin = unit('origin', h(10, 10), { size: 3, height: 'air' });
    arena.creatures = [
      origin,
      unit('ground', h(12, 10)),
      unit('mount', h(13, 10), { height: 'air' }),
      unit('rider', h(13, 10), { height: 'air', mountId: 'mount' }),
    ];
    const shot = traceProjectile(arena, origin, h(13, 10), 'air', 'left', 'rider');
    expect(shot.path[0]).toEqual(h(11, 10));
    expect(shot.hit).toBe('rider');
    expect(traceProjectile(arena, origin, h(13, 10), 'ground', 'left').hit).toBe('ground');
  });
  it('allows rider/mount sharing but not unrelated occupants', () => {
    const arena = emptyArena(),
      rider = unit('rider', h(10, 10), { mountId: 'mount' });
    arena.creatures = [unit('mount', rider.centre, { size: 3 })];
    expect(placement(arena, rider, rider.centre).legal).toBe(true);
    expect(placement(arena, unit('other'), rider.centre).legal).toBe(false);
    expect(affectedCreatures([h(11, 10)], [...arena.creatures, rider])).toEqual(['mount', 'rider']);
    expect(() => affectedCreatures([rider.centre], [rider])).toThrow('MISSING_MOUNT');
    expect(() => affectedCreatures([rider.centre], [rider, unit('mount', rider.centre, { mountId: 'rider' })])).toThrow(
      'CYCLIC_MOUNT',
    );
  });
  it('uses the mount height and transit traits when checking a rider path', () => {
    const arena = emptyArena(),
      rider = unit('rider', h(10, 10), { mountId: 'mount' });
    arena.creatures = [unit('mount', rider.centre, { height: 'air', size: 3 }), rider];
    arena.walls = [wall()];
    expect(stepLegality(arena, rider, rider.centre, h(11, 10), true).legal).toBe(true);
    arena.walls = [wall('energy')];
    expect(stepLegality(arena, rider, rider.centre, h(11, 10), true).legal).toBe(false);
  });
  it('finds deterministic nearest legal cells and reports no-space cases', () => {
    const arena = emptyArena(),
      mover = unit();
    arena.creatures = [unit('blocker')];
    expect(nearestLegal(arena, mover, mover.centre, 1)).toEqual(h(9, 10));
    expect(nearestLegal(arena, mover, mover.centre, 0)).toBeNull();
    expect(nearestLegal(JSON.parse(JSON.stringify(arena)), mover, mover.centre, 1)).toEqual(h(9, 10));
  });
});

describe('match starts', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])('places %i wizards evenly on the inset perimeter', count => {
    const perimeter = insetPerimeter(),
      result = startingPositions(count, 123);
    expect(new Set(perimeter.map(key)).size).toBe(100);
    expect(result).toEqual(startingPositions(count, 123));
    expect(result.positions).toHaveLength(count);
    expect(new Set(result.positions.map(key)).size).toBe(count);
    expect(result.positions.every(p => footprint(p, 2).every(c => inside(c, ARENA)))).toBe(true);
    const indices = result.positions.map(p => perimeter.findIndex(c => key(c) === key(p)));
    const gaps = indices.map((index, i) => (indices[(i + 1) % count]! - index + perimeter.length) % perimeter.length);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });
  it('rejects invalid player counts and too-small boards', () => {
    expect(() => startingPositions(1, 1)).toThrow();
    expect(() => startingPositions(9, 1)).toThrow();
    expect(() => startingPositions(8, 1, { columns: 5, rows: 5 })).toThrow();
  });
});
