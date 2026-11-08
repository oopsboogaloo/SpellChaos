import { expect, it } from 'vitest';
import { nextRandom, streamSeed } from '../packages/domain/src/random.js';
import { createMatch } from '../packages/engine/src/index.js';

// #24: setup, resolution and AI streams must not be the same sequence offset by a draw or two.
function draws(state: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const r = nextRandom(state); state = r.state; out.push(r.value); }
  return out;
}

it('named streams are distinct and do not overlap within their first 10,000 draws', () => {
  for (const seed of [1, 2, 123, 12345, 999999, 0xffffffff]) {
    const streams = (['setup', 'resolution', 'ai'] as const).map(k => new Set(draws(streamSeed(seed, k), 10000)));
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
      const overlap = [...streams[a]!].filter(v => streams[b]!.has(v)).length;
      expect(overlap, `seed ${seed} streams ${a}/${b}`).toBe(0);
    }
  }
});

it('a new match no longer derives one stream by stepping another', () => {
  for (const seed of [1, 123, 999999]) {
    const s = createMatch('rng', ['a', 'b'], seed);
    expect(nextRandom(s.random.resolution).state).not.toBe(s.random.ai);
    expect(s.random.ai).toBe(streamSeed(seed, 'ai'));
    expect(s.random.resolution).toBe(streamSeed(seed, 'resolution'));
    expect(s.rngVersion).toBe('xorshift32-v2');
  }
});

it('stream seeds reject invalid seeds like the generator does', () => {
  for (const bad of [0, -1, 1.5, 0x100000000]) expect(() => streamSeed(bad, 'setup')).toThrow('INVALID_RNG_STATE');
});
