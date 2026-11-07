import { ARENA, add, compareHex, distance, equal, footprint, inside, key, nearestPair, overlap, type Board, type Hex } from './hex.js';
import { traceRay, type RaySide } from './ray.js';
import { blocksMovement, edge, edgeKey, solid, straddles, type Wall } from './walls.js';

export interface Occupant {
  id: string; centre: Hex; size: number; controller: string | null;
  height: 'ground' | 'air'; intelligence: number;
  swarm?: boolean; passCreatures?: boolean | undefined; incorporeal?: boolean; illusion?: boolean; nimble?: boolean;
  mountId?: string | undefined;
}
export interface ArenaGeometry { board: Board; creatures: Occupant[]; walls: Wall[] }
export type Legality = { legal: true } | { legal: false; reason: 'BOUNDARY' | 'WALL' | 'CREATURE' | 'NON_ADJACENT' };
const ok: Legality = { legal: true };

function physicalBody(creature: Occupant, creatures: readonly Occupant[]): Occupant {
  const visited = new Set<string>();
  let body = creature;
  while (body.mountId) {
    if (visited.has(body.id)) throw new Error('CYCLIC_MOUNT');
    visited.add(body.id);
    const mount = creatures.find(c => c.id === body.mountId);
    if (!mount) throw new Error('MISSING_MOUNT');
    body = mount;
  }
  return body;
}
export function occupiedFootprint(creature: Occupant, creatures: readonly Occupant[]): Hex[] {
  const body = physicalBody(creature, creatures);
  return footprint(body.centre, body.size);
}

/** Validate new construction against all occupied footprints; boundary edges may have one off-board endpoint. */
export function legalWallPlacement(arena: ArenaGeometry, wall: Wall): boolean {
  const id = edgeKey(wall.edge);
  if (!inside(wall.edge.a, arena.board) && !inside(wall.edge.b, arena.board)) return false;
  if (arena.walls.some(w => edgeKey(w.edge) === id)) return false;
  return !solid(wall.material) || !arena.creatures.some(c => straddles(occupiedFootprint(c, arena.creatures), wall));
}

export function placement(arena: ArenaGeometry, mover: Occupant, centre: Hex, transit = false): Legality {
  const body = physicalBody(mover, arena.creatures);
  const cells = footprint(centre, body.size);
  if (cells.some(h => !inside(h, arena.board))) return { legal: false, reason: 'BOUNDARY' };
  // Even a passing incorporeal creature cannot finish straddling a solid wall.
  if (arena.walls.some(w => straddles(cells, w) && (transit ? blocksMovement(w, body.height === 'air', !!body.incorporeal) :
    w.material === 'energy' || (solid(w.material) && body.height !== 'air')))) return { legal: false, reason: 'WALL' };
  for (const other of arena.creatures) {
    if (physicalBody(other, arena.creatures).id === body.id || body.swarm || other.swarm ||
        (other.illusion && body.intelligence === 0)) continue;
    if (transit && (body.height === 'air' || body.incorporeal || body.passCreatures ||
      (body.nimble && body.controller !== null && body.controller === other.controller))) continue;
    if (overlap(cells, occupiedFootprint(other, arena.creatures))) return { legal: false, reason: 'CREATURE' };
  }
  return ok;
}

export function stepLegality(arena: ArenaGeometry, mover: Occupant, from: Hex, to: Hex, transit = false): Legality {
  if (distance(from, to) !== 1) return { legal: false, reason: 'NON_ADJACENT' };
  const destination = placement(arena, mover, to, transit);
  if (!destination.legal) return destination;
  const delta = { q: to.q - from.q, r: to.r - from.r };
  const body = physicalBody(mover, arena.creatures);
  const crossing = new Set(footprint(from, body.size).map(h => edgeKey(edge(h, add(h, delta)))));
  if (arena.walls.some(w => crossing.has(edgeKey(w.edge)) && blocksMovement(w, body.height === 'air', !!body.incorporeal))) return { legal: false, reason: 'WALL' };
  return ok;
}

/** Static path preview. Reaction-aware execution will revalidate each step in the phase resolver. */
export function legalPathPrefix(arena: ArenaGeometry, mover: Occupant, path: readonly Hex[], allowance: number): Hex[] {
  if (!Number.isInteger(allowance) || allowance < 0) throw new Error('INVALID_ALLOWANCE');
  const prefix: Hex[] = [];
  let from = mover.centre, restingLength = 0;
  for (const to of path.slice(0, allowance)) {
    if (!stepLegality(arena, mover, from, to, true).legal) break;
    prefix.push({ ...to });
    if (placement(arena, mover, to).legal) restingLength = prefix.length;
    from = to;
  }
  return prefix.slice(0, restingLength);
}

