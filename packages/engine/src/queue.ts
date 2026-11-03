import type { PhaseEntry } from '../../domain/src/state.js';
import { randomBelow } from '../../domain/src/random.js';
export type Candidate = Omit<PhaseEntry, 'tie'>;
const bucket = (e: Candidate) => e.quick ? 2 : e.slowed ? 1 : 0;
export function compareEntries(a: PhaseEntry, b: PhaseEntry, movement: boolean): number {
  return bucket(a) - bucket(b) || (movement ? b.move - a.move || b.size - a.size : b.dex - a.dex || a.size - b.size) ||
    a.wizardDistance - b.wizardDistance || a.tie - b.tie;
}
/** Unique randomized ranks avoid biased stable-ID fallback on colliding random keys. */
export function buildQueue(candidates: readonly Candidate[], seed: number, movement: boolean): { entries: PhaseEntry[]; randomState: number } {
  const ordered = [...candidates].sort((a,b) => a.creatureId < b.creatureId ? -1 : a.creatureId > b.creatureId ? 1 : 0);
  const ranks = ordered.map((_, i) => i);
  let randomState = seed;
  for (let i = ranks.length - 1; i > 0; i--) {
    const draw = randomBelow(randomState, i + 1); randomState = draw.state;
    [ranks[i], ranks[draw.value]] = [ranks[draw.value]!, ranks[i]!];
  }
  const entries = ordered.map((e, i) => ({ ...e, tie: ranks[i]! }));
  entries.sort((a,b) => compareEntries(a,b,movement));
  return { entries, randomState };
}
