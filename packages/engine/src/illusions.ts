import type { Creature, GameState } from '../../domain/src/state.js';
import { resizeSwarm } from './swarms.js';
import { emit, type Event } from './events.js';

export const isLethal = (c: Creature) => !c.alive || c.hp <= (c.swarm ? 0 : -c.maxHp);
export function knowsIllusion(c: Creature, playerId: string): boolean {
  return c.kind === 'illusion' && (c.controller === playerId || c.knownIllusionBy.includes(playerId));
}

/** Trusted ability entry; player commands cannot request unrestricted detection. */
export function detectIllusion(s: GameState, creatureId: string, playerId: string, events: Event[]): boolean {
  if (!s.players.some(p => p.id === playerId)) throw new Error('UNKNOWN_PLAYER');
  const c = s.creatures.find(c => c.id === creatureId);
  if (!c?.alive || c.kind !== 'illusion') return false;
  if (!c.knownIllusionBy.includes(playerId)) {
    c.knownIllusionBy.push(playerId);
    emit(s, events, { type: 'IllusionDetected', creatureId: c.id, playerId });
  }
  return true;
}

/** Heal oldest reversible loss first, then real recorded loss; baseline injuries are real. */
export function consumeDamageLoss(s: GameState, targetId: string, amount: number): void {
  const entries = s.damageLedger
    .filter(d => d.targetId === targetId && d.remaining > 0)
    .sort((a, b) => Number(b.illusionId !== null) - Number(a.illusionId !== null) || a.sequence - b.sequence);
  for (const entry of entries) {
    const consumed = Math.min(amount, entry.remaining);
    entry.remaining -= consumed;
    amount -= consumed;
    if (!amount) break;
  }
}

/** Idempotent removal. Death cleanup freezes lethal victims before invoking this. */
export function reverseIllusion(s: GameState, sourceId: string, events: Event[]): void {
  const restored = new Map<string, number>();
  for (const record of s.damageLedger.filter(d => d.illusionId === sourceId && d.remaining > 0)) {
    const c = s.creatures.find(c => c.id === record.targetId)!;
    if (!isLethal(c)) {
      const amount = Math.min(record.remaining, c.maxHp - c.hp);
      c.hp += amount;
      restored.set(c.id, (restored.get(c.id) ?? 0) + amount);
    }
    record.remaining = 0;
  }
  for (const c of s.creatures) {
    c.conditions = c.conditions.filter(e => e.illusionId !== sourceId);
    if (restored.has(c.id)) {
      resizeSwarm(s, c, events, true);
      emit(s, events, { type: 'DamageReversed', creatureId: c.id, amount: restored.get(c.id)! });
    }
  }
  s.holds = s.holds.filter(h => h.grapplerId !== sourceId);
}
