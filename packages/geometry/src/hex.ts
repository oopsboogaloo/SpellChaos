export interface Hex {
  q: number;
  r: number;
}
export interface Offset {
  column: number;
  row: number;
}
export interface Board {
  columns: number;
  rows: number;
}
export const ARENA: Board = { columns: 30, rows: 30 };
/** Clockwise in screen coordinates; no creature-facing state. */
export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];
export function assertHex(h: Hex): void {
  if (!Number.isSafeInteger(h.q) || !Number.isSafeInteger(h.r) || Math.abs(h.q) > 100000 || Math.abs(h.r) > 100000)
    throw new Error('INVALID_HEX');
}
export function assertBoard(board: Board): void {
  if (![board.columns, board.rows].every(n => Number.isInteger(n) && n > 0 && n <= 1000))
    throw new Error('INVALID_BOARD');
}
export function key(h: Hex): string {
  return `${h.q},${h.r}`;
}
export function compareHex(a: Hex, b: Hex): number {
  return a.q - b.q || a.r - b.r;
}
export function equal(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}
export function add(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}
export function fromOffset({ column, row }: Offset): Hex {
  if (!Number.isSafeInteger(column) || !Number.isSafeInteger(row)) throw new Error('INVALID_OFFSET');
  return { q: column - Math.floor(row / 2), r: row };
}
export function toOffset(h: Hex): Offset {
  assertHex(h);
  return { column: h.q + Math.floor(h.r / 2), row: h.r };
}
export function distance(a: Hex, b: Hex): number {
  assertHex(a);
  assertHex(b);
  const q = a.q - b.q,
    r = a.r - b.r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}
export function neighbours(h: Hex): Hex[] {
  return DIRECTIONS.map(d => add(h, d));
}
export function inside(h: Hex, board: Board = ARENA): boolean {
  assertBoard(board);
  const { column, row } = toOffset(h);
  return column >= 0 && row >= 0 && column < board.columns && row < board.rows;
}
export function disk(centre: Hex, radius: number): Hex[] {
  assertHex(centre);
  if (!Number.isInteger(radius) || radius < 0 || radius > 100) throw new Error('INVALID_RADIUS');
  const result: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++)
      result.push(add(centre, { q, r }));
  }
  return result;
}
export function footprint(centre: Hex, size: number): Hex[] {
  if (!Number.isInteger(size) || size < 1 || size > 10) throw new Error('INVALID_SIZE');
  return disk(centre, Math.floor((size - 1) / 2));
}
/** Every minimum-distance cell pair, in the same canonical order nearestPair uses (its first element). */
export function nearestPairs(a: readonly Hex[], b: readonly Hex[]): { from: Hex; to: Hex; distance: number }[] {
  if (!a.length || !b.length) throw new Error('EMPTY_FOOTPRINT');
  let min = Infinity;
  const pairs: { from: Hex; to: Hex; distance: number }[] = [];
  for (const from of a)
    for (const to of b) {
      const d = distance(from, to);
      if (d < min) {
        min = d;
        pairs.length = 0;
      }
      if (d === min) pairs.push({ from, to, distance: d });
    }
  return pairs.sort((x, y) => compareHex(x.from, y.from) || compareHex(x.to, y.to));
}
export function nearestPair(a: readonly Hex[], b: readonly Hex[]): { from: Hex; to: Hex; distance: number } {
  if (!a.length || !b.length) throw new Error('EMPTY_FOOTPRINT');
  let best = { from: a[0]!, to: b[0]!, distance: Infinity };
  for (const from of a)
    for (const to of b) {
      const d = distance(from, to);
      if (
        d < best.distance ||
        (d === best.distance &&
          (compareHex(from, best.from) < 0 || (equal(from, best.from) && compareHex(to, best.to) < 0)))
      )
        best = { from, to, distance: d };
    }
  return best;
}
export function overlap(a: readonly Hex[], b: readonly Hex[]): boolean {
  const cells = new Set(a.map(key));
  return b.some(h => cells.has(key(h)));
}
/** Nearest of six 60-degree sectors by integer dot product. Boundary ties use lower direction index. */
export function sector(centre: Hex, other: Hex): number {
  if (equal(centre, other)) throw new Error('UNDEFINED_SECTOR');
  const q = other.q - centre.q,
    r = other.r - centre.r;
  const scores = DIRECTIONS.map(d => 2 * q * d.q + q * d.r + r * d.q + 2 * r * d.r);
  return scores.indexOf(Math.max(...scores));
}
/** All sectors tied for nearest direction (two on an exact boundary). */
function sectors(centre: Hex, other: Hex): number[] {
  if (equal(centre, other)) throw new Error('UNDEFINED_SECTOR');
  const q = other.q - centre.q,
    r = other.r - centre.r;
  const scores = DIRECTIONS.map(d => 2 * q * d.q + q * d.r + r * d.q + 2 * r * d.r),
    best = Math.max(...scores);
  return scores.flatMap((score, i) => (score === best ? [i] : []));
}
/** Symmetric: boundary positions count for both neighbouring sectors, so exact opposites always qualify (#21). */
export function oppositeSectors(centre: Hex, a: Hex, b: Hex): boolean {
  const sb = sectors(centre, b);
  return sectors(centre, a).some(i => sb.includes((i + 3) % 6));
}
/** Rendering conversion only. Adjacent centre separation is one metre. */
export function worldPoint(h: Hex): { x: number; y: number } {
  return { x: h.q + h.r / 2, y: (h.r * Math.sqrt(3)) / 2 };
}