export function affectedCreatures(area: readonly Hex[], creatures: readonly Occupant[], height?: Occupant['height']): string[] {
  return [...new Set(creatures.filter(c => (!height || height === physicalBody(c, creatures).height) && overlap(area, occupiedFootprint(c, creatures))).map(c => c.id))].sort();
}

export function swarmCoveredTargets(swarm: Occupant, creatures: readonly Occupant[]): string[] {
  if (!swarm.swarm) return [];
  const cells = footprint(swarm.centre, swarm.size);
  return creatures.filter(c => c.id !== swarm.id && physicalBody(c, creatures).height === swarm.height && c.size < swarm.size && overlap(cells, occupiedFootprint(c, creatures))).map(c => c.id).sort();
}

export interface ProjectileTrace { path: Hex[]; hit: string | null; blockedBy: string | null }
export function traceProjectile(arena: ArenaGeometry, origin: Occupant, aim: Hex, targetHeight: Occupant['height'], side: RaySide, selectedTargetId?: string): ProjectileTrace {
  const originCells = occupiedFootprint(origin, arena.creatures);
  const start = nearestPair(originCells, [aim]).from;
  const path = traceRay(start, aim, side);
  const own = new Set(originCells.map(key));
  for (let i = 0; i < path.length; i++) {
    const cell = path[i]!;
    if (i > 0) {
      const crossed = edgeKey(edge(path[i - 1]!, cell));
      const wall = arena.walls.find(w => edgeKey(w.edge) === crossed && solid(w.material));
      if (wall) return { path: path.slice(0, i), hit: null, blockedBy: wall.id };
    }
    if (own.has(key(cell))) continue;
    // Preserve explicit rider/mount choice at the first interception hex; other ties use stable IDs.
    const intercepted = arena.creatures.filter(c => c.id !== origin.id && physicalBody(c, arena.creatures).height === targetHeight && occupiedFootprint(c, arena.creatures).some(h => equal(h, cell)))
      .sort((a, b) => (a.id === selectedTargetId ? -1 : b.id === selectedTargetId ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    if (intercepted) return { path: path.slice(0, i + 1), hit: intercepted.id, blockedBy: null };
  }
  return { path, hit: null, blockedBy: null };
}

export function nearestLegal(arena: ArenaGeometry, mover: Occupant, around: Hex, maxRange = Infinity): Hex | null {
  const candidates: Hex[] = [];
  for (let row = 0; row < arena.board.rows; row++) for (let column = 0; column < arena.board.columns; column++) {
    const cell = { q: column - Math.floor(row / 2), r: row };
    if (distance(around, cell) <= maxRange && placement(arena, mover, cell).legal) candidates.push(cell);
  }
  candidates.sort((a, b) => distance(a, around) - distance(b, around) || compareHex(a, b));
  return candidates[0] ?? null;
}
export function emptyArena(): ArenaGeometry { return { board: { ...ARENA }, creatures: [], walls: [] }; }

/** A penetrating bolt keeps the chosen ray to maximum range. A second body must
 * lie beyond the first footprint; overlapping bodies do not consume another hit. */
export function tracePenetratingProjectile(arena:ArenaGeometry,origin:Occupant,aim:Hex,targetHeight:Occupant['height'],side:RaySide,range:number,selectedTargetId?:string):{path:Hex[];hits:string[];blockedBy:string|null} {
 const ownCells=occupiedFootprint(origin,arena.creatures),start=nearestPair(ownCells,[aim]).from;
 const length=distance(start,aim);
 if(length===0)return {path:[],hits:[],blockedBy:null};
 const factor=Math.ceil(range/length),end={q:start.q+(aim.q-start.q)*factor,r:start.r+(aim.r-start.r)*factor};
 const ray=traceRay(start,end,side),own=new Set(ownCells.map(key)),hits:string[]=[],path:Hex[]=[];
 let firstCells:Set<string>|null=null;
 for(let i=0;i<ray.length;i++){
  const cell=ray[i]!;if(distance(start,cell)>range||!inside(cell,arena.board))break;
  if(i>0){const crossed=edgeKey(edge(ray[i-1]!,cell)),wall=arena.walls.find(w=>edgeKey(w.edge)===crossed&&solid(w.material));if(wall)return {path,hits,blockedBy:wall.id};}
  path.push(cell);
  if(own.has(key(cell))||firstCells?.has(key(cell)))continue;
  const body=arena.creatures.filter(c=>c.id!==origin.id&&!hits.includes(c.id)&&physicalBody(c,arena.creatures).height===targetHeight&&occupiedFootprint(c,arena.creatures).some(h=>equal(h,cell)))
   .sort((a,b)=>(a.id===selectedTargetId?-1:b.id===selectedTargetId?1:a.id<b.id?-1:1))[0];
  if(!body)continue;
  hits.push(body.id);if(hits.length===2)break;
  firstCells=new Set(occupiedFootprint(body,arena.creatures).map(key));
 }
 return {path,hits,blockedBy:null};
}
