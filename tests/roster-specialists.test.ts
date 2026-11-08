import { reverseIllusion } from '../packages/engine/src/illusions.js';
import { advanceAtomicStep } from '../packages/engine/src/resolver.js';
import { expect, it } from 'vitest';
import { createMatch, createCreature, applyCommand } from '../packages/engine/src/index.js';
import { summonProfile } from '../packages/content/src/summons.js';
import { startScenarioTurn } from '../packages/scenario/src/casting.js';
import { beginAttack, stepAttack } from '../packages/engine/src/combat.js';
import { applyDamage } from '../packages/engine/src/damage.js';
import { recover, cleanupDeaths, ongoingDamage } from '../packages/engine/src/lifecycle.js';
import { encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { reanimatedProfile } from '../packages/engine/src/reanimation.js';
function setup() {
  const s = createMatch('specialists', ['a', 'b'], 777);
  s.creatures[0]!.centre = { q: 2, r: 2 };
  s.creatures[1]!.centre = { q: 20, r: 15 };
  return s;
}
it('Hydra resolves three bites as one action, wasting invalid subtargets without replacement', () => {
  let s = setup();
  const hydra = createCreature('hydra', 'a', { q: 10, r: 10 }, summonProfile('Summon Serpent', 7)!);
  hydra.attacks[0]!.shots.forEach(shot => (shot.crit = 0));
  const near = createCreature('near', 'b', { q: 13, r: 10 }, { incapacitated: true }),
    far = createCreature('far', 'b', { q: 18, r: 10 });
  s.creatures.push(hydra, near, far);
  s = applyCommand(s, {
    type: 'SetOrder',
    matchId: s.matchId,
    playerId: 'a',
    turn: s.turn,
    commandId: 'hydra-bites',
    expectedRevision: s.revision,
    order: {
      creatureId: hydra.id,
      path: [],
      early: { type: 'Attack', attackId: 'basic', targetIds: ['near', 'far', 'near'], ground: null, side: 'left' },
      late: null,
    },
  }).state;
  s = startScenarioTurn(s);
  for (let n = 0; !s.pendingAttack; n++) {
    if (n > 100) throw new Error('NO_ATTACK');
    s = advanceAtomicStep(s).state;
  }
  let restored = restoreSnapshot(encodeSnapshot(s));
  while (s.pendingAttack) {
    stepAttack(s, []);
    restored = restoreSnapshot(encodeSnapshot(restored));
    stepAttack(restored, []);
    expect(encodeSnapshot(restored)).toBe(encodeSnapshot(s));
  }
  expect(s.creatures.find(c => c.id === 'near')!.hp).toBe(4);
  expect(s.creatures.find(c => c.id === 'far')!.hp).toBe(10);
});
it.each(['fire', 'acid'] as const)('Hydra vulnerability and %s suppress regeneration for only that turn', type => {
  const s = setup(),
    hydra = createCreature('hydra', 'a', { q: 10, r: 10 }, summonProfile('Summon Serpent', 7)!);
  s.creatures.push(hydra);
  applyDamage(s, hydra, [{ type, amount: 2 }], []);
  expect(hydra.hp).toBe(32);
  recover(s, []);
  expect(hydra.hp).toBe(32);
  s.turn++;
  recover(s, []);
  expect(hydra.hp).toBe(35);
});
it('Hydra can regenerate from incapacitation but never from death; reanimation removes regeneration', () => {
  const s = setup(),
    hydra = createCreature('hydra', 'a', { q: 10, r: 10 }, summonProfile('Summon Serpent', 7)!);
  s.creatures.push(hydra);
  hydra.hp = 0;
  recover(s, []);
  expect(hydra.hp).toBe(3);
  expect(createCreature('zombie', 'a', { q: 10, r: 10 }, reanimatedProfile(hydra, false)).regeneration).toBe(0);
  hydra.hp = -35;
  cleanupDeaths(s, []);
  recover(s, []);
  expect(hydra.hp).toBe(-35);
  expect(hydra.alive).toBe(false);
});
it.each([false, true])(
  'sabre-toothed tiger applies persistent Bleeding with correct illusion provenance (%s)',
  illusion => {
    let s = setup();
    const tiger = createCreature('tiger', 'a', { q: 10, r: 10 }, summonProfile('Summon Cat', 4)!);
    if (illusion) {
      tiger.kind = 'illusion';
      tiger.creatorId = 'wizard-0';
      tiger.knownIllusionBy = ['a'];
    }
    const victim = createCreature('victim', 'b', { q: 12, r: 10 }, { incapacitated: true });
    s.creatures.push(tiger, victim);
    s = startScenarioTurn(s);
    s.random.resolution = 4; // Crit roll 75; secondary roll 39 succeeds against Con 5.
    beginAttack(
      s,
      tiger,
      { type: 'Attack', attackId: 'basic', targetIds: [victim.id], ground: null, side: 'left' },
      'guard',
    );
    stepAttack(s, []);
    const hit = s.creatures.find(c => c.id === victim.id)!;
    expect(hit.conditions.some(c => c.kind === 'Bleeding' && c.endsTurn === null)).toBe(true);
    const hp = hit.hp;
    ongoingDamage(s, []);
    expect(hit.hp).toBe(hp - 1);
    if (illusion) {
      reverseIllusion(s, tiger.id, []);
      expect(hit.hp).toBe(10);
      expect(hit.conditions).toEqual([]);
    }
    expect(tiger.attacks[0]!.shots[0]!.crit).toBe(15);
    expect(tiger.defences).toContainEqual({ type: 'cold', multiplier: 0.5 });
  },
);
