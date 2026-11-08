/** xorshift32 generator: state is explicit, nonzero uint32; no ambient randomness. Stream seeding is versioned as xorshift32-v2. */
export function nextRandom(state: number): { state: number; value: number } {
  if (!Number.isInteger(state) || state <= 0 || state > 0xffffffff) throw new Error('INVALID_RNG_STATE');
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return { state: x >>> 0, value: x >>> 0 };
}

/** Stream constants: each named stream starts from a different mixed image of the match seed. */
export const STREAM_KEYS = { setup: 0x5e7a9b01, resolution: 0x2c1f4d63, ai: 0x7a3b9e17 } as const;
/**
 * xorshift32-v2 stream derivation: murmur3 fmix32 of (seed XOR key). fmix32 is a bijection, so the
 * three starting states are distinct for any seed and land far apart on the generator's single
 * 2^32-1 cycle, instead of v1's consecutive states (resolution = setup + 1 draw, ai = + 2 draws).
 */
export function streamSeed(seed: number, stream: keyof typeof STREAM_KEYS): number {
  if (!Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) throw new Error('INVALID_RNG_STATE');
  let h = (seed ^ STREAM_KEYS[stream]) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  h >>>= 0;
  return h === 0 ? 0x9e3779b9 : h;
}

/** Rejection sampling over the generator's 1..2^32-1 output domain. */
export function randomBelow(state: number, bound: number): { state: number; value: number } {
  if (!Number.isInteger(bound) || bound < 1 || bound > 0xffffffff) throw new Error('INVALID_RANDOM_BOUND');
  const limit = Math.floor(0xffffffff / bound) * bound;
  for (;;) {
    const next = nextRandom(state);
    state = next.state;
    const zeroBased = next.value - 1;
    if (zeroBased < limit) return { state, value: zeroBased % bound };
  }
}
