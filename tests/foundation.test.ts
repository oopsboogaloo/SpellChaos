import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createMatch, applyCommand } from '../packages/engine/src/index.js';
import { nextRandom, randomBelow } from '../packages/engine/src/random.js';
import { canonical, encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { projectView } from '../packages/views/src/index.js';
import { ManualClock, deadlineReached } from '../packages/engine/src/clock.js';

const fresh = () => createMatch('match', ['human', 'ai'], 1);
const lock = (playerId = 'human', expectedRevision = 0, commandId = 'c1') => ({
  matchId: 'match',
  playerId,
  expectedRevision,
  commandId,
  turn: 1,
  type: 'LockTurn',
});
describe('portable foundation', () => {
  it('matches published xorshift32 seed-1 vectors', () => {
    let state = 1;
    const values = Array.from({ length: 5 }, () => {
      state = nextRandom(state).state;
      return state;
    });
    expect(values).toEqual([270369, 67634689, 2647435461, 307599695, 2398689233]);
  });
  it('rejects invalid random states and bounds', () => {
    for (const s of [0, -1, NaN, 0.5, 2 ** 32]) expect(() => nextRandom(s)).toThrow();
    for (const b of [0, -1, NaN, 1.5, 2 ** 32]) expect(() => randomBelow(1, b)).toThrow();
  });
  it('bounds draws and reproduces them from serialized state', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 0xffffffff }), fc.integer({ min: 1, max: 10000 }), (seed, bound) => {
        const a = randomBelow(seed, bound);
        expect(a.value).toBeGreaterThanOrEqual(0);
        expect(a.value).toBeLessThan(bound);
        expect(randomBelow(JSON.parse(JSON.stringify(seed)), bound)).toEqual(a);
      }),
      { seed: 12345, numRuns: 1000 },
    );
  });
  it('roundtrips and continues identically at each current command boundary', () => {
    let uninterrupted = fresh();
    for (const command of [lock(), lock('ai', 1, 'c2')]) {
      const restored = restoreSnapshot(encodeSnapshot(uninterrupted));
      const expected = applyCommand(uninterrupted, command);
      expect(applyCommand(restored, command)).toEqual(expected);
      uninterrupted = expected.state;
    }
    expect(uninterrupted.phase).toBe('ready');
    expect(restoreSnapshot(encodeSnapshot(uninterrupted))).toEqual(uninterrupted);
  });
  it('does not mutate original and deduplicates identical accepted commands', () => {
    const original = fresh();
    const first = applyCommand(original, lock());
    expect(original.revision).toBe(0);
    expect(applyCommand(first.state, lock())).toEqual({ state: first.state, events: [], acknowledgedRevision: 1 });
    expect(() => applyCommand(first.state, lock('ai'))).toThrow('COMMAND_ID_CONFLICT');
  });
  it('rejects invalid commands without changing state', () => {
    const state = fresh();
    const before = encodeSnapshot(state);
    for (const command of [
      null,
      {},
      { ...lock(), matchId: 'wrong' },
      { ...lock(), turn: 2 },
      lock('missing'),
      lock('human', 2),
    ]) {
      expect(() => applyCommand(state, command)).toThrow();
      expect(encodeSnapshot(state)).toBe(before);
    }
    const locked = applyCommand(state, lock()).state;
    expect(() => applyCommand(locked, lock('human', 1, 'c3'))).toThrow('ORDERS_LOCKED');
  });
  it('rejects unsupported versions, broken references and inconsistent histories', () => {
    const state = fresh();
    for (const candidate of [
      { ...state, schemaVersion: 999 },
      { ...state, rulesVersion: 'other' },
      { ...state, players: [state.players[0], state.players[0]] },
      { ...state, phase: 'ready' },
      { ...state, revision: 2 },
      { ...state, extra: true },
      { ...state, random: { ...state.random, resolution: 0 } },
    ])
      expect(() => restoreSnapshot(JSON.stringify(candidate))).toThrow('INVALID_OR_UNSUPPORTED_SNAPSHOT');
    expect(() => restoreSnapshot('{')).toThrow();
  });
  it('validates stored command references and locks', () => {
    const state = applyCommand(fresh(), lock()).state;
    const bad = structuredClone(state);
    bad.accepted[0]!.command.playerId = 'missing';
    expect(() => restoreSnapshot(JSON.stringify(bad))).toThrow();
    const inconsistent = structuredClone(state);
    inconsistent.players[0]!.locked = false;
    expect(() => restoreSnapshot(JSON.stringify(inconsistent))).toThrow();
  });
  it('canonicalizes key order and rejects nonportable data', () => {
    expect(canonical({ b: [true, null], a: 1 })).toBe(canonical({ a: 1, b: [true, null] }));
    for (const value of [undefined, Infinity, new Map(), () => 1]) expect(() => canonical(value)).toThrow();
  });
  it('filters RNG/history and never aliases authoritative state', () => {
    const state = fresh();
    const view = projectView(state, 'human');
    const other = structuredClone(state);
    other.random.ai = 42;
    expect(projectView(other, 'human')).toEqual(view);
    expect(view).not.toHaveProperty('random');
    expect(view).not.toHaveProperty('accepted');
    view.players[0]!.locked = true;
    expect(state.players[0]!.locked).toBe(false);
    expect(() => projectView(state, 'missing')).toThrow();
  });
  it('uses injected clock and respects disabled/exact deadlines', () => {
    const clock = new ManualClock();
    expect(deadlineReached(clock, null)).toBe(false);
    expect(deadlineReached(clock, 10)).toBe(false);
    clock.advance(10);
    expect(deadlineReached(clock, 10)).toBe(true);
    expect(() => clock.advance(-1)).toThrow();
  });
});
