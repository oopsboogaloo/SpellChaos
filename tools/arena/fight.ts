/** One-on-one creature fights driven by the game's own AI, for balance numbers. */
import { createMatch, createCreature, applySystemCommand, systemCommand } from '../../packages/engine/src/index.js';
import { advanceAtomicStep } from '../../packages/engine/src/resolver.js';
import { submitAiTurn } from '../../packages/ai/src/coordinator.js';
import { summonProfile } from '../../packages/content/src/summons.js';
import { summonFamilies, type SpellFamily } from '../../packages/domain/src/spells.js';
import type { Event } from '../../packages/engine/src/events.js';

export interface Fighter {
  key: string;
  species: string;
  spell: SpellFamily;
  level: number;
}
/** Every creature that can currently be summoned. */
export function roster(): Fighter[] {
  const list: Fighter[] = [];
  for (const family of summonFamilies)
    for (let level = 1; level <= 8; level++) {
      const spell = `Summon ${family}` as SpellFamily,
        profile = summonProfile(spell, level);
      if (profile) list.push({ key: `${family}:${level}`, species: profile.species!, spell, level });
    }
  return list;
}
export interface Side {
  attacks: number;
  hits: number;
  crits: number;
  dealt: number;
  taken: number;
  hpLeft: number;
  maxHp: number;
}
export interface FightResult {
  a: string;
  b: string;
  seed: number;
  winner: 'a' | 'b' | 'draw';
  turns: number;
  sides: { a: Side; b: Side };
}
const down = (c: { alive: boolean; hp: number } | undefined) => !c || !c.alive || c.hp <= 0;

/** A against B, ten hexes apart on an open board, until one is down or the turn cap. */
export function fight(a: Fighter, b: Fighter, seed: number, turnCap = 40): FightResult {
  let s = createMatch(`arena-${seed}`, ['a', 'b'], seed);
  s.creatures = [
    createCreature('A', 'a', { q: 8, r: 15 }, { ...summonProfile(a.spell, a.level)!, bindingLevel: a.level }),
    createCreature('B', 'b', { q: 18, r: 15 }, { ...summonProfile(b.spell, b.level)!, bindingLevel: b.level }),
  ];
  const events: Event[] = [];
  let turns = 0;
  for (; turns < turnCap; turns++) {
    const [ca, cb] = ['A', 'B'].map(id => s.creatures.find(c => c.id === id));
    if (down(ca) || down(cb)) break;
    s = submitAiTurn(s, ['a', 'b']).state;
    const started = applySystemCommand(s, systemCommand(s, 'StartResolution', `start-${s.turn}`));
    s = started.state;
    events.push(...started.events);
    for (let n = 0; !['planning', 'ended'].includes(s.phase); n++) {
      if (n > 20000) throw new Error('STEP_LIMIT');
      const r = advanceAtomicStep(s);
      s = r.state;
      events.push(...r.events);
    }
  }
  const side = (id: string, other: string): Side => {
    const c = s.creatures.find(x => x.id === id);
    const mine = events.filter(e => e.creatureId === id);
    return {
      attacks: mine.filter(e => e.type === 'AttackHit' || e.type === 'AttackMissed').length,
      hits: mine.filter(e => e.type === 'AttackHit').length,
      crits: mine.filter(e => e.type === 'AttackHit' && e.critical).length,
      // Damage to the opponent from this creature, by any means (attacks, powers, spells, retaliation).
      dealt: events
        .filter(e => e.type === 'DamageApplied' && e.creatureId === other && e.sourceId === id)
        .reduce((n, e) => n + (e.amount ?? 0), 0),
      taken: mine.filter(e => e.type === 'DamageApplied').reduce((n, e) => n + (e.amount ?? 0), 0),
      hpLeft: c ? Math.max(0, c.hp) : 0,
      maxHp: c?.maxHp ?? 0,
    };
  };
  const [ca, cb] = ['A', 'B'].map(id => s.creatures.find(c => c.id === id));
  const winner = down(ca) && !down(cb) ? 'b' : down(cb) && !down(ca) ? 'a' : 'draw';
  return { a: a.key, b: b.key, seed, winner, turns, sides: { a: side('A', 'B'), b: side('B', 'A') } };
}
