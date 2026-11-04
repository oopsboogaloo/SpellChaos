import { encodeSnapshot } from './snapshot.js';
import type { GameState } from '../../domain/src/state.js';

/** Portable FNV-1a-32 fingerprint for replay divergence, not cryptographic integrity. */
export function stateFingerprint(state: GameState): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(encodeSnapshot(state))) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return 'fnv1a32-v1:' + hash.toString(16).padStart(8, '0');
}
