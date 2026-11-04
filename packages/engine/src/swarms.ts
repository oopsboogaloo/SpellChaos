import type { Creature, GameState } from '../../domain/src/state.js';
import { placement, swarmCoveredTargets } from '../../geometry/src/occupancy.js';
import { emit, type Event } from './events.js';

export function swarmSizeForHealth(c: Creature): number {
 return Math.max(1, c.originalSize - (c.hp * 2 < c.maxHp ? 2 : 0) - (c.hp * 4 < c.maxHp ? 2 : 0));
}

/** Coverage is derived, so no hold can survive a movement, size or height change. */
export function restrainedBySwarm(s: GameState, target: Creature): boolean {
 if (!target.alive) return false;
 return s.creatures.some(c => c.swarm && c.alive && c.hp > 0 &&
  !(c.kind === 'illusion' && target.intelligence === 0) && swarmCoveredTargets(c, s.creatures.filter(t=>t.alive)).includes(target.id));
}

/** HP changes immediately; legal growth can wait until the next turn starts. */
export function resizeSwarm(s: GameState, c: Creature, events: Event[], allowGrowth: boolean): void {
 if (!c.swarm || !c.alive || c.hp <= 0) return;
 const wanted = swarmSizeForHealth(c), previous = c.size;
 if (wanted < c.size) c.size = wanted;
 else if (allowGrowth && wanted > c.size) {
  const arena = { board: s.board, walls: s.walls, creatures: s.creatures.filter(c => c.alive) };
  for (let size = wanted; size > c.size; size--) {
   if (placement(arena, { ...c, size }, c.centre).legal) { c.size = size; break; }
  }
 }
 if (previous !== c.size) emit(s, events, { type: 'SwarmResized', creatureId: c.id, action: `${previous}->${c.size}` });
}

export function regrowSwarms(s: GameState, events: Event[]): void {
 for (const c of [...s.creatures].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) resizeSwarm(s, c, events, true);
}
