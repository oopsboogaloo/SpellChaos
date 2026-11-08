import { assertHex, compareHex, distance, equal, type Hex } from './hex.js';
export type RaySide = 'left' | 'right';
interface Fraction {
  n: bigint;
  d: bigint;
}
const fraction = (n: bigint, d: bigint): Fraction => (d < 0n ? { n: -n, d: -d } : { n, d });
const cmp = (a: Fraction, b: Fraction): number => {
  const d = a.n * b.d - b.n * a.d;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};
/** Exact Voronoi-cell clipping. BigInts are transient calculation only, never authoritative state. */
export function traceRay(from: Hex, to: Hex, side: RaySide): Hex[] {
  assertHex(from);
  assertHex(to);
  if (side !== 'left' && side !== 'right') throw new Error('INVALID_RAY_SIDE');
  if (distance(from, to) > 200) throw new Error('RAY_TOO_LONG');
  if (equal(from, to)) return [{ ...from }];
  const dq = to.q - from.q,
    dr = to.r - from.r;
  const hits: { cell: Hex; enter: Fraction; exit: Fraction; cross: number }[] = [];
  const normals = [
    [2, 1],
    [1, 2],
    [-1, 1],
    [-2, -1],
    [-1, -2],
    [1, -1],
  ] as const;
  for (let q = Math.min(from.q, to.q) - 1; q <= Math.max(from.q, to.q) + 1; q++) {
    for (let r = Math.min(from.r, to.r) - 1; r <= Math.max(from.r, to.r) + 1; r++) {
      let enter: Fraction = { n: 0n, d: 1n },
        exit: Fraction = { n: 1n, d: 1n };
      let valid = true;
      for (const [a, b] of normals) {
        const start = a * (from.q - q) + b * (from.r - r);
        const slope = a * dq + b * dr;
        if (slope === 0) {
          if (start > 1) {
            valid = false;
            break;
          }
          continue;
        }
        const t = fraction(BigInt(1 - start), BigInt(slope));
        if (slope > 0 && cmp(t, exit) < 0) exit = t;
        if (slope < 0 && cmp(t, enter) > 0) enter = t;
      }
      if (valid && cmp(enter, exit) < 0)
        hits.push({ cell: { q, r }, enter, exit, cross: dq * (r - from.r) - dr * (q - from.q) });
    }
  }
  hits.sort(
    (a, b) =>
      cmp(a.enter, b.enter) ||
      cmp(a.exit, b.exit) ||
      (side === 'left' ? b.cross - a.cross : a.cross - b.cross) ||
      compareHex(a.cell, b.cell),
  );
  // Collinear boundary contacts have identical time intervals; choose exactly one side.
  const chosen = hits.filter(
    (hit, i) => i === 0 || cmp(hit.enter, hits[i - 1]!.enter) !== 0 || cmp(hit.exit, hits[i - 1]!.exit) !== 0,
  );
  return chosen.map(h => h.cell);
}
