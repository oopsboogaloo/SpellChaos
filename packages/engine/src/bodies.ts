import type { Creature, GameState } from '../../domain/src/state.js';
import { footprint, type Hex } from '../../geometry/src/hex.js';
/** Centre overrides support previews and Guard's previous-position test. */
export const bodySize = (s: GameState, c: Creature) =>
  c.mountId ? s.creatures.find(m => m.id === c.mountId)!.size : c.size;
export const bodyFootprint = (s: GameState, c: Creature, centre: Hex = c.centre) => footprint(centre, bodySize(s, c));
