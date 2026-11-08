import { expect, it } from 'vitest';
import { createCreature, createMatch } from '../packages/engine/src/index.js';
import { encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { stateSchema, type GameState } from '../packages/domain/src/state.js';

// #23: a decoded snapshot must be physically and internally consistent before it may replace a match.
function base(): GameState {
  const s = createMatch('integrity', ['a', 'b'], 1);
  s.creatures.push(
    createCreature('big', 'a', { q: 12, r: 12 }, { size: 3, con: 6 }),
    createCreature('small', 'b', { q: 16, r: 12 }),
    createCreature('flyer', 'b', { q: 12, r: 12 }, { height: 'air' }),
  );
  s.damageLedger.push({
    sequence: 4,
    targetId: 'small',
    sourceId: 'big',
    actionId: null,
    illusionId: null,
    components: [{ type: 'physical', amount: 1 }],
    amount: 1,
    remaining: 1,
  });
  s.nextEntityId = 5;
  return s;
}
const raw = (): GameState => JSON.parse(encodeSnapshot(base()));
const by = (s: GameState, id: string) => s.creatures.find(c => c.id === id)!;
// restoreSnapshot reports one opaque error (#29), so the specific rule is read from the validator.
const refused = (s: GameState, code: string) => {
  expect(() => restoreSnapshot(JSON.stringify(s))).toThrow();
  expect(stateSchema.safeParse(s).error?.issues.map(i => i.message)).toContain(code);
};

it('the baseline, including a flyer resting above a ground creature, is valid', () => {
  expect(restoreSnapshot(encodeSnapshot(base()))).toEqual(base());
});

it('two ground bodies on the same hexes are refused', () => {
  const s = raw();
  by(s, 'small').centre = { q: 12, r: 12 };
  refused(s, 'ILLEGAL_PLACEMENT');
});

it('a footprint partly off the board is refused', () => {
  const s = raw();
  Object.assign(by(s, 'big'), { centre: { q: 0, r: 0 } });
  refused(s, 'ILLEGAL_PLACEMENT');
});

it('a solid wall bisecting a grounded footprint is refused', () => {
  const s = raw();
  s.walls.push({
    id: 'cut',
    edge: { a: { q: 12, r: 12 }, b: { q: 13, r: 12 } },
    material: 'stone',
    hp: 8,
    maxHp: 8,
    burning: null,
  } as GameState['walls'][number]);
  refused(s, 'ILLEGAL_PLACEMENT');
});

it('maximum HP that does not equal Con × Size is refused', () => {
  const s = raw();
  by(s, 'small').maxHp += 50;
  refused(s, 'INVALID_MAX_HP');
});

it('an entity counter that would reissue an existing sequence is refused', () => {
  const s = raw();
  s.nextEntityId = 0;
  refused(s, 'STALE_ENTITY_COUNTER');
});
