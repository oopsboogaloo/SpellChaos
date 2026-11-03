/** xorshift32-v1: state is explicit, nonzero uint32; no ambient randomness. */
export function nextRandom(state: number): { state: number; value: number } {
  if (!Number.isInteger(state) || state <= 0 || state > 0xffffffff) throw new Error('INVALID_RNG_STATE');
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return { state: x >>> 0, value: x >>> 0 };
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
