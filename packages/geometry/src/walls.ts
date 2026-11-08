import { compareHex, distance, equal, key, type Hex } from './hex.js';
import { traceRay, type RaySide } from './ray.js';
export type Material = 'wood' | 'stone' | 'iron' | 'crystal' | 'thorns' | 'fire' | 'energy' | 'death';
export interface Edge {
  a: Hex;
  b: Hex;
}
export interface Wall {
  id: string;
  edge: Edge;
  material: Material;
}
export function edge(a: Hex, b: Hex): Edge {
  if (distance(a, b) !== 1) throw new Error('NON_ADJACENT_EDGE');
  return compareHex(a, b) < 0 ? { a: { ...a }, b: { ...b } } : { a: { ...b }, b: { ...a } };
}
export function edgeKey(e: Edge): string {
  const ordered = edge(e.a, e.b);
  return key(ordered.a) + '|' + key(ordered.b);
}
export function solid(material: Material): boolean {
  return !['thorns', 'fire', 'death'].includes(material);
}
export function blocksMovement(wall: Wall, airborne: boolean, incorporeal: boolean): boolean {
  return wall.material === 'energy' || (solid(wall.material) && !airborne && !incorporeal);
}
export function straddles(cells: readonly Hex[], wall: Wall): boolean {
  return cells.some(c => equal(c, wall.edge.a)) && cells.some(c => equal(c, wall.edge.b));
}
export function crossedWalls(path: readonly Hex[], walls: readonly Wall[]): Wall[] {
  const crossed = new Set<string>();
  for (let i = 1; i < path.length; i++) crossed.add(edgeKey(edge(path[i - 1]!, path[i]!)));
  return walls.filter(w => crossed.has(edgeKey(w.edge)));
}
export function clearSight(from: Hex, to: Hex, side: RaySide, walls: readonly Wall[]): boolean {
  return !crossedWalls(traceRay(from, to, side), walls).some(w => solid(w.material) && w.material !== 'crystal');
}
export function clearProjectile(from: Hex, to: Hex, side: RaySide, walls: readonly Wall[], arcing = false): boolean {
  return !crossedWalls(traceRay(from, to, side), walls).some(
    w => solid(w.material) && (!arcing || w.material === 'energy'),
  );
}
